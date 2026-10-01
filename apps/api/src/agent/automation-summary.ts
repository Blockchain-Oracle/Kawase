// What the model is told about a drafted automation: the read-back in plain English (when, how much, to whom), the
// next runs, and the bound the chain enforces. The card carries the same in the person's language and the button.
import type { AutomationSummary, AutomationView, PolicyResultView } from "@kawase/api-client";
import { amount, formatAmount, type AssetId } from "@kawase/money";

const DISPLAY_LOCALE = "en";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIOD_WORDS: Record<string, string> = { day: "a day", week: "a week", month: "a month (28 days)" };

const money = (asset: string, baseUnits: string) => formatAmount(amount(asset as AssetId, BigInt(baseUnits)), DISPLAY_LOCALE);
const ORDINAL_SUFFIX: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
const ordinals = new Intl.PluralRules(DISPLAY_LOCALE, { type: "ordinal" });
const ordinal = (n: number) => `${n}${ORDINAL_SUFFIX[ordinals.select(n)] ?? "th"}`;
/** "YYYY-MM-DD" from an ISO timestamp. */
const DATE_CHARS = 10;

function when(automation: AutomationView) {
  const s = automation.schedule;
  const at = `at ${s.time} (${s.timezone})`;
  if (s.every === "day") return `Every day ${at}`;
  if (s.every === "week") return `Every ${WEEKDAYS[s.weekday ?? 0]} ${at}`;
  return `On the ${ordinal(s.monthday ?? 1)} of every month ${at}`;
}

function describe(result: PolicyResultView): string {
  const p = result.params ?? {};
  switch (result.code) {
    case "SIGN_IN_REQUIRED":
      return "The person must sign in first.";
    case "NOT_AVAILABLE_YET":
      return "Automations are not available on this network yet.";
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      return "The wallet is not set up on this network yet; the card offers to set it up.";
    case "RECIPIENT_MISSING":
      return "Who should receive it?";
    case "RECIPIENT_UNKNOWN":
      return `"${p.query}" is not in their contacts; they can add them first (an address or @handle).`;
    case "RECIPIENT_AMBIGUOUS":
      return `Several contacts match "${p.query}". Ask which one.`;
    case "RECIPIENT_INVALID":
      return `"${p.query}" is not a valid Arc address.`;
    case "RECIPIENT_IS_SELF":
      return "That is the person's own address.";
    case "RECIPIENT_NO_WALLET":
      return `@${p.handle} has no wallet yet.`;
    case "RECIPIENT_BLOCKED":
      return `${p.name} is blocked.`;
    case "ADDRESS_CHANGE_HOLD":
      return `${p.name}'s address changed recently; automations to them wait until ${p.until}.`;
    case "LOOKALIKE_ADDRESS":
      return `The address looks like ${p.name}'s but is different; ask them to check it.`;
    case "UNSAVED_ADDRESS":
      return "The address is not a saved contact.";
    case "SCHEDULE_INVALID":
      return "That schedule cannot be kept (an unknown time zone or day).";
    case "AMOUNT_MISSING":
      return "How much each time?";
    case "AMOUNT_INVALID":
      return "The amount is not valid.";
    case "OVER_PER_TX_LIMIT":
      return `More than their limit of ${money(p.asset ?? "USDC", p.limit ?? "0")} per send.`;
    case "FIRST_RUN_UNDERFUNDED":
      return `They hold ${money(p.asset ?? "USDC", p.balance ?? "0")} now, less than one run; runs are skipped until they add money.`;
    default:
      return result.code;
  }
}

export function summarizeAutomation(automation: AutomationView): AutomationSummary {
  const blocking = automation.blocking;
  const a = automation.action;
  const who = a.recipientName ?? a.recipientWords;
  const status: AutomationSummary["status"] =
    automation.status === "active"
      ? "on"
      : automation.status === "paused"
        ? "paused"
        : automation.status === "canceled" || automation.status === "ended"
          ? "ended"
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
  const per = PERIOD_WORDS[automation.schedule.every] ?? "per period";
  return {
    automationId: automation.id,
    network: automation.network,
    status,
    readBack: a.amount !== "0" ? `${when(automation)}: send ${money(a.asset, a.amount)} to ${who}${a.note ? ` ("${a.note}")` : ""}` : null,
    nextRuns: automation.nextRuns,
    bound: a.amount !== "0" ? `At most ${money(a.asset, a.amount)} ${per} can ever go, and only to this address, enforced on Arc by the grant they sign; it ends on ${automation.endsAt.slice(0, DATE_CHARS)}.` : null,
    problem: blocking ? describe(blocking) : null,
    warnings: automation.results.filter((entry) => entry.kind === "warning").map(describe),
  };
}
