// Buy with Apple Pay / card through the api: a signed-in person on testnet starts a purchase and gets a real Circle
// Onramp sandbox session (minted live with the TEST key); the browser's hints move the status only; the order
// settles when the watcher records the delivery on chain (a chain_events row here, as the watcher writes it), and a
// delivery far off the amount asked for is not taken for it. Skipped without DATABASE_URL or CIRCLE_TEST_API_KEY.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { OnrampAvailability, OnrampOrderView, OnrampStartResponse } from "@kawase/api-client";
import { chainEvents } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";

import { circleOnramp } from "../src/onramp/engine";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
const live = Boolean(process.env.DATABASE_URL && process.env.CIRCLE_TEST_API_KEY);

test("onramp: a sandbox session, hints that only move the status, settlement by the chain", { skip: !live, timeout: 120_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const key = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "buyer", email: `buy-${SUB_ORG}@example.test`, sessionPublicKeys: [key.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet }] },
  );
  const { app, db, close } = testApp(turnkey, undefined, undefined, undefined, undefined, undefined, undefined, { onramp: circleOnramp(loadApiEnv()) });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const guest = (await (await app.request("/onramp")).json()) as OnrampAvailability;
  assert.equal(guest.available, false);

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "onramp-test-phone-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet, walletId: "wallet-1" }), 201, "register");

  const availability = (await (await call("GET", "/onramp")).json()) as OnrampAvailability;
  assert.deepEqual([availability.available, availability.sandbox], [true, true]);

  const started = await call("POST", "/onramp/orders", { amount: "20", then: "cirBTC" });
  await expectStatus(started, 201, "start");
  const { order, widgetUrl } = (await started.json()) as OnrampStartResponse;
  assert.equal(new URL(widgetUrl).origin, "https://onramp-sandbox.arc.io");
  assert.ok(new URL(widgetUrl).searchParams.get("sessionToken"));
  assert.deepEqual([order.asset, order.thenToken, order.status], ["USDC", "cirBTC", "created"]);
  console.log(`sandbox session: ${new URL(widgetUrl).origin}, order ${order.id}`);

  const hinted = (await (await call("POST", `/onramp/orders/${order.id}/events`, { event: "DEPOSIT_SUBMITTED", code: "DEPOSIT_SUBMITTED" })).json()) as { order: OnrampOrderView };
  assert.equal(hinted.order.status, "submitted");
  const claimed = (await (await call("POST", `/onramp/orders/${order.id}/events`, { event: "DEPOSIT_SETTLED", code: "DEPOSIT_SETTLED" })).json()) as { order: OnrampOrderView };
  assert.equal(claimed.order.status, "submitted", "a browser event never settles");

  // The watcher records two arrivals: a stray 3 USDC (not this purchase) and 19.40 USDC (20 USD less fees).
  const row = (amount: bigint, logIndex: number) => ({ userId, network: "testnet" as const, chainId: 5042002, blockNumber: 1n, txHash: `0x${"ab".repeat(32)}`, logIndex, asset: "USDC", fromAddress: wallet, toAddress: wallet, amount });
  await db.insert(chainEvents).values([row(3_000_000n, 1), row(19_400_000n, 2)]);
  const settled = (await (await call("GET", `/onramp/orders/${order.id}`)).json()) as { order: OnrampOrderView };
  assert.deepEqual([settled.order.status, settled.order.received], ["settled", "19400000"]);
});
