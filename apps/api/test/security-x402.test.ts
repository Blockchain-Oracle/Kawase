// H1 (security review 2026-10-03): an x402 purchase pays only what was checked. The seller's 402 can offer a cheap
// option and a pricier one; the caps were checked on the cheapest while the option chosen to pay (Gateway, because it
// had the balance) could cost more. Every check now runs again on the chosen option's own price, a yes covers no
// more than the price the person saw, and the budget check and the "paying" row are one step under the person's lock.
// No chain and no Circle: the seller, Gateway's balance API and the agent wallet are in memory; the database is real.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { config } from "dotenv";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { and, eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";

import { createDb, marketplacePurchases, marketplaceSettings, users, wallets } from "@kawase/db";
import { sellerFetch, type Discovery, type Listing } from "@kawase/integrations-x402";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import type { AgentWalletProvider } from "../src/marketplace/agent-wallets";
import { MarketplaceService } from "../src/marketplace/service";
import type { SessionUser } from "../src/types";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { noOps } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const url = process.env.DATABASE_URL;
const network = getNetwork("testnet");
const SELLER = "https://seller.example.test";
const PAY_TO = privateKeyToAccount(generatePrivateKey()).address;
const SIGNATURE = `0x${"11".repeat(65)}` as const;
const BALANCE_LATENCY_MS = 150;

/** One seller whose 402 offers both rails at prices the test sets; counts the calls that came with a payment. */
function fakeSeller() {
  const prices = { gateway: 5_000n, eip3009: 1_000n };
  const paid: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = String(input);
    if (target.endsWith("/balances")) {
      // As slow as the real API, so calls at the same moment overlap between the budget check and the payment.
      await new Promise((resolve) => setTimeout(resolve, BALANCE_LATENCY_MS));
      return new Response(JSON.stringify({ balances: [{ balance: "1.000000", withdrawing: "0", withdrawable: "0" }] }), { status: 200 });
    }
    const headers = new Headers(init?.headers);
    if (headers.get("payment-signature")) {
      paid.push(target);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "payment-response": encodePaymentResponseHeader({ success: true, transaction: randomUUID(), network: `eip155:${network.chainId}`, payer: PAY_TO } as never) },
      });
    }
    const option = { scheme: "exact", network: `eip155:${network.chainId}`, asset: network.addresses.usdc, payTo: PAY_TO, maxTimeoutSeconds: 345_600 };
    const required = {
      x402Version: 2,
      resource: { url: target, description: "test", mimeType: "application/json" },
      accepts: [
        { ...option, amount: prices.gateway.toString(), extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: CHAIN_CONFIGS.arcTestnet.gatewayWallet } },
        { ...option, amount: prices.eip3009.toString(), extra: { name: "USDC", version: "2" } },
      ],
    };
    return new Response(null, { status: 402, headers: { "payment-required": encodePaymentRequiredHeader(required as never) } });
  }) as typeof fetch;
  return { prices, paid, fetchImpl };
}

const listing = (path: string): Listing => ({
  url: `${SELLER}${path}`,
  method: "GET",
  description: "test data",
  provider: { name: "Test Seller", website: null, description: null, category: "DATA", tags: [] },
  price: 1_000n,
  payTo: PAY_TO,
  rails: ["gateway", "eip3009"],
  mimeType: "application/json",
});

const discovery = {
  find: async (_: unknown, target: string) => listing(new URL(target).pathname),
  search: async () => ({ listings: [], total: 0 }),
  sellerFetch: (base?: typeof fetch) => sellerFetch({ base }),
} as unknown as Discovery;

const agentWallets: AgentWalletProvider = {
  create: async () => ({ walletId: randomUUID(), address: privateKeyToAccount(generatePrivateKey()).address }),
  signTypedData: async () => SIGNATURE,
};

/** Arc testnet's context with a client that reads no USDC on hand (so Gateway is the rail that can pay). */
const chains: Chains = {
  available: ["testnet"],
  get: () => ({ network, client: { readContract: async () => 0n }, relayerAddress: PAY_TO, ops: { walletId: "ops", address: PAY_TO } }) as unknown as NetworkClients,
};

const { db, pool } = url ? createDb(url, { poolSize: 4 }) : ({} as ReturnType<typeof createDb>);
let user: SessionUser;

