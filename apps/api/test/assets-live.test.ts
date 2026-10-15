// The asset registry end to end against Arc mainnet's real chain and the real market sources (LI.FI, GeckoTerminal,
// GoPlus): a portfolio for a wallet that holds meme tokens, a token page with safety, the copycat rule on the fake
// "USDC" that trended on 2026-10-02, the Markets list and search, and the watcher finding tokens by itself.
// Read-only: nothing is signed or sent. Run: pnpm --filter @kawase/api exec tsx --test test/assets-live.test.ts
import assert from "node:assert/strict";
import { config } from "dotenv";
import { after, before, test } from "node:test";
import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arc } from "viem/chains";

import type { MarketListView, PortfolioView, TokenDetailView, TokenSearchResult } from "@kawase/api-client";
import { devices, sessions, users, wallets, walletTokens } from "@kawase/db";
import { getNetwork } from "@kawase/networks";
import { eq } from "drizzle-orm";

import { createApp } from "../src/app";
import { hashToken } from "../src/auth/session";
import { IncomingWatcher } from "../src/incoming/watcher";
import { liveMarketData } from "../src/market/sources";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { createDb } from "@kawase/db";
import { createLogger } from "@kawase/log";
import { createModels } from "@kawase/agent";
import { noOps, okFaucet } from "./helpers";

/** An EOA that holds ARGUS and other Arc tokens (ARGUS's owner per GoPlus, 2026-10-02). */
const HOLDER = "0x7d613c6316eDe9d257f3BF512777Cb4Ea4A6beE4";
const ARGUS = "0xeCe5cA8bf9220718E5727754026757512212cb3c";
const HOUR_MS = 3_600_000;
const SHORT = 8;
const OK = 200;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
/** The fake "USDC" whose USDC/USDC pool trended on GeckoTerminal on 2026-10-02. */
const FAKE_USDC = "0x8e98a62a995a50eca9979bfa016f91bf36a8f9d9";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

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

const url = process.env.DATABASE_URL!;
const { db, pool } = createDb(url, { poolSize: 2 });
const log = createLogger({ service: "assets-live", level: "silent" });
const app = createApp({ db, log, chains, faucet: okFaucet, ops: noOps, models: createModels({}), market: liveMarketData({ alchemyApiKey: process.env.ALCHEMY_API_KEY }), rateLimitPerMinute: 10_000 });
let userId = "";
const token = `assets-live-${Date.now()}`;

before(async () => {
  const [user] = await db.insert(users).values({ isAnonymous: false, email: `assets-live-${Date.now()}@example.com`, activeNetwork: "mainnet" }).returning();
  userId = user!.id;
  await db.insert(wallets).values({ userId, role: "user", status: "active", address: HOLDER, custody: "privy", createdAt: new Date(Date.now() - HOUR_MS - HOUR_MS) } as never);
  const [device] = await db.insert(devices).values({ userId, platform: "ios", installationId: `assets-live-${Date.now()}` }).returning();
  await db.insert(sessions).values({ userId, deviceId: device!.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + HOUR_MS) } as never);
});

after(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

const get = async <T>(path: string, auth = true): Promise<T> => {
  const response = await app.request(path, { headers: auth ? { authorization: `Bearer ${token}` } : {} });
  assert.equal(response.status, OK, `${path}: ${await response.clone().text()}`);
  return (await response.json()) as T;
};

test("markets and search are public", async () => {
  const { market } = await get<{ market: MarketListView }>("/markets?segment=trending&network=mainnet", false);
  console.log("trending", market.rows.slice(0, SHORT).map((row) => `${row.token.symbol}(${row.token.status})`).join(" "));
  assert.ok(market.rows.length > 0);
  const { results } = await get<{ results: TokenSearchResult[] }>("/tokens/search?q=ARGUS&network=mainnet", false);
  console.log("search ARGUS", results.map((row) => `${row.token.symbol}:${row.token.address.slice(0, SHORT)}:${row.token.status}`).join(" "));
  assert.equal(results[0]?.token.address.toLowerCase(), ARGUS.toLowerCase());
});

test("portfolio: every token the wallet holds on Arc, priced, with other chains and hidden ones apart", async () => {
  const { portfolio } = await get<{ portfolio: PortfolioView }>("/portfolio");
  const symbols = portfolio.assets.map((row) => `${row.token.symbol}=${row.amount} ($${row.valueUsd}, ${row.token.status})`);
  console.log("total", portfolio.totalUsd, "24h", portfolio.change24hPct, "%", "\n assets", symbols.join("\n "), "\n other chains", portfolio.otherChains.length, "\n hidden", portfolio.hidden.map((row) => `${row.token.symbol}:${row.hiddenReason}`).join(", "));
  assert.ok(portfolio.assets.some((row) => row.token.address.toLowerCase() === ARGUS.toLowerCase()), "ARGUS is found without a hand-picked list");
  assert.ok(portfolio.totalUsd > 0);
  assert.ok(portfolio.history.length >= 1);
});

test("token page: ARGUS with market, safety from GoPlus and computed actions", async () => {
  const { token } = await get<{ token: TokenDetailView }>(`/tokens/5042/${ARGUS}`, false);
  console.log(token.token.symbol, token.token.status, "price", token.market.priceUsd, "liq", token.market.liquidityUsd, "safety", token.safety.level, token.safety.reasons, "lookalikes", token.safety.lookalikes.length, "actions", token.actions.map((action) => `${action.id}:${action.available ? "yes" : action.reason}`).join(" "));
  assert.equal(token.token.status, "listed");
  assert.ok(token.market.priceUsd && token.market.priceUsd > 0);
  assert.equal(token.safety.checkedBy, "GoPlus");
  const candles = await get<{ candles: unknown[] }>(`/tokens/5042/${ARGUS}/chart?range=1D`, false);
  assert.ok(candles.candles.length > 0, "the chart has candles");
});

test("copycat rule: a fake USDC is an impersonator and blocked", async () => {
  const { token } = await get<{ token: TokenDetailView }>(`/tokens/5042/${FAKE_USDC}`, false);
  console.log("fake USDC:", token.token.symbol, token.token.status, token.safety.level, token.safety.reasons);
  assert.equal(token.token.status, "impersonator");
  assert.equal(token.safety.level, "block");
  assert.equal(token.actions.find((action) => action.id === "buy")?.available, false);
});

test("discovery: the watcher records every ERC-20 that reaches a Kawase wallet, from Transfer logs alone", async () => {
  // Uniswap v4's PoolManager on Arc receives many different tokens every few blocks: a wallet that is sure to have
  // fresh arrivals in the watcher's first window.
  const [busy] = await db.insert(users).values({ isAnonymous: false, email: `assets-live-pm-${Date.now()}@example.com`, activeNetwork: "mainnet" }).returning();
  try {
    await db.insert(wallets).values({ userId: busy!.id, role: "user", status: "active", address: POOL_MANAGER, custody: "privy" } as never);
    const watcher = new IncomingWatcher(db, chains, { matchIncoming: async () => undefined } as never, { add: async () => undefined } as never, log);
    await watcher.tick();
    const found = await db.select().from(walletTokens).where(eq(walletTokens.userId, busy!.id));
    console.log("wallet_tokens", found.map((row) => `${row.tokenAddress.slice(0, SHORT)}:${row.source}@${row.lastBlock}`).join(" "));
    assert.ok(found.length > 0, "tokens were discovered");
    assert.ok(found.every((row) => row.tokenAddress !== "0x3600000000000000000000000000000000000000"), "USDC is counted once, from the system emitter");
  } finally {
    await db.delete(users).where(eq(users.id, busy!.id));
  }
});
