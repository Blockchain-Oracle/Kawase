// The agent's money-out reads (builder A2): propose_withdraw plans through the same WithdrawService as the screen,
// and says what the card shows in words the model can repeat (one line per asset, the warnings, what is missing).
import type { AgentContext } from "@kawase/agent";
import type { WithdrawLegView, WithdrawPlanView, WithdrawReason } from "@kawase/api-client";

import type { SessionUser } from "../types";
import type { WithdrawService } from "../withdraw/service";

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;

const REASONS: Record<WithdrawReason, string> = {
  no_balance: "they hold none of it",
  insufficient: "more than they hold (after the network fee reserve)",
  cannot_convert: "it cannot be converted to cash",
  convert_first: "no bridge carries it to that chain: it can go as cash (USDC) instead",
  mainnet_only: "converting it is mainnet-only",
  exchange_mainnet_only: "exchanges hold real money, so they are mainnet only (switch networks, or withdraw to their own wallet)",
  needs_address: "the deposit address is needed (they paste it on the card's screen; their exchange shows it under Deposit → USDC → the network named)",
  bad_address: "that is not an address",
  no_destination: "where to is not known yet (an exchange, a saved place, or their own wallet and chain)",
  unknown_chain: "Kawase does not reach that chain",
  exchange_not_accepted: "WARNING: the exchange does not credit this asset on that network and it may be lost; offer to send it as cash (USDC) instead",
  exchange_unconfirmed: "the exchange has not confirmed this network: suggest a small test amount first",
  exchange_limited: "the exchange sometimes pauses this network",
};

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

function legLine(leg: WithdrawLegView): string {
  const route = leg.steps
    .map((step) => (step === "swap" ? "convert to USDC on Arc" : step === "transfer" ? "transfer on Arc" : `bridge to ${leg.receive.chain}`))
    .join(", then ");
  const receive = leg.receive.amountText ? `${leg.as === "cash" ? "about " : ""}${leg.receive.amountText} ${leg.receive.symbol}` : leg.receive.symbol;
  const why = leg.reason ? ` (${leg.status === "blocked" ? "cannot go: " : ""}${REASONS[leg.reason]})` : "";
  return `${leg.amountText} ${leg.token.symbol} as ${leg.as === "cash" ? "cash" : "itself"}: ${route}; arrives ${receive}${why}`;
}

export function summarizeWithdraw(plan: WithdrawPlanView, isGuest: boolean): string {
  if (isGuest) return "They need to sign in first; the card opens sign-in, then Withdraw.";
  const where = plan.destination
    ? `${plan.destination.label ?? plan.destination.exchange?.name ?? "their own wallet"} on ${plan.destination.chain.name}${plan.destination.address ? ` (${short(plan.destination.address)})` : ""}`
    : "an undecided place";
  const head = `Withdraw to ${where} on ${plan.network === "mainnet" ? "Arc mainnet (real money)" : "Arc Testnet"}.`;
  const lines = plan.legs.length > 0 ? plan.legs.map(legLine).join(". ") : "No assets chosen yet (they pick on the card's screen).";
  const stop = plan.blocking ? ` Before it can go: ${REASONS[plan.blocking]}.` : "";
  return `${head} ${lines}.${stop} The card opens Withdraw: they review the lines and confirm with one Face ID. Nothing has moved.`;
}

export function moneyOutContext(input: { user: SessionUser; withdraw: WithdrawService | undefined }): Partial<AgentContext> {
  const { user, withdraw } = input;
  if (!withdraw) return {};
  return {
    async proposeWithdraw(request) {
      const plan = await withdraw.plan(user, request);
      return { withdraw: true as const, plan, input: request, summary: summarizeWithdraw(plan, user.isAnonymous) };
    },
  };
}
