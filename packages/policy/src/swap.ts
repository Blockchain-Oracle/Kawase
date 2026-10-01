// The checks for one swap, as a pure function of facts the caller gathered (balances from the chain, a fresh quote
// from App Kit, market rates from Circle). Same rule as sends: the agent's draft, the person's approval and the
// final check before signing all run this one function (ARCHITECTURE §8 `propose_swap`).
//
// A swap is always signed by the wallet itself (one Face ID): the everyday allowance only covers transfers.
import type { CapabilityState } from "@kawase/config";
import type { AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts } from "./send";

export type SwapQuoteFacts =
  | { status: "ok"; estimatedOut: bigint; minOut: bigint; slippageBps: number; rateGapBps: number | undefined }
  | { status: "unavailable" }
  | { status: "not_requested" };

export type SwapFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  wallet: { registered: boolean; setUp: boolean; balances: Record<AssetId, bigint> };
  tokenIn: AssetId | undefined;
  tokenOut: AssetId | undefined;
  /** Base units of tokenIn. */
  amount: AmountFacts;
  quote: SwapQuoteFacts;
  thresholds: {
    gasFloat: bigint;
    /** Above this many basis points below the market rate the swap is refused. */
    maxRateGapBps: number;
    /** Above this it carries a warning. */
    warnRateGapBps: number;
  };
};

export type SwapEvaluation = {
  results: PolicyResult[];
  blocking: PolicyResult | undefined;
  tokenIn: AssetId | undefined;
  tokenOut: AssetId | undefined;
};

const ZERO = 0n;
const PERCENT_BPS = 100;
const s = (value: bigint) => value.toString();
const percent = (bps: number) => (bps / PERCENT_BPS).toFixed(1);
/** With exactly this many currencies, naming one side names the other. */
const PAIR = 2;

/** The pair, completed from what was said: with two currencies, naming one side names the other. */
export function completePair(tokenIn: AssetId | undefined, tokenOut: AssetId | undefined, assets: readonly AssetId[]) {
  const other = (asset: AssetId) => (assets.length === PAIR ? assets.find((candidate) => candidate !== asset) : undefined);
  if (tokenIn && !tokenOut) return { tokenIn, tokenOut: other(tokenIn) };
  if (tokenOut && !tokenIn) return { tokenIn: other(tokenOut), tokenOut };
  return { tokenIn, tokenOut };
}

function done(results: PolicyResult[], tokenIn: AssetId | undefined, tokenOut: AssetId | undefined): SwapEvaluation {
  return { results, blocking: blockingResult(results), tokenIn, tokenOut };
}

export function evaluateSwap(facts: SwapFacts): SwapEvaluation {
  const { tokenIn, tokenOut } = facts;
  const results: PolicyResult[] = [];

  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")], tokenIn, tokenOut);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "swap" })], tokenIn, tokenOut);
  }
  if (facts.pausedAll) return done([result("PAUSED_ALL")], tokenIn, tokenOut);
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")], tokenIn, tokenOut);
  // Approve + swap go out as one batch from the wallet's own EIP-7702 code.
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));

  if (!tokenIn || !tokenOut) results.push(result("ASSET_UNCLEAR"));
  else if (tokenIn === tokenOut) results.push(result("SWAP_SAME_TOKEN"));
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO))
    results.push(result("AMOUNT_INVALID"));
  const amount = facts.amount.status === "ok" && facts.amount.baseUnits > ZERO ? facts.amount.baseUnits : undefined;
  if (!tokenIn || !tokenOut || tokenIn === tokenOut || amount === undefined) return done(results, tokenIn, tokenOut);

  const balance = facts.wallet.balances[tokenIn];
  if (amount > balance) results.push(result("INSUFFICIENT_BALANCE", { balance: s(balance), asset: tokenIn }));
  // The wallet pays the network fee in USDC.
  const usdcLeft = facts.wallet.balances.USDC - (tokenIn === "USDC" ? amount : ZERO);
  if (amount <= balance && usdcLeft < facts.thresholds.gasFloat)
    results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));

  const quote = facts.quote;
  if (quote.status === "unavailable") results.push(result("QUOTE_UNAVAILABLE"));
  if (quote.status === "ok" && quote.rateGapBps !== undefined) {
    if (quote.rateGapBps > facts.thresholds.maxRateGapBps)
      results.push(result("PRICE_IMPACT_HIGH", { gap: percent(quote.rateGapBps), max: percent(facts.thresholds.maxRateGapBps) }));
    else if (quote.rateGapBps > facts.thresholds.warnRateGapBps) results.push(result("RATE_BELOW_REFERENCE", { gap: percent(quote.rateGapBps) }));
  }
  return done(results, tokenIn, tokenOut);
}
