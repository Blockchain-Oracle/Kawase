// The checks for one Kawase Margin order (trade.md "Long / short"), as a pure function of gathered facts: the market
// and side (computed from the venue's live reserves), the margin and leverage asked for against the cap the
// collateral factor allows, the person's USDC, and whether a plan could be built. Every order is the owner's own
// slide (R5: perps always need it); the allowance never covers it.
import type { CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { blockingResult, result, type PolicyResult } from "./reasons";
import type { AmountFacts } from "./send";

export type MarginFacts = {
  network: NetworkId;
  capability: { here: CapabilityState; other: CapabilityState };
  signedIn: boolean;
  pausedAll: boolean;
  wallet: { registered: boolean; setUp: boolean; usdc: bigint };
  action: "open" | "close";
  market:
    | { status: "missing" }
    | { status: "unknown"; name: string }
    | { status: "found"; symbol: string; side: "long" | "short" | null; sideAvailable: boolean; sideReason: string | null; maxLeverageBps: number };
  /** Open: USDC base units of margin; close: unused. */
  amount: AmountFacts;
  leverageBps: number | null;
  /** Close: the position named (or the only one in the market). */
  position: { status: "missing" } | { status: "found" } | { status: "not_needed" };
  plan: { status: "not_requested" } | { status: "ok"; liquidationPrice: string | null } | { status: "unavailable" } | { status: "too_high" };
  thresholds: { gasFloat: bigint };
};

export type MarginEvaluation = { results: PolicyResult[]; blocking: PolicyResult | undefined };

const ZERO = 0n;
/** Leverage is shown to one decimal, rounded down (3.44× → "3.4"). */
const BPS_PER_TENTH = 1_000;
/** The brake: leverage above 5× (10_000 bps = 1×). */
const BRAKE_LEVERAGE_BPS = 50_000;
const TENTHS = 10;
const s = (value: bigint) => value.toString();
const leverage = (bps: number) => (Math.floor(bps / BPS_PER_TENTH) / TENTHS).toString();
const done = (results: PolicyResult[]): MarginEvaluation => ({ results, blocking: blockingResult(results) });

export function evaluateMargin(facts: MarginFacts): MarginEvaluation {
  const results: PolicyResult[] = [];
  if (!facts.signedIn) return done([result("SIGN_IN_REQUIRED")]);
  if (facts.capability.here !== "available") {
    const elsewhere = facts.capability.other === "available";
    return done([result(elsewhere ? "ON_OTHER_NETWORK" : "NOT_AVAILABLE_YET", { capability: "margin" })]);
  }
  if (!facts.wallet.registered) return done([result("WALLET_NOT_READY")]);
  // Pause all stops everything that would move without the person (X30); this is always the person's own yes, so it
  // goes on, and the card says the pause is on.
  if (facts.pausedAll) results.push(result("AGENT_PAUSED"));
  if (!facts.wallet.setUp) results.push(result("WALLET_NOT_SET_UP"));

  if (facts.market.status === "missing") return done([...results, result("MARKET_MISSING")]);
  if (facts.market.status === "unknown") return done([...results, result("MARGIN_MARKET_UNAVAILABLE", { market: facts.market.name })]);
  const market = facts.market;
  if (facts.action === "close") {
    if (facts.position.status === "missing") return done([...results, result("POSITION_MISSING", { market: market.symbol })]);
  } else {
    if (!market.side) return done([...results, result("SIDE_MISSING", { market: market.symbol })]);
    if (!market.sideAvailable)
      return done([...results, result("MARGIN_SIDE_UNAVAILABLE", { market: market.symbol, side: market.side, reason: market.sideReason ?? "not_borrowable" })]);
    if (facts.amount.status === "missing") results.push(result("AMOUNT_MISSING"));
    if (facts.amount.status === "invalid" || (facts.amount.status === "ok" && facts.amount.baseUnits <= ZERO)) results.push(result("AMOUNT_INVALID"));
    if (facts.leverageBps !== null && facts.leverageBps > market.maxLeverageBps) results.push(result("LEVERAGE_TOO_HIGH", { max: leverage(market.maxLeverageBps) }));
    // The brake (cards/automate-safety.md): above 5× it warns and needs the person's explicit override.
    else if (facts.leverageBps !== null && facts.leverageBps > BRAKE_LEVERAGE_BPS) results.push(result("BRAKE_LEVERAGE", { leverage: leverage(facts.leverageBps) }));
    if (facts.amount.status === "ok" && facts.amount.baseUnits > ZERO) {
      const margin = facts.amount.baseUnits;
      if (margin > facts.wallet.usdc) results.push(result("INSUFFICIENT_BALANCE", { balance: s(facts.wallet.usdc), asset: "USDC" }));
      else if (facts.wallet.usdc - margin < facts.thresholds.gasFloat) results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
    }
  }
  if (facts.wallet.usdc < facts.thresholds.gasFloat && facts.action === "close") results.push(result("INSUFFICIENT_GAS", { needed: s(facts.thresholds.gasFloat), asset: "USDC" }));
  if (facts.plan.status === "unavailable") results.push(result("QUOTE_UNAVAILABLE"));
  if (facts.plan.status === "too_high") results.push(result("LEVERAGE_TOO_HIGH", { max: leverage(market.maxLeverageBps) }));
  if (facts.plan.status === "ok" && facts.action === "open") results.push(result("MARGIN_RISK", facts.plan.liquidationPrice ? { liquidation: facts.plan.liquidationPrice } : undefined));
  return done(results);
}
