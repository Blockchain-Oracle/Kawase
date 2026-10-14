// The meme/copycat check before a buy (front door): the name rule, the market signals from GeckoTerminal's pools, and
// one live read of GeckoTerminal's pools endpoint for a token on Arc mainnet (no key; skipped offline).
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TokenDetailView } from "@kawase/api-client";

import { copiedName, createMemeCheck, marketSignals } from "../src/agent/meme-check";

const market = { priceUsd: null, change24hPct: null, volume24hUsd: null, liquidityUsd: null, marketCapUsd: null, fdvUsd: null, holders: null, pool: null };
const token = (symbol: string, name: string, status: TokenDetailView["token"]["status"] = "unverified"): Pick<TokenDetailView, "token" | "market"> => ({
  token: { chainId: 5042, address: "0x00000000000000000000000000000000000000aa", symbol, name, decimals: 18, logoUrl: null, kind: "token", status, isTest: false },
  market,
});

test("a name that copies a known asset is caught; an ordinary name is not", () => {
  assert.equal(copiedName({ symbol: "PEPE2", name: "Pepe 2.0" }), "Pepe");
  assert.equal(copiedName({ symbol: "USDC", name: "USD Coin" }), "USDC");
  assert.equal(copiedName({ symbol: "XUSD", name: "Bitcoin on Arc" }), "Bitcoin");
  assert.equal(copiedName({ symbol: "KAWA", name: "Kawa Frog" }), null);
});

test("market signals: churn over thin pools, identical volumes, a few wallets trading a lot", () => {
  const wash = marketSignals([
    { reserveUsd: 500, volume24Usd: 52_000.17, trades24: 300, traders24: 3 },
    { reserveUsd: 300, volume24Usd: 52_000.17, trades24: 10, traders24: 1 },
  ]);
  assert.deepEqual([...wash.reasons].sort(), ["few_traders", "identical_volumes", "thin_liquidity", "wash_volume"]);
  const healthy = marketSignals([{ reserveUsd: 2_000_000, volume24Usd: 400_000, trades24: 900, traders24: 410 }]);
  assert.deepEqual(healthy.reasons, []);
  assert.deepEqual(marketSignals([]).reasons, ["thin_liquidity"]);
});

test("canonical tokens are never flagged; a copy on testnet gets the name rule only", async () => {
  const check = createMemeCheck(undefined, () => Promise.reject(new Error("no network in this test")));
  assert.equal(await check.check("mainnet", token("USDC", "USD Coin", "canonical")), null);
  const copy = await check.check("testnet", token("USDC", "USD Coin"));
  assert.equal(copy?.copies, "USDC");
  assert.equal(copy?.checkedBy, null);
  assert.deepEqual(copy?.reasons, ["copies_name"]);
  // A listed token is the asset it names (a bridged WETH): no name warning.
  assert.equal(await check.check("testnet", token("WETH", "Wrapped Ether", "listed")), null);
});

test("live: GeckoTerminal's pools for a token on Arc answer in the shape the check reads", { skip: process.env.OFFLINE === "1", timeout: 20_000 }, async () => {
  const list = await fetch("https://api.geckoterminal.com/api/v2/networks/arc/pools?page=1", { headers: { accept: "application/json" } });
  if (!list.ok) return; // GeckoTerminal busy (429) or Arc not listed: nothing to assert against.
  const pools = ((await list.json()) as { data?: { relationships?: { base_token?: { data?: { id?: string } } } }[] }).data ?? [];
  const id = pools.find((pool) => pool.relationships?.base_token?.data?.id)?.relationships?.base_token?.data?.id;
  if (!id) return;
  const address = id.slice(id.indexOf("_") + 1);
  const check = createMemeCheck();
  const answer = await check.check("mainnet", { ...token("ZZZQ", "Not A Known Name"), token: { ...token("ZZZQ", "Not A Known Name").token, address } });
  // Either nothing found (a healthy pool) or a warning read from GeckoTerminal's pools.
  if (answer) assert.equal(answer.checkedBy, "GeckoTerminal");
  console.info(`meme check on ${address}:`, answer ? `${answer.level} ${answer.reasons.join(",")} vol ${answer.volume24hUsd} liq ${answer.liquidityUsd}` : "nothing found");
});
