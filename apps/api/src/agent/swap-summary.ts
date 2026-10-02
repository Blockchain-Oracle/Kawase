// What the model is told about a proposed swap: plain English with the numbers already formatted. The card carries
// the exact figures and the button.
import type { PolicyResultView, SwapIntent, SwapSummary } from "@kawase/api-client";
import { ASSETS, formatTokenAmount, type AssetId } from "@kawase/money";

const DISPLAY_LOCALE = "en";
const BPS_PER_PERCENT = 100;
const SHOWN_DIGITS = 6;

/** Decimals by symbol for the words: the draft's own tokens first, USDC/EURC otherwise. */
let decimalsBySymbol = new Map<string, number>();
const money = (asset: string | null | undefined, baseUnits: string | null | undefined, decimals?: string) => {
  if (!baseUnits || !asset) return "";
  const known = decimals ? Number(decimals) : (decimalsBySymbol.get(asset) ?? ASSETS[asset as AssetId]?.decimals);
  return known === undefined ? `${baseUnits} base units of ${asset}` : formatTokenAmount(BigInt(baseUnits), known, asset, DISPLAY_LOCALE, { fractionDigits: SHOWN_DIGITS });
};

function describe(result: PolicyResultView): string {
  const p = result.params ?? {};
  switch (result.code) {
    case "NOT_AVAILABLE_YET":
      return "Swapping is not available on this network yet.";
    case "ON_OTHER_NETWORK":
      return "Swapping works on the other network; offer to switch.";
    case "SIGN_IN_REQUIRED":
      return "The person must sign in before swapping.";
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      return "The wallet is not set up on this network yet; the card offers to set it up.";
    case "INSUFFICIENT_BALANCE":
      return `Not enough money: the balance is ${money(p.asset, p.balance, p.decimals)}.`;
    case "INSUFFICIENT_GAS":
      return `A little USDC must stay for the network fee (about ${money("USDC", p.needed)}).`;
    case "AMOUNT_MISSING":
      return "How much?";
    case "AMOUNT_INVALID":
      return "The amount is not valid.";
    case "ASSET_UNCLEAR":
      return "Which currency do they want to swap from?";
    case "SWAP_SAME_TOKEN":
      return "Both sides are the same currency.";
    case "SWAP_PAIR_UNSUPPORTED":
      return "Kawase cannot swap that pair here.";
    case "QUOTE_UNAVAILABLE":
      return "No price is available right now; they can try again in a moment.";
    case "PRICE_IMPACT_HIGH":
      return `The price is ${p.gap}% below the market rate, more than the ${p.max}% Kawase allows. Suggest a smaller amount or waiting.`;
    case "RATE_BELOW_REFERENCE":
      return `The price is ${p.gap}% below the market rate.`;
    case "TOKEN_BLOCKED":
      return `Kawase will not buy this token (${p.reason === "impersonator" ? "it uses a stablecoin's name at a fake address" : `its contract checks failed: ${p.reason}`}). Say so plainly and do not look for another way to buy it.`;
    case "TOKEN_RULE_TRADE":
      return `The person's token rules allow at most $${p.limit} per trade in unverified tokens; this is about $${p.value}. Offer a smaller amount, or changing the rule (with Face ID).`;
    case "TOKEN_RULE_DAY":
      return `The person's token rules allow at most $${p.limit} a day in unverified tokens, and $${p.spent} is already used today. Offer changing the rule in Token rules (with Face ID).`;
    case "TOKEN_RULE_ACCESS":
      return "The person's token rules allow only tokens Kawase vouches for, and this one is unverified. Say so; they can change it in Token rules (with Face ID).";
    case "TOKEN_UNVERIFIED":
      return `This token is not on the lists Kawase checks (${p.reason}); the card warns them.`;
    default:
      return result.code;
  }
}

export function summarizeSwap(intent: SwapIntent): SwapSummary {
  const blocking = intent.blocking;
  const draft = intent.draft;
  decimalsBySymbol = new Map(draft?.tokens ? [[draft.tokens.in.symbol, draft.tokens.in.decimals], [draft.tokens.out.symbol, draft.tokens.out.decimals]] : []);
  const moving = intent.state === "executing" || intent.state === "approved" || intent.state === "unknown_outcome";
  const status: SwapSummary["status"] =
    intent.state === "completed"
      ? "swapped"
      : moving
        ? "swapping"
        : intent.state === "failed"
          ? "failed"
          : !blocking
            ? "ready"
            : blocking.code === "SIGN_IN_REQUIRED"
              ? "needs_sign_in"
              : blocking.kind === "clarification"
                ? "needs_answer"
                : blocking.kind === "precondition"
                  ? "needs_fix"
                  : blocking.kind === "policy"
                    ? "refused"
                    : "not_possible";
  const trade = draft
    ? `${money(draft.tokenIn, draft.amountIn)} → about ${money(draft.tokenOut, draft.estimatedOut)} (at least ${money(draft.tokenOut, draft.minOut)})`
    : intent.request.amount
      ? `${intent.request.amount} ${intent.request.tokenIn ?? ""}`.trim()
      : null;
  const rate =
    draft?.marketRate && draft.rateGapBps !== null
      ? `1 ${draft.tokenIn} = ${draft.rate} ${draft.tokenOut} here; the market rate is ${draft.marketRate} (${(Math.abs(draft.rateGapBps) / BPS_PER_PERCENT).toFixed(1)}% ${draft.rateGapBps >= 0 ? "below" : "above"} it).`
      : draft
        ? `1 ${draft.tokenIn} = ${draft.rate} ${draft.tokenOut}.`
        : null;
  const others = (draft?.routes ?? []).filter((route) => route.status === "quoted").map((route) => route.label);
  const venue = draft?.routes?.length ? ` Best of ${draft.routes.length} venues: ${draft.provider}${others.length ? `, ahead of ${others.join(" and ")}` : ""}.` : "";
  return {
    intentId: intent.id,
    network: intent.network,
    status,
    trade,
    rate: rate ? `${rate}${venue}` : rate,
    problem: blocking ? describe(blocking) : null,
    warnings: intent.results.filter((entry) => entry.kind === "warning").map(describe),
  };
}
