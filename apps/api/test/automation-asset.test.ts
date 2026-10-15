// The asset chip on an automation draft (the universal picker): a scheduled send's currency is changed on the draft
// (re-drafted, nothing on), a DCA's token is changed on its draft, and an asset that kind does not take is refused.
// Needs the root .env (Arc testnet RPC). Run: pnpm --filter @kawase/api exec tsx --test test/automation-asset.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.DATABASE_URL && process.env.RELAYER_PRIVATE_KEY_TESTNET);

test("automation drafts: change the asset from the card", { skip: !live, timeout: 120_000 }, async () => {
  const env = loadApiEnv();
  const network = getNetwork("testnet");
  const wallet = privateKeyToAccount(generatePrivateKey());
  const friend = privateKeyToAccount(generatePrivateKey()).address;
  const TEST_ID = randomUUID();
  const person = privyPerson(`auto-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(createChains(env));
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "auto-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  // A scheduled send drafted in USDC; the chip picks EURC: the same draft, re-drafted in EURC.
  const created = await call("POST", "/automations", { recipient: friend, amount: "2", every: "week" });
  await expectStatus(created, 201, "draft");
  const draft = ((await created.json()) as { automation: AutomationView }).automation;
  assert.equal(draft.status, "draft");
  const edited = ((await (await call("PATCH", `/automations/${draft.id}`, { asset: "EURC" })).json()) as { automation: AutomationView }).automation;
  assert.equal(edited.id, draft.id);
  assert.equal(edited.action?.asset, "EURC");
  assert.equal(edited.status, "draft");

  // A token a scheduled send cannot take (only a DCA buys tokens) is refused with its reason.
  await expectStatus(await call("PATCH", `/automations/${draft.id}`, { to: network.addresses.eurc }), 422, "a send has no token to buy");

  // A DCA drafted to buy EURC with USDC; the chip picks another token to buy.
  const dcaCreated = await call("POST", "/automations/dca", { from: "USDC", to: "EURC", amount: "1", every: "week" });
  await expectStatus(dcaCreated, 201, "dca draft");
  const dca = ((await dcaCreated.json()) as { automation: AutomationView }).automation;
  const usyc = network.addresses.usyc;
  const retargeted = await call("PATCH", `/automations/${dca.id}`, { to: usyc });
  await expectStatus(retargeted, 200, "dca token");
  const after_ = ((await retargeted.json()) as { automation: AutomationView }).automation;
  assert.equal(after_.dca?.tokenOut.toLowerCase(), usyc.toLowerCase());
});