before(async () => {
  if (!url) return;
  const [row] = await db.insert(users).values({ isAnonymous: false, email: `x402-h1-${randomUUID()}@example.test` }).returning();
  await db.insert(wallets).values({ userId: row!.id, role: "user", custody: "privy", address: privateKeyToAccount(generatePrivateKey()).address as Address, providerRef: {} });
  user = { ...row!, activeNetwork: "testnet" } as unknown as SessionUser;
});

after(async () => {
  if (!url) return;
  if (user) await db.delete(users).where(eq(users.id, user.id));
  await pool.end();
});

const service = (fetchImpl: typeof fetch) =>
  new MarketplaceService(db, chains, new WalletService(db, chains), noOps, agentWallets, discovery, createLogger({ service: "x402-h1-test", level: "silent" }), fetchImpl, fetchImpl);

const setCaps = (perCallCap: bigint, dailyBudget: bigint) =>
  db
    .insert(marketplaceSettings)
    .values({ userId: user.id, network: "testnet", perCallCap, dailyBudget })
    .onConflictDoUpdate({ target: [marketplaceSettings.userId, marketplaceSettings.network], set: { perCallCap, dailyBudget } });

test("the pricier option chosen to pay is checked on its own price, and a yes never covers a higher one", { skip: !url }, async () => {
  const seller = fakeSeller();
  const market = service(seller.fetchImpl);
  // The cheapest option (0.001) fits the per-call cap of 0.002; the Gateway option that would be paid (0.005) does not.
  await setCaps(2_000n, 100_000n);
  const threadId = randomUUID();
  const first = await market.buy(user, { url: `${SELLER}/h1/price` }, { threadId, tainted: false });
  assert.equal(first.status, "needs_consent", JSON.stringify(first));
  if (first.status !== "needs_consent") return;
  assert.equal(first.purchase.amount, "5000", "the card shows what would be paid");
  assert.equal(first.why, "over_per_call");
  assert.equal(seller.paid.length, 0, "nothing was signed");

  // The person says yes to 0.005; the seller then asks 0.008 on the same rail: the yes is asked again, never stretched.
  await market.decide(user, first.purchase.id, "approve");
  seller.prices.gateway = 8_000n;
  const second = await market.buy(user, { url: `${SELLER}/h1/price` }, { threadId, tainted: false });
  assert.equal(second.status, "needs_consent", JSON.stringify(second));
  if (second.status !== "needs_consent") return;
  assert.equal(second.purchase.id, first.purchase.id, "the same card, asked again");
  assert.equal(second.purchase.amount, "8000");
  assert.equal(seller.paid.length, 0, "still nothing signed");

  // A yes at 0.008 pays 0.008 once; the price falling back is fine (a yes covers anything up to what was seen).
  await market.decide(user, first.purchase.id, "approve");
  seller.prices.gateway = 6_000n;
  const third = await market.buy(user, { url: `${SELLER}/h1/price` }, { threadId, tainted: false });
  assert.equal(third.status, "paid", JSON.stringify(third));
  if (third.status !== "paid") return;
  assert.equal(third.purchase.amount, "6000");
  assert.equal(third.purchase.rail, "gateway");
  assert.equal(seller.paid.length, 1);
});

test("two purchases at once cannot both fit under the day's budget", { skip: !url }, async () => {
  const seller = fakeSeller();
  const market = service(seller.fetchImpl);
  seller.prices.gateway = 6_000n;
  seller.prices.eip3009 = 6_000n;
  // Room for one 0.006 purchase today, not two; nothing earlier counts (the first test's 0.006 is in a fresh budget).
  const spentBefore = await db
    .select({ amount: marketplacePurchases.amount })
    .from(marketplacePurchases)
    .where(and(eq(marketplacePurchases.userId, user.id), eq(marketplacePurchases.status, "paid")));
  const already = spentBefore.reduce((sum, row) => sum + row.amount, 0n);
  await setCaps(10_000n, already + 10_000n);
  const outcomes = await Promise.all(
    ["/h1/a", "/h1/b", "/h1/c"].map((path) => market.buy(user, { url: `${SELLER}${path}` }, { threadId: randomUUID(), tainted: false })),
  );
  const statuses = outcomes.map((outcome) => (outcome.status === "refused" ? `refused:${outcome.reason}` : outcome.status)).sort();
  assert.deepEqual(statuses, ["paid", "refused:over_budget", "refused:over_budget"], JSON.stringify(outcomes));
  assert.equal(seller.paid.length, 1, "only one payment was signed");
});
