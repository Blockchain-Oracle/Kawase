// What the model is told about a proposed send: plain English, with amounts already formatted, so it only has to
// say it again in the person's language. The card on the screen carries the exact numbers and the buttons.
import type { PolicyResultView, SendIntent, SendSummary } from "@kawase/api-client";
import { amount, formatAmount, type AssetId } from "@kawase/money";

const DISPLAY_LOCALE = "en";
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;
const money = (asset: string | undefined, baseUnits: string | undefined) =>
  baseUnits && asset ? formatAmount(amount(asset as AssetId, BigInt(baseUnits)), DISPLAY_LOCALE) : "";

/** One sentence per reason, for the model (the app has its own translated copy). */
function describe(result: PolicyResultView): string {
  const p = result.params ?? {};
  switch (result.code) {
    case "NOT_AVAILABLE_YET":
      return "Sending is not available on this network yet.";
    case "ON_OTHER_NETWORK":
      return "Sending works on the other network; offer to switch (propose_network_switch).";
    case "PAUSED_ALL":
      return "The person paused all sending; they can resume it in Settings.";
    case "OVER_PER_TX_LIMIT":
      return `Above their limit of ${money(p.asset, p.limit)} per send. They can lower the amount or change the limit.`;
    case "OVER_DAILY_LIMIT":
      return `Over their daily limit of ${money(p.asset, p.limit)} (${money(p.asset, p.used)} already used today). Do not offer to split it.`;
    case "OVER_WEEKLY_LIMIT":
      return `Over their weekly limit of ${money(p.asset, p.limit)} (${money(p.asset, p.used)} used this week). Do not offer to split it.`;
    case "ADDRESS_CHANGE_HOLD":
      return `${p.name}'s address was changed recently, so payments to them are frozen until ${p.until} as a safety hold.`;
    case "RECIPIENT_BLOCKED":
      return `${p.name} is blocked.`;
    case "SIGN_IN_REQUIRED":
      return "The person must sign in before sending.";
    case "WALLET_NOT_READY":
      return "The person's wallet is not set up yet.";
    case "WALLET_NOT_SET_UP":
      return "The wallet is not set up on this network yet.";
    case "INSUFFICIENT_BALANCE":
      return `Not enough money: the balance is ${money(p.asset, p.balance)}. The card offers to add money.`;
    case "INSUFFICIENT_GAS":
      return `This send needs a little USDC left over for the network fee (about ${money("USDC", p.needed)}).`;
    case "RECIPIENT_MISSING":
      return "Who should receive it?";
    case "RECIPIENT_UNKNOWN":
      return `"${p.query}" is not in their contacts. The card lets them add them with an address or @handle.`;
    case "RECIPIENT_AMBIGUOUS":
      return `Several contacts match "${p.query}". Ask which one.`;
    case "RECIPIENT_INVALID":
      return `"${p.query}" is not a valid Arc address.`;
    case "RECIPIENT_IS_SELF":
      return "That is the person's own address.";
    case "RECIPIENT_NO_WALLET":
      return `@${p.handle} has no wallet yet.`;
    case "AMOUNT_MISSING":
      return "How much?";
    case "AMOUNT_INVALID":
      return "The amount is not valid.";
    case "ASSET_UNCLEAR":
      return "They hold both USDC and EURC: which one? The card shows both.";
    case "FIRST_TIME_RECIPIENT":
      return "First payment to this address.";
    case "LOOKALIKE_ADDRESS":
      return `This address looks like ${p.name}'s but is different. Ask them to check it carefully.`;
    case "UNSAVED_ADDRESS":
      return "The address is not a saved contact.";
    case "ABOVE_ALLOWANCE":
      return `Above what is left of the daily allowance (${money(p.asset, p.available)}), so it needs Face ID.`;
    case "NO_ALLOWANCE":
      return "The daily allowance is off, so it needs Face ID.";
    case "LEAVES_LITTLE_FOR_FEES":
      return "Very little USDC will be left for future network fees.";
    default:
      return result.code;
  }
}

export function summarizeSend(intent: SendIntent): SendSummary {
  const blocking = intent.blocking;
  const draft = intent.draft;
  const recipient = draft
    ? draft.recipient.name
      ? `${draft.recipient.name}${draft.recipient.handle ? ` (@${draft.recipient.handle})` : ""}`
      : draft.recipient.handle
        ? `@${draft.recipient.handle}`
        : short(draft.recipient.address)
    : intent.request.recipient;
  const moving = intent.state === "executing" || intent.state === "approved" || intent.state === "unknown_outcome";
  const status: SendSummary["status"] =
    intent.state === "completed"
      ? "sent"
      : moving
        ? "sending"
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
  return {
    intentId: intent.id,
    network: intent.network,
    status,
    recipient,
    amount: draft
      ? money(draft.asset, draft.amount)
      : intent.request.amount
        ? `${intent.request.amount} ${intent.request.asset ?? ""}`.trim()
        : null,
    approval: moving
      ? "Sending now, inside the daily allowance: no prompt was needed. The card shows when it lands."
      : blocking
        ? null
        : intent.route === "allowance"
          ? "Inside the daily allowance; it goes when they tap Send on the card."
          : "Needs their Face ID: they tap Send on the card and confirm.",
    problem: blocking ? describe(blocking) : null,
    warnings: intent.results.filter((entry) => entry.kind === "warning").map(describe),
  };
}
