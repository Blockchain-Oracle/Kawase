// M7: "Pause everything" reaches every money path. Each policy is told the real pause state; per X30 the person's own
// Face ID move goes on (the exit kit must be able to move money out), and its card says the pause is on.
import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateBridge, evaluateCrossChain, evaluateEarn, evaluateLend, evaluateMargin, evaluateSwap, type PolicyResult } from "../src";

const USDC = (value: number) => BigInt(Math.round(value * 1_000_000));
const base = { network: "testnet" as const, capability: { here: "available" as const, other: "available" as const }, signedIn: true };
const wallet = { registered: true, setUp: true, usdc: USDC(100) };
const amount = { status: "ok" as const, baseUnits: USDC(10) };
const codes = (results: PolicyResult[]) => results.map((entry) => entry.code);

const evaluations: Record<string, (pausedAll: boolean) => { results: PolicyResult[]; blocking: PolicyResult | undefined }> = {
  bridge: (pausedAll) => evaluateBridge({ ...base, pausedAll, wallet, destination: "base", amount, route: { status: "ok", maxRouteFee: USDC(0.1) }, thresholds: { gasFloat: USDC(0.05) } }),
  earn: (pausedAll) =>
    evaluateEarn({ ...base, pausedAll, wallet, action: "deposit", vault: { status: "found", active: true, lowLiquidity: false, warnings: [], available: USDC(1000), position: 0n }, amount, thresholds: { gasFloat: USDC(0.05) } }),
  lend: (pausedAll) =>
    evaluateLend({
      ...base,
      pausedAll,
      wallet,
      action: "supply",
      asset: { status: "found", symbol: "USDC", decimals: 6, borrowable: true, collateralOk: true },
      amount,
      limit: { balance: USDC(100), supplied: 0n, debt: 0n },
      collateral: { status: "none" },
      health: { afterBps: null, minBps: 11_000, warnBps: 13_000 },
      gasFloat: USDC(0.05),
    }),
  margin: (pausedAll) =>
    evaluateMargin({
      ...base,
      pausedAll,
      wallet,
      action: "open",
      market: { status: "found", symbol: "WETH", side: "long", sideAvailable: true, sideReason: null, maxLeverageBps: 50_000 },
      amount,
      leverageBps: 20_000,
      position: { status: "not_needed" },
      plan: { status: "ok", liquidationPrice: null },
      thresholds: { gasFloat: USDC(0.05) },
    }),
  crosschain: (pausedAll) =>
    evaluateCrossChain({
      ...base,
      pausedAll,
      direction: "out",
      wallet: { registered: true, setUp: true },
      chain: "found",
      recipient: { status: "own" },
      asset: { status: "found", symbol: "USDC", decimals: 6, usdc: true },
      amount,
      balance: USDC(100),
      gasFloat: USDC(0.05),
      route: { status: "ok" },
    }),
  swap: (pausedAll) =>
    evaluateSwap({
      ...base,
      pausedAll,
      wallet: { registered: true, setUp: true, balanceIn: USDC(100), usdc: USDC(100) },
      tokenIn: "0x3600000000000000000000000000000000000000",
      tokenOut: "0x89b50855aa3be2f677cd6303cec089b5f319d72a",
      tokenInIsUsdc: true,
      amount,
      quote: { status: "ok", estimatedOut: USDC(9), minOut: USDC(8.9), slippageBps: 100, rateGapBps: 0 },
      thresholds: { gasFloat: USDC(0.05), maxRateGapBps: 500, warnRateGapBps: 100 },
    }),
};

for (const [name, evaluate] of Object.entries(evaluations)) {
  test(`${name}: the real pause state reaches the card, and the person's own yes still goes`, () => {
    const running = evaluate(false);
    const paused = evaluate(true);
    assert.equal(codes(running.results).includes("AGENT_PAUSED"), false);
    assert.equal(codes(paused.results).includes("AGENT_PAUSED"), true, `${name} says the pause is on`);
    // Nothing that blocked before blocks differently, and nothing new blocks (X30: the exit kit moves money out).
    assert.equal(paused.blocking?.code, running.blocking?.code, JSON.stringify(paused.results));
  });
}
