// Alchemy as primary discovery (approved 2026-10-02), without a key: the Portfolio API client is checked against the
// documented request/response shape with a stubbed fetch, and the portfolio's own rules are checked on its output —
// Arc tokens Alchemy finds join the on-chain balance read, a fake 18-decimal "USDC" on Base is an impostor, an
// unpriced token is Hidden, and nothing unpriced counts toward the total. Arc balances are read on Arc mainnet.
// Run: pnpm --filter @kawase/api exec tsx --test test/alchemy-portfolio.test.ts
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import type { PortfolioView } from "@kawase/api-client";
import { createDb, devices, sessions, users, wallets } from "@kawase/db";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";
import { createModels } from "@kawase/agent";
import { eq } from "drizzle-orm";

import { createApp } from "../src/app";
import { hashToken } from "../src/auth/session";
import { alchemyIndex, type WalletHolding } from "../src/market/alchemy";
import { MarketCache } from "../src/market/cache";
import { noMarketData } from "../src/market/sources";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { fakeTurnkey, noOps, okFaucet } from "./helpers";

const HOLDER = "0x7d613c6316eDe9d257f3BF512777Cb4Ea4A6beE4";
const ARGUS = "0xece5ca8bf9220718e5727754026757512212cb3c";
const HOUR_MS = 3_600_000;
const OK = 200;

test("the Portfolio API client: two address entries cover seven networks, hex balances, native coins, paging", async () => {
  const calls: unknown[] = [];
  const original = globalThis.fetch;
  let page = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    page += 1;
    const tokens =
      page === 1
        ? [
            { network: "arc-mainnet", tokenAddress: ARGUS, tokenBalance: "0x1bc16d674ec80000", tokenMetadata: { decimals: 18, symbol: "ARGUS", name: "Argus", logo: null }, tokenPrices: [] },
            { network: "base-mainnet", tokenAddress: null, tokenBalance: "0x2386f26fc10000", tokenMetadata: { decimals: 18, symbol: "ETH", name: "Ether" }, tokenPrices: [{ currency: "usd", value: "2750.10" }] },
          ]
        : [{ network: "avax-mainnet", tokenAddress: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", tokenBalance: "0x0", tokenMetadata: { decimals: 6, symbol: "USDC" }, tokenPrices: [] }];
    return new Response(JSON.stringify({ data: { tokens, pageKey: page === 1 ? "next" : null } }), { status: OK });
  }) as typeof fetch;
  try {
    const answer = await alchemyIndex("test-key", new MarketCache()).holdings(HOLDER, "mainnet");
    const holdings = answer?.holdings;
    const first = calls[0] as { addresses: { address: string; networks: string[] }[]; pageKey?: string };
    assert.equal(first.addresses.length, 2);
    assert.deepEqual(first.addresses.flatMap((entry) => entry.networks).length, 7);
    assert.ok(first.addresses.every((entry) => entry.networks.length <= 5));
    assert.equal((calls[1] as { pageKey?: string }).pageKey, "next", "the second page is asked with the pageKey");
    assert.equal(holdings?.length, 2, "zero balances are dropped");
    assert.equal(holdings?.[0]?.balance, 2_000_000_000_000_000_000n);
    assert.equal(holdings?.[1]?.tokenAddress, null, "a native coin has no token address");
    assert.equal(holdings?.[1]?.priceUsd, 2750.1);
  } finally {
    globalThis.fetch = original;
  }
});

const mainnet = getNetwork("mainnet");
const account = privateKeyToAccount(generatePrivateKey());
const readOnly: NetworkClients = {
  network: mainnet,
  client: createPublicClient({ chain: arc, transport: http() }),
  relayer: createWalletClient({ account, chain: arc, transport: http() }),
  relayerAddress: account.address,
  ops: { walletId: "none", address: account.address },
};
const chains: Chains = { available: ["mainnet"], get: (network) => (network === "mainnet" ? readOnly : undefined) };
const { db, pool } = createDb(process.env.DATABASE_URL!, { poolSize: 2 });
const indexed: WalletHolding[] = [
  { chainId: 5042, chainName: "Arc", tokenAddress: ARGUS, balance: 1n, symbol: "ARGUS", name: "Argus", decimals: 18, logoUrl: null, priceUsd: null },
  { chainId: 8453, chainName: "Base", tokenAddress: null, balance: 10_000_000_000_000_000n, symbol: "ETH", name: "Ether", decimals: 18, logoUrl: null, priceUsd: 2750 },
  { chainId: 8453, chainName: "Base", tokenAddress: "0x1111111111111111111111111111111111111111", balance: 5_000_000_000_000_000_000n, symbol: "USDC", name: "USD Coin", decimals: 18, logoUrl: null, priceUsd: 1 },
  { chainId: 42161, chainName: "Arbitrum", tokenAddress: "0x2222222222222222222222222222222222222222", balance: 1_000_000n, symbol: "FREE", name: "Free airdrop", decimals: 6, logoUrl: null, priceUsd: null },
];
const app = createApp({
  db,
  log: createLogger({ service: "alchemy-portfolio", level: "silent" }),
  turnkey: fakeTurnkey({}),
  chains,
  faucet: okFaucet,
  ops: noOps,
  models: createModels({}),
  market: { ...noMarketData, wallets: { holdings: async () => ({ holdings: indexed, failedChains: [] }), prices: async () => new Map() } },
  rateLimitPerMinute: 10_000,
});
let userId = "";
const token = `alchemy-portfolio-${Date.now()}`;

before(async () => {
  const [user] = await db.insert(users).values({ isAnonymous: false, email: `${token}@example.com`, activeNetwork: "mainnet" }).returning();
  userId = user!.id;
  await db.insert(wallets).values({ userId, role: "user", status: "active", address: HOLDER, custody: "turnkey" } as never);
  const [device] = await db.insert(devices).values({ userId, platform: "ios", installationId: token }).returning();
  await db.insert(sessions).values({ userId, deviceId: device!.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + HOUR_MS) } as never);
});

after(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

test("the portfolio applies Kawase's rules to what Alchemy finds", async () => {
  const response = await app.request("/portfolio", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, OK, await response.clone().text());
  const { portfolio } = (await response.json()) as { portfolio: PortfolioView };
  const all = [...portfolio.assets, ...portfolio.otherChains, ...portfolio.hidden];
  console.log("assets", portfolio.assets.map((row) => row.token.symbol), "other", portfolio.otherChains.map((row) => `${row.token.symbol}@${row.chainName}`), "hidden", portfolio.hidden.map((row) => `${row.token.symbol}:${row.hiddenReason}`), "total", portfolio.totalUsd);
  assert.ok(all.some((row) => row.token.address.toLowerCase() === ARGUS), "ARGUS found by Alchemy is read on chain");
  assert.equal(portfolio.otherChains.find((row) => row.token.symbol === "ETH")?.valueUsd, 27.5, "a priced native coin on Base shows");
  assert.equal(portfolio.hidden.find((row) => row.token.symbol === "USDC" && row.chainName === "Base")?.hiddenReason, "impersonator", "an 18-decimal USDC is a fake");
  assert.equal(portfolio.hidden.find((row) => row.token.symbol === "FREE")?.hiddenReason, "spam", "no price → Hidden");
  assert.equal(portfolio.breakdown.otherChainsUsd, 27.5, "nothing unpriced or fake counts toward the total");
});
