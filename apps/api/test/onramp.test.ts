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
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
// Kawase's buy page lives here in this test; the order's page URL is built from it.
const PAGE_URL = "https://app.test.local";
const live = Boolean(process.env.DATABASE_URL && process.env.CIRCLE_TEST_API_KEY);

test("onramp: a sandbox session, hints that only move the status, settlement by the chain", { skip: !live, timeout: 120_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  const TEST_ID = randomUUID();
  const person = privyPerson(`buy-${TEST_ID}@example.test`, wallet);
  const { app, db, close } = testApp(undefined, undefined, undefined, undefined, undefined, undefined, { onramp: circleOnramp(loadApiEnv()), onrampPageUrl: PAGE_URL });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const guest = (await (await app.request("/onramp")).json()) as OnrampAvailability;
  assert.equal(guest.available, false);

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "onramp-test-phone-01" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  const availability = (await (await call("GET", "/onramp")).json()) as OnrampAvailability;
  assert.deepEqual([availability.available, availability.sandbox], [true, true]);
  assert.deepEqual(availability.engines?.map((engine) => [engine.id, engine.delivers, engine.bridgesToArc]), [["circle", "arc", false]], "Coinbase is not offered without CDP keys");

  const started = await call("POST", "/onramp/orders", { amount: "20", then: "cirBTC", frame: "page" });
  await expectStatus(started, 201, "start");
  const { order, widgetUrl, pageUrl, destinationChain, engine } = (await started.json()) as OnrampStartResponse;
  assert.deepEqual([engine, destinationChain, order.engine, order.stage, order.deliveryChain], ["circle", "Arc", "circle", "paying", "arc"]);
  assert.equal(new URL(widgetUrl).origin, "https://onramp-sandbox.arc.io");
  assert.ok(new URL(widgetUrl).searchParams.get("sessionToken"));
  assert.deepEqual([order.asset, order.thenToken, order.status], ["USDC", "cirBTC", "created"]);
  console.log(`sandbox session: ${new URL(widgetUrl).origin}, destinationChain ${destinationChain}, pairs ${new URL(widgetUrl).searchParams.get("pairs")}, order ${order.id}`);

  // Kawase's buy page has no sign-in: its key (in the URL fragment, sent as the bearer) opens exactly this order.
  assert.ok(pageUrl?.startsWith(`https://app.test.local/buy/${order.id}#k=kbuy_`), "page url");
  const pageKey = pageUrl!.split("#k=")[1]!;
  const page = (method: string, path: string, payload?: unknown, bearer = pageKey) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${bearer}` } } : jsonRequest(method, payload, bearer));
  assert.equal(((await (await page("GET", `/onramp/orders/${order.id}`)).json()) as { order: OnrampOrderView }).order.id, order.id);
  const remint = await page("POST", `/onramp/orders/${order.id}/session`);
  await expectStatus(remint, 200, "re-mint");
  const fresh = (await remint.json()) as { widgetUrl: string; destinationChain: string; engine: string };
  assert.deepEqual([new URL(fresh.widgetUrl).origin, fresh.destinationChain, fresh.engine], ["https://onramp-sandbox.arc.io", "Arc", "circle"]);
  await expectStatus(await page("POST", `/onramp/orders/${order.id}/events`, { event: "INITIALIZATION_SUCCESS" }), 200, "page event");
  assert.equal((await page("GET", "/onramp")).status, 200, "public availability is open to anyone");
  assert.equal((await page("POST", "/onramp/orders", { amount: "20" })).status, 401, "the key cannot start a purchase");
  assert.equal((await page("GET", `/onramp/orders/${order.id}`, undefined, `${pageKey}x`)).status, 401, "a wrong key is refused");
  assert.equal((await page("GET", `/onramp/orders/${randomUUID()}`)).status, 401, "the key opens only its own order");
  assert.equal((await page("GET", "/wallet")).status, 401, "and nothing outside the onramp's order paths");

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
