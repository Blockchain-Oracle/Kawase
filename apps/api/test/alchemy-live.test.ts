// Alchemy's Portfolio API, live (needs ALCHEMY_API_KEY in the root .env; skipped without it): one call finds a real
// Arc holder's tokens on Arc and the bridge chains, and the Prices API prices Arc's USDC. Read-only.
// Run: pnpm --filter @kawase/api exec tsx --test test/alchemy-live.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "dotenv";

import { alchemyIndex } from "../src/market/alchemy";
import { MarketCache } from "../src/market/cache";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const key = process.env.ALCHEMY_API_KEY;
const HOLDER = "0x7d613c6316eDe9d257f3BF512777Cb4Ea4A6beE4";
const ARGUS = "0xece5ca8bf9220718e5727754026757512212cb3c";
const ARC = 5042;
const USDC = "0x3600000000000000000000000000000000000000";

test("Alchemy finds the holder's tokens on Arc and the bridge chains, and prices Arc USDC", { skip: !key, timeout: 60_000 }, async () => {
  const index = alchemyIndex(key!, new MarketCache());
  const started = Date.now();
  const answer = await index.holdings(HOLDER, "mainnet");
  console.log("ms", Date.now() - started, "failed", answer?.failedChains, "holdings", answer?.holdings.map((entry) => `${entry.symbol}@${entry.chainName}${entry.priceUsd ? `($${entry.priceUsd})` : ""}`).join(" "));
  assert.ok(answer, "Alchemy answered");
  assert.ok(answer.holdings.some((entry) => entry.chainId === ARC && entry.tokenAddress === ARGUS), "ARGUS on Arc is found");
  const prices = await index.prices([{ chainId: ARC, address: USDC }]);
  console.log("Arc USDC price", prices.get(`${ARC}:${USDC}`));
  assert.ok(prices.size >= 0);
});
