// The checks for one swap of any pair (R1), as a pure function of facts the caller gathered (balances from the
// chain, the best fresh quote of the venue fan-out, market prices, the token's safety verdict and the token rules).
// Same rule as sends: the agent's draft, the person's approval and the final check before signing all run this one
// function (ARCHITECTURE §8 `propose_swap`).
//
// A swap is always signed by the wallet itself (one Face ID / slide): the everyday allowance only covers transfers.
import type { CapabilityState } from "@kawase/config";
import type { AssetId } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts } from "./send";

export type SwapQuoteFacts =
  | { status: "ok"; estimatedOut: bigint; minOut: bigint; slippageBps: number; rateGapBps: number | undefined }
  | { status: "unavailable" }
  | { status: "not_requested" };

/** The token rules (D12) as they apply to this buy. */
export type TokenRuleFacts = {
  /** The token bought: "block" = impersonator, honeypot, can't be sold (never bought). */
  safety: "ok" | "caution" | "block";
  /** The safety reason codes behind a block or a caution (impersonator, honeypot, lookalike, unverified…). */
  reasons: readonly string[];
  /** Kawase does not vouch for it (unverified or a lookalike): the per-trade and per-day limits apply. */
  unverified: boolean;
  /** This trade's value in US dollars, when priced. */
  tradeUsd: number | null;
  /** Already bought today in unverified tokens, US dollars. */
  spentTodayUsd: number;
  perTradeUsd: number;
  perDayUsd: number;
  /** verified = only tokens Kawase vouches for may be bought; warned (default) = unverified ones too, inside the caps. */
  access?: "verified" | "warned" | undefined;
};

export type SwapFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  /** Pause all stops the agent and automations only; a swap is always the person's own yes, so it never blocks (D-pause). */
  pausedAll: boolean;
  wallet: {
    registered: boolean;
    setUp: boolean;
    /** Base units of tokenIn held, and of USDC (the network fee is paid in USDC). */
    balanceIn: bigint;
    usdc: bigint;
  };
  /** The tokens, by lower-case address (or undefined when not named / not known). */
  tokenIn: string | undefined;
  tokenOut: string | undefined;
  /** Display facts for the messages. */
  symbolIn?: string | undefined;
  decimalsIn?: number | undefined;
  /** tokenIn is Arc's USDC (the gas token): what is swapped also cannot pay the fee. */
  tokenInIsUsdc: boolean;
  /** Base units of tokenIn. */
  amount: AmountFacts;
  quote: SwapQuoteFacts;
  thresholds: {
    gasFloat: bigint;
    /** Above this many basis points below the market price the swap is refused. */
    maxRateGapBps: number;
    /** Above this it carries a warning. */
    warnRateGapBps: number;
  };
  tokenRules?: TokenRuleFacts | undefined;
};

export type SwapEvaluation = {
  results: PolicyResult[];
  blocking: PolicyResult | undefined;
  tokenIn: string | undefined;
  tokenOut: string | undefined;
};

const ZERO = 0n;
const PERCENT_BPS = 100;
/** A price this many times over the rule is refused, not braked. */
const BRAKE_HARD_FACTOR = 3;
const s = (value: bigint) => value.toString();
const percent = (bps: number) => (bps / PERCENT_BPS).toFixed(1);
const usd = (value: number) => value.toFixed(0);
/** With exactly this many currencies, naming one side names the other. */
const PAIR = 2;

/** The pair, completed from what was said: with two currencies, naming one side names the other. */
export function completePair(tokenIn: AssetId | undefined, tokenOut: AssetId | undefined, assets: readonly AssetId[]) {
  const other = (asset: AssetId) => (assets.length === PAIR ? assets.find((candidate) => candidate !== asset) : undefined);
  if (tokenIn && !tokenOut) return { tokenIn, tokenOut: other(tokenIn) };
  if (tokenOut && !tokenIn) return { tokenIn: other(tokenOut), tokenOut };
  return { tokenIn, tokenOut };
}

function done(results: PolicyResult[], tokenIn: string | undefined, tokenOut: string | undefined): SwapEvaluation {
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
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")], tokenIn, tokenOut);
  // Approve + swap go out as one batch from the wallet's own EIP-7702 code.
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));

  // Never bought, whatever the amount: a stablecoin impersonator, a honeypot, a token that cannot be sold.
  const rules = facts.tokenRules;
  if (rules?.safety === "block") results.push(result("TOKEN_BLOCKED", { reason: rules.reasons[0] ?? "blocked" }));

  if (!tokenIn || !tokenOut) results.push(result("ASSET_UNCLEAR"));
  else if (tokenIn === tokenOut) results.push(result("SWAP_SAME_TOKEN"));
  if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
  if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
  const amount = facts.amount.status === "ok" && facts.amount.baseUnits > ZERO ? facts.amount.baseUnits : undefined;
  if (!tokenIn || !tokenOut || tokenIn === tokenOut || amount === undefined) return done(results, tokenIn, tokenOut);

  const balance = facts.wallet.balanceIn;
  if (amount > balance)
    results.push(result("INSUFFICIENT_BALANCE", { balance: s(balance), asset: facts.symbolIn ?? "", decimals: String(facts.decimalsIn ?? "") }));
  // The wallet pays the network fee in USDC.
  const usdcLeft = facts.wallet.usdc - (facts.tokenInIsUsdc ? amount : ZERO);
  if (amount <= balance && usdcLeft < facts.thresholds.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));

  // The token rules (D12) for tokens Kawase does not vouch for.
  if (rules && rules.safety !== "block" && rules.unverified) {
    if (rules.access === "verified") results.push(result("TOKEN_RULE_ACCESS"));
    else if (rules.tradeUsd !== null && rules.tradeUsd > rules.perTradeUsd) results.push(result("TOKEN_RULE_TRADE", { limit: usd(rules.perTradeUsd), value: usd(rules.tradeUsd) }));
    else if (rules.tradeUsd !== null && rules.spentTodayUsd + rules.tradeUsd > rules.perDayUsd)
      results.push(result("TOKEN_RULE_DAY", { limit: usd(rules.perDayUsd), spent: usd(rules.spentTodayUsd) }));
    else results.push(result("TOKEN_UNVERIFIED", { reason: rules.reasons[0] ?? "unverified" }));
  }

  const quote = facts.quote;
  if (quote.status === "unavailable") results.push(result("QUOTE_UNAVAILABLE"));
  if (quote.status === "ok" && quote.rateGapBps !== undefined) {
    // The brake (cards/automate-safety.md): over the rule it warns and needs the person's explicit override; only a
    // price far beyond it is refused outright.
    if (quote.rateGapBps > facts.thresholds.maxRateGapBps * BRAKE_HARD_FACTOR)
      results.push(result("PRICE_IMPACT_HIGH", { gap: percent(quote.rateGapBps), max: percent(facts.thresholds.maxRateGapBps * BRAKE_HARD_FACTOR) }));
    else if (quote.rateGapBps > facts.thresholds.maxRateGapBps)
      results.push(result("BRAKE_PRICE_IMPACT", { gap: percent(quote.rateGapBps), max: percent(facts.thresholds.maxRateGapBps) }));
    else if (quote.rateGapBps > facts.thresholds.warnRateGapBps) results.push(result("RATE_BELOW_REFERENCE", { gap: percent(quote.rateGapBps) }));
  }
  return done(results, tokenIn, tokenOut);
}
