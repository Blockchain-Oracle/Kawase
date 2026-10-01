// What the model is told about a proposed bridge, in plain English with the numbers formatted. The card carries
// the exact figures, the route comparison and the button.
import type { BridgeIntent, BridgeSummary, PolicyResultView } from "@kawase/api-client";
import { getChainIdentity } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";

const DISPLAY_LOCALE = "en";
const REASONS = {
  quote_only: "quoted, but Kawase does not execute this provider yet",
  no_quote: "no quote right now",
  timeout: "did not answer in time",
  not_on_arc_testnet: "does not serve Arc Testnet",
  not_on_arc: "does not serve Arc",
} as const;
const usdc = (baseUnits: string | null | undefined) => (baseUnits ? formatAmount(amount("USDC", BigInt(baseUnits)), DISPLAY_LOCALE) : "");

function describe(result: PolicyResultView): string {
  const p = result.params ?? {};
  switch (result.code) {
    case "NOT_AVAILABLE_YET":
      return "Bridging is not available on this network yet.";
    case "ON_OTHER_NETWORK":
      return "Bridging works on the other network; offer to switch.";
    case "SIGN_IN_REQUIRED":
      return "The person must sign in first.";
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      return "The wallet is not set up on this network yet; the card offers to set it up.";
    case "DESTINATION_MISSING":
      return "Which chain? Base, Ethereum, Arbitrum, Optimism, Polygon or Avalanche.";
    case "AMOUNT_MISSING":
      return "How much USDC?";
    case "AMOUNT_INVALID":
      return "The amount is not valid.";
    case "INSUFFICIENT_BALANCE":
      return `Not enough USDC: the balance is ${usdc(p.balance)}.`;
    case "INSUFFICIENT_GAS":
      return `A little USDC must stay on Arc for the network fee (about ${usdc(p.needed)}).`;
    case "AMOUNT_BELOW_FEE":
      return `The amount does not cover the route's fee of up to ${usdc(p.fee)}; suggest a larger amount.`;
    case "QUOTE_UNAVAILABLE":
      return "No route answered right now; they can try again in a moment.";
    default:
      return result.code;
  }
}

export function summarizeBridge(intent: BridgeIntent): BridgeSummary {
  const blocking = intent.blocking;
  const draft = intent.draft;
  const moving = intent.state === "executing" || intent.state === "approved" || intent.state === "unknown_outcome";
  const status: BridgeSummary["status"] =
    intent.state === "completed"
      ? "delivered"
      : moving
        ? "bridging"
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
  const chain = draft ? (getChainIdentity(draft.chainId)?.name ?? draft.destination) : intent.request.destination;
  const from = intent.network === "testnet" ? "Arc Testnet" : "Arc";
  const others = draft?.routes.filter((route) => route.status !== "chosen").map((route) => `${route.provider}: ${route.received ? `${usdc(route.received)} would arrive (${route.reason ? REASONS[route.reason] : ""})` : route.reason ? REASONS[route.reason] : ""}`);
  return {
    intentId: intent.id,
    network: intent.network,
    status,
    transfer: draft ? `${usdc(draft.amount)} from ${from} → at least ${usdc(draft.minReceived)} on ${chain} (fee up to ${usdc(draft.maxRouteFee)}, no gas needed there)` : intent.request.amount ? `${intent.request.amount} USDC → ${chain ?? "?"}` : null,
    route: draft ? `Circle CCTP through App Kit: native USDC burned on Arc and minted on ${chain} by Circle's forwarder.${others?.length ? ` Also checked: ${others.join("; ")}.` : ""}` : null,
    problem: blocking ? describe(blocking) : null,
  };
}
