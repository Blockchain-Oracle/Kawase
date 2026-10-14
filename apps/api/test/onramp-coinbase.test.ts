// Buying with Coinbase through the order service, against a stand-in provider (no CDP keys, no money): the order records
// its engine and delivery, the provider's state moves it, a delivery on Base starts Bring-to-Arc exactly once, and only
// the money seen arriving on Arc settles it. A sandbox order never settles; a leg that fails to start can be retried;
// the buy page's key opens one order and nothing else. Needs DATABASE_URL (a scratch database).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { OnrampOrderView } from "@kawase/api-client";
import { chainEvents, users } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { noChains, deleteUser, fakeTurnkey, jsonRequest, testApp } from "./helpers";
import type { CrossChainService } from "../src/crosschain/service";
import { crossChainPort } from "../src/onramp/bridge-port";
import { onrampRouter, type ProviderEngine, type ProviderOrderState } from "../src/onramp/engine";
import { OnrampService, type CrossChainPort } from "../src/onramp/service";
import type { SessionUser } from "../src/types";
import type { WalletService } from "../src/wallet/service";

const live = Boolean(process.env.DATABASE_URL);
const wallet = privateKeyToAccount(generatePrivateKey()).address;
const log = createLogger({ service: "onramp-coinbase-test", level: "silent" });

// The crosschain service's `create` is what the port calls: this fails to compile if its shape drifts.
const _port: Parameters<typeof crossChainPort>[1] = null as unknown as Pick<CrossChainService, "create">;
void _port;

function fakeCoinbase(state: { current: ProviderOrderState; sandbox: boolean; minted: number }): ProviderEngine {
  return {
    id: "coinbase",
    delivers: "base",
    weeklyLimitUsd: 500,
    configured: () => true,
    sandbox: () => state.sandbox,
    methods: () => ["apple_pay", "google_pay"],
    mint: async (_network, input) => {
      state.minted++;
      assert.equal(input.contact?.smsVerificationId, "onramp_verification_sms");
      assert.equal(input.method, "apple_pay");
      return { engine: "coinbase", widgetUrl: "https://pay.example.test/apple-pay/1", expiresAt: new Date(Date.now() + 600_000).toISOString(), traceId: `cb-${state.minted}`, providerOrderId: `cb-order-${randomUUID()}`, destinationChain: "base" };
    },
    orderState: async () => state.current,
  };
}

