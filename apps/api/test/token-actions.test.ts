// A token page's actions from the venue's live reserves (capability-matrix.md; surfaces.md token page More sheet):
// Earn, Borrow and Long/Short follow Aave V4's Main Spoke and Kawase Margin's sides; Bridge carries any held token as
// itself on mainnet; testnet names the switch for the assets mainnet's venues list; a price alert for anything that
// trades. Pure: no network. Run: pnpm --filter @kawase/api exec tsx --test test/token-actions.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { HoldingView, TokenView } from "@kawase/api-client";

import { tokenActions } from "../src/tokens/service";

const CIRBTC = "0x0000000000000000000000000000000000000b7c";
const USDC = "0x3600000000000000000000000000000000000000";

const token = (over: Partial<TokenView>): TokenView => ({
  chainId: 5042,
  address: CIRBTC,
  symbol: "cirBTC",
  name: "Circle Bitcoin",
  decimals: 8,
  logoUrl: null,
  kind: "bitcoin",
  status: "canonical",
  isTest: false,
  ...over,
});
const holding = (of: TokenView, balance: string) => ({ token: of, balance, amount: balance, priceUsd: null, valueUsd: null }) as unknown as HoldingView;
const venue = { available: true, reason: null, markets: [{ asset: CIRBTC, long: true, short: true }] };
const by = (actions: ReturnType<typeof tokenActions>) => Object.fromEntries(actions.map((entry) => [entry.id, entry.reason ?? "ok"]));

test("a venue-listed token earns, borrows, goes long or short, bridges as itself and takes a price alert", () => {
  const btc = token({});
  const actions = by(tokenActions("mainnet", btc, "ok", holding(btc, "100"), venue));
  assert.deepEqual(
    { earn: actions.earn, borrow: actions.borrow, long_short: actions.long_short, bridge: actions.bridge, alert: actions.alert },
    { earn: "ok", borrow: "ok", long_short: "ok", bridge: "ok", alert: "ok" },
  );
});

test("a meme token: no yield, no lending, no market; bridge needs a balance; the alert still works", () => {
  const meme = token({ address: "0x00000000000000000000000000000000000000aa", symbol: "TOLLY", kind: "token", status: "unverified" });
  const actions = by(tokenActions("mainnet", meme, "ok", null, venue));
  assert.deepEqual(
    { earn: actions.earn, borrow: actions.borrow, long_short: actions.long_short, bridge: actions.bridge, alert: actions.alert },
    { earn: "no_yield", borrow: "no_lending", long_short: "no_market", bridge: "no_balance", alert: "ok" },
  );
});

test("testnet: mainnet's venue assets say mainnet only (the switch); USDC bridges by CCTP and earns", () => {
  const eurc = token({ chainId: 5042002, address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", symbol: "EURC", kind: "fiat", isTest: true });
  const usdc = token({ chainId: 5042002, address: USDC, symbol: "USDC", kind: "dollar", isTest: true });
  const notOnTestnet = { available: false, reason: "mainnet_only", markets: [] };
  const e = by(tokenActions("testnet", eurc, "ok", holding(eurc, "5"), notOnTestnet));
  const u = by(tokenActions("testnet", usdc, "ok", holding(usdc, "5"), notOnTestnet));
  assert.deepEqual({ earn: e.earn, borrow: e.borrow, long_short: e.long_short, bridge: e.bridge }, { earn: "mainnet_only", borrow: "mainnet_only", long_short: "mainnet_only", bridge: "mainnet_only" });
  assert.deepEqual({ earn: u.earn, bridge: u.bridge, long_short: u.long_short, alert: u.alert }, { earn: "ok", bridge: "ok", long_short: "no_market", alert: "no_market" });
});

test("a blocked token can't be traded, shorted, bridged or alerted", () => {
  const fake = token({ status: "impersonator" });
  const actions = by(tokenActions("mainnet", fake, "block", holding(fake, "1"), venue));
  assert.deepEqual({ buy: actions.buy, long_short: actions.long_short, bridge: actions.bridge, alert: actions.alert }, { buy: "blocked", long_short: "blocked", bridge: "blocked", alert: "blocked" });
});
