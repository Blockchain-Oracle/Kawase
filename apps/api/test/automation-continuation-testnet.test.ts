// Automation drafts carry on through their fixes (review K03): a guest asks for a scheduled send and for Auto-save in
// chat; each is a real draft holding the request as asked. They sign in (the guest becomes the account), the person
// they named is added, the wallet is set up — and after each fix the same draft is checked again, with the amount,
// the recipient and the amount to keep exactly as they said them, until it is ready to turn on. Nothing turns on by
// itself. Reads Arc testnet (balances, the vaults); moves no money. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationView } from "@kawase/api-client";
import { automations, users } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { eq } from "drizzle-orm";

import { AutomationService } from "../src/automations/service";
import { ContactService } from "../src/contacts/service";
import { appKitEarn } from "../src/earn/engine";
import { EarnService } from "../src/earn/service";
import { InboxService } from "../src/inbox/service";
import { RequestService } from "../src/requests/service";
import { Recipients } from "../src/send/recipients";
import { SendService } from "../src/send/service";
import type { SessionUser } from "../src/types";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, noOps, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const usdc = (value: string) => parseUnits(value, 6).toString();

test("automation drafts carry on through sign-in, a new contact and wallet setup, as asked", { skip: !live, timeout: 300_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const wallet = privateKeyToAccount(generatePrivateKey());
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "continuer", email: `continue-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, noOps, undefined, undefined, appKitEarn(env));
  // The service the agent's tools use, built the way the api builds it.
  const log = createLogger({ service: "continuation-test", level: (process.env.TEST_LOG_LEVEL ?? "silent") as "silent" });
  const wallets = new WalletService(db, chains);
  const contacts = new ContactService(db);
  const recipients = new Recipients(db, contacts);
  const inbox = new InboxService(db, chains);
  const requests = new RequestService(db, chains, wallets, inbox, "http://localhost:8081");
  const sends = new SendService(db, chains, wallets, contacts, recipients, noOps, log, requests, inbox);
  const earn = new EarnService(db, chains, wallets, appKitEarn(env), log, noOps);
  const service = new AutomationService(db, chains, wallets, recipients, sends, earn, inbox, log);
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const sessionUser = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0] as unknown as SessionUser;

  // 1. A guest asks in chat. Each request becomes a real draft, blocked on signing in, holding what they said.
  const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { platform: "ios", installationId: "continue-test-phone1" } }));
  const { token: guestToken, user: guestUser } = (await guest.json()) as { token: string; user: { id: string } };
  userId = guestUser.id;
  const asGuest = await sessionUser(guestUser.id);
  const send = await service.create(asGuest, { recipient: "Bob", amount: "1.5", every: "week", weekday: 2, time: "08:30" });
  const save = await service.createAutoSave(asGuest, { keep: "7" });
  for (const draft of [send, save]) {
    assert.ok(draft.id, "a real draft, not a placeholder");
    assert.equal(draft.status, "draft");
    assert.equal(draft.blocking?.code, "SIGN_IN_REQUIRED");
  }
  assert.equal(send.action?.amount, usdc("1.5"), "the amount they said is kept");
  assert.equal(save.save?.keep, usdc("7"));

  // 2. They sign in: the guest becomes the account, and its drafts with it.
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request(
    "/auth/turnkey",
    jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "continue-test-phone1" } }, guestToken),
  );
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  assert.equal(user.id, guestUser.id);
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const recheck = async (id: string) => ((await (await call("POST", `/automations/${id}/recheck`)).json()) as { automation: AutomationView }).automation;

  // The same drafts, checked again after each fix; each time the card names the next one, the request unchanged.
  // Signed in → the wallet is next.
  let sendNow = await recheck(send.id);
  assert.equal(sendNow.id, send.id);
  assert.equal(sendNow.blocking?.code, "WALLET_NOT_READY", JSON.stringify(sendNow.results));
  assert.equal(sendNow.action?.amount, usdc("1.5"));
  assert.equal(sendNow.schedule.weekday, 2);
  assert.equal(sendNow.schedule.time, "08:30");

  // The wallet exists → it is not set up yet.
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  sendNow = await recheck(send.id);
  assert.equal(sendNow.blocking?.code, "WALLET_NOT_SET_UP", JSON.stringify(sendNow.results));
  let saveNow = await recheck(save.id);
  assert.equal(saveNow.blocking?.code, "WALLET_NOT_SET_UP", JSON.stringify(saveNow.results));

  // Set up → Auto-save is ready; the send still needs to know who Bob is.
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  const ready = (draft: AutomationView) => draft.blocking === null || draft.blocking.kind === "warning";
  saveNow = await recheck(save.id);
  assert.ok(ready(saveNow), JSON.stringify(saveNow.blocking));
  sendNow = await recheck(send.id);
  assert.equal(sendNow.blocking?.code, "RECIPIENT_UNKNOWN", JSON.stringify(sendNow.results));

  // They add Bob from the card → the same draft knows who Bob is, and is ready — still not on.
  const bob = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Bob", address: bob, source: "pasted" }), 201, "bob");
  sendNow = await recheck(send.id);
  assert.equal(sendNow.action?.recipientAddress?.toLowerCase(), bob.toLowerCase());
  // A new address is a warning on the card, never a blocker for a weekly 1.5.
  assert.ok(ready(sendNow), JSON.stringify(sendNow.blocking));
  assert.equal(sendNow.status, "draft", "a fix never turns it on");
  assert.equal(saveNow.status, "draft");
  assert.equal(sendNow.action?.amount, usdc("1.5"));
  assert.equal(saveNow.save?.keep, usdc("7"));

  // The automation stays on the network it was asked on.
  const [row] = await db.select().from(automations).where(eq(automations.id, send.id));
  assert.equal(row!.network, "testnet");
});