test("coinbase orders: Base delivery starts the Arc leg once, the Arc arrival settles, a sandbox never does", { skip: !live, timeout: 120_000 }, async () => {
  const { app, db, close } = testApp(fakeTurnkey({}));
  const guest = (await (await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }))).json()) as { user: { id: string } };
  const userId = guest.user.id;
  after(async () => {
    await deleteUser(db, userId);
    await close();
  });
  await db.update(users).set({ isAnonymous: false, email: `cb-${userId.slice(0, 8)}@example.test`, activeNetwork: "testnet" }).where(eq(users.id, userId));
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  const user = row as unknown as SessionUser;

  const state = { current: { state: "pending", txHash: null, raw: "ONRAMP_ORDER_STATUS_PENDING_PAYMENT", purchaseAmount: "47.20" } as ProviderOrderState, sandbox: false, minted: 0 };
  const walletService = { userWallet: async () => ({ address: wallet }) } as unknown as WalletService;
  const service = new OnrampService(db, noChains, walletService, onrampRouter([fakeCoinbase(state)]), log, undefined, { pageBaseUrl: "https://app.test.local", providerPollMs: 0 });
  const bridged: { userId: string; amount: bigint }[] = [];
  let failNext = false;
  const port: CrossChainPort = {
    bringToArc: async (who, _network, input) => {
      if (failNext) {
        failNext = false;
        throw new Error("crosschain is busy");
      }
      bridged.push({ userId: who, amount: input.amount });
      return { intentId: randomUUID() };
    },
  };
  service.setCrossChain(port);

  const contact = { phone: "+15555550123", smsVerificationId: "onramp_verification_sms", emailVerificationId: "onramp_verification_mail", acceptedTerms: true as const };
  // Refused before anything is minted: no verification, no amount.
  await assert.rejects(service.start(user, { engine: "coinbase", amount: "50" }, "app"), /verify your phone and email first/);
  await assert.rejects(service.start(user, { engine: "coinbase", coinbase: contact }, "app"), /an amount is needed/);
  await assert.rejects(service.start(user, { engine: "coinbase", amount: "50", coinbase: contact, destination: "agent_wallet" }, "app"));
  assert.equal(state.minted, 0);

  const availability = await service.availability(user);
  assert.deepEqual(availability.engines?.map((entry) => [entry.id, entry.delivers, entry.bridgesToArc, entry.weeklyLimitUsd]), [["coinbase", "base", true, 500]]);

  const started = await service.start(user, { engine: "coinbase", amount: "50", coinbase: contact }, "app");
  assert.equal(started.widgetUrl, "https://pay.example.test/apple-pay/1");
  assert.match(started.pageUrl ?? "", /^https:\/\/app\.test\.local\/buy\/[0-9a-f-]{36}#k=kbuy_/);
  const { order } = started;
  assert.deepEqual([order.engine, order.method, order.deliveryChain, order.asset, order.stage, order.status], ["coinbase", "apple_pay", "base", "USDC", "paying", "created"]);

  // The pay page reports; the provider's word moves the order; neither settles it.
  const after1 = await service.event(userId, order.id, { event: "onramp_api.commit_success" });
  assert.deepEqual([after1.status, after1.stage], ["submitted", "buying"]);
  state.current = { state: "processing", txHash: null, raw: "ONRAMP_ORDER_STATUS_PROCESSING", purchaseAmount: "47.20" };
  assert.equal((await service.get(userId, order.id)).stage, "buying");
  assert.equal(bridged.length, 0);

  // Coinbase delivers to Base: two reads at once still start one leg.
  state.current = { state: "completed", txHash: `0x${"cd".repeat(32)}`, raw: "ONRAMP_ORDER_STATUS_COMPLETED", purchaseAmount: "47.20" };
  const [a, b] = await Promise.all([service.get(userId, order.id), service.get(userId, order.id)]);
  assert.ok([a, b].some((view) => view.stage === "bridging"));
  const bridging = await service.get(userId, order.id);
  assert.deepEqual([bridging.stage, bridging.deliveryTx, bridging.bridge?.state, bridging.status], ["bridging", `0x${"cd".repeat(32)}`, "started", "submitted"]);
  assert.ok(bridging.bridge?.intentId);
  assert.deepEqual(bridged, [{ userId, amount: 47_200_000n }], "one leg, for exactly what was delivered");

  // Not settled by anything but Arc: a stray 3 USDC is not it; 47.1 USDC (after the leg's fee) is.
  const arrival = (amount: bigint, logIndex: number) => ({ userId, network: "testnet" as const, chainId: 5042002, blockNumber: 1n, txHash: `0x${"ef".repeat(32)}`, logIndex, asset: "USDC", fromAddress: wallet, toAddress: wallet, amount });
  await db.insert(chainEvents).values(arrival(3_000_000n, 1));
  assert.equal((await service.get(userId, order.id)).status, "submitted");
  await db.insert(chainEvents).values(arrival(47_100_000n, 2));
  const settled = await service.get(userId, order.id);
  assert.deepEqual([settled.status, settled.stage, settled.received], ["settled", "arrived", "47100000"]);

  // A leg that cannot start is retried on the next look (the money waits on Base at the person's own address).
  failNext = true;
  const second = await service.start(user, { engine: "coinbase", amount: "20", coinbase: contact }, "app");
  state.current = { state: "completed", txHash: `0x${"aa".repeat(32)}`, raw: "ONRAMP_ORDER_STATUS_COMPLETED", purchaseAmount: "19.40" };
  const stuck = await service.get(userId, second.order.id);
  assert.deepEqual([stuck.stage, stuck.bridge?.state], ["on_base", "failed"]);
  const retried = await service.get(userId, second.order.id);
  assert.deepEqual([retried.stage, retried.bridge?.state], ["bridging", "started"]);
  assert.equal(bridged.at(-1)!.amount, 19_400_000n);

  // The buy page's key reads its own order and nothing else.
  const key = started.pageUrl!.split("#k=")[1]!;
  assert.equal(await service.pageKeyUser(order.id, key), userId);
  assert.equal(await service.pageKeyUser(second.order.id, key), undefined, "another order's key does not open this one");
  assert.equal(await service.pageKeyUser(order.id, `${key}x`), undefined);
  assert.equal(await service.pageKeyUser(order.id, "kbuy_nope"), undefined);

  // The app opens the page again (a deep link): a new key for the owner, and the old one stops working. An order still
  // being carried to Arc is open for it; a stranger is not.
  const oldKey = second.pageUrl!.split("#k=")[1]!;
  const reopened = await service.page(userId, second.order.id);
  const newKey = reopened.pageUrl.split("#k=")[1]!;
  assert.ok(reopened.pageUrl.startsWith(`https://app.test.local/buy/${second.order.id}#k=kbuy_`));
  assert.equal(await service.pageKeyUser(second.order.id, newKey), userId);
  assert.equal(await service.pageKeyUser(second.order.id, oldKey), undefined, "the old key is retired");
  await assert.rejects(service.page(randomUUID(), second.order.id), /no such purchase/);

  // A sandbox order completes at Coinbase without any money: it ends as a test, never as funds.
  state.sandbox = true;
  state.current = { state: "pending", txHash: null, raw: "ONRAMP_ORDER_STATUS_PENDING_PAYMENT", purchaseAmount: "47.20" };
  const sandboxed = await service.start(user, { engine: "coinbase", amount: "10", coinbase: contact }, "app");
  state.current = { state: "completed", txHash: `0x${"bb".repeat(32)}`, raw: "ONRAMP_ORDER_STATUS_COMPLETED", purchaseAmount: "9.70" };
  const ended = await service.get(userId, sandboxed.order.id);
  assert.deepEqual([ended.status, ended.reason, ended.bridge], ["not_completed", "SANDBOX_NO_FUNDS", null]);

  // A failed order closes with the provider's reason; one that was never paid when the person backed out too.
  state.sandbox = false;
  state.current = { state: "pending", txHash: null, raw: "ONRAMP_ORDER_STATUS_PENDING_PAYMENT", purchaseAmount: null };
  const failing = await service.start(user, { engine: "coinbase", amount: "10", coinbase: contact }, "app");
  state.current = { state: "failed", txHash: null, raw: "ONRAMP_ORDER_STATUS_FAILED", purchaseAmount: null };
  assert.deepEqual([(await service.get(userId, failing.order.id)).status, (await service.get(userId, failing.order.id)).reason], ["not_completed", "PAYMENT_PROVIDER_ERROR"]);
  state.current = { state: "pending", txHash: null, raw: "ONRAMP_ORDER_STATUS_PENDING_PAYMENT", purchaseAmount: null };
  const cancelled = await service.start(user, { engine: "coinbase", amount: "10", coinbase: contact }, "app");
  const backed = (await service.event(userId, cancelled.order.id, { event: "onramp_api.cancel" })) as OnrampOrderView;
  assert.deepEqual([backed.status, backed.reason], ["not_completed", "onramp_api.cancel"]);
  await assert.rejects(service.page(userId, cancelled.order.id), /no longer open/, "a closed purchase has no page to reopen");
});
