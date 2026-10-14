// The New automation screen's templates, drafted through the api exactly as the app sends them (no chat): a scheduled
// send, a recurring buy, Keep & save, round-ups, a low-balance alert and "save above a line". Each comes back as a
// draft of the right kind with its read-back, nothing turned on and nothing moved. A fresh wallet set up on Arc testnet.
// Skipped without the server keys in the root .env. Run alone: tsx --test test/automation-templates-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);

test("every New automation template drafts the right kind through the api", { skip: !live, timeout: 300_000 }, async () => {
  const env = loadApiEnv();
  const network = getNetwork("testnet");
  const wallet = privateKeyToAccount(generatePrivateKey());
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "templates", email: `templates-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, createChains(env));
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "templates-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signed = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signed.address, chainId: signed.chainId, nonce: signed.nonce, r: signed.r, s: signed.s, yParity: signed.yParity } }), 200, "setup");

  const timezone = "Europe/London";
  const friend = privateKeyToAccount(generatePrivateKey()).address;
  const templates: [string, string, unknown, AutomationView["kind"]][] = [
    ["send", "/automations", { recipient: friend, amount: "1.5", asset: "USDC", every: "week", weekday: 5, time: "09:00", timezone }, "scheduled_send"],
    ["dca", "/automations/dca", { from: "USDC", to: network.addresses.eurc, amount: "2", every: "day", time: "08:30", timezone }, "dca"],
    ["save", "/automations/auto-save", { keep: "5", timezone }, "auto_save"],
    ["roundups", "/automations/rule", { trigger: "money_out", action: "save", amountMode: "roundup", roundTo: "1" }, "rule"],
    ["alert", "/automations/rule", { trigger: "balance_below", threshold: "3", action: "notify" }, "rule"],
    ["save_above", "/automations/rule", { trigger: "balance_above", threshold: "10", action: "save", amountMode: "excess" }, "rule"],
  ];
  for (const [name, path, payload, kind] of templates) {
    const response = await call("POST", path, payload);
    assert.ok(response.status === 200 || response.status === 201, `${name}: ${response.status} ${await response.clone().text()}`);
    const { automation } = (await response.json()) as { automation: AutomationView };
    assert.equal(automation.kind, kind, name);
    assert.equal(automation.status, "draft", `${name} is a draft until the person turns it on`);
    console.log(name, automation.kind, automation.blocking?.code ?? "ready");
  }
  // The scheduled send pinned the address typed, and the recurring buy resolved the token by address.
  const { automations } = (await (await call("GET", "/automations")).json()) as { automations: AutomationView[] };
  assert.equal(automations.filter((entry) => entry.status === "draft").length, templates.length);
  assert.equal(automations.find((entry) => entry.kind === "scheduled_send")?.action?.recipientAddress?.toLowerCase(), friend.toLowerCase());
  assert.equal(automations.find((entry) => entry.kind === "dca")?.dca?.symbolOut, "EURC");
});
