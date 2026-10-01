// What the model is told about a drafted automation: the read-back in plain English (when, how much, to whom — or,
// for Auto-save, what it keeps ready and where the rest goes), the next runs, and the bound the chain enforces. The card carries the same in the person's language and the button.
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
const PERCENT = 100;
const APY_DIGITS = 2;

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
    case "VAULT_UNAVAILABLE":
      return "No vault is taking deposits on this network right now.";
    case "AUTO_SAVE_EXISTS":
      return "Auto-save is already on; they can turn it off in Automations first, then set this one.";
    case "VAULT_LOW_LIQUIDITY":
      return "The vault has little liquidity right now; topping up may come in smaller amounts.";
    case "VAULT_RISK_WARNING":
      return `The vault carries warnings: ${p.warnings}.`;
    case "FIRST_RUN_UNDERFUNDED":
      return `They hold ${money(p.asset ?? "USDC", p.balance ?? "0")} now, less than one run; runs are skipped until they add money.`;
    default:
      return result.code;
  }
}

function saveReadBack(automation: AutomationView) {
  const save = automation.save!;
  const keep = money("USDC", save.keep);
  const apy = `${(save.apy * PERCENT).toFixed(APY_DIGITS)}% a year now`;
  const now = save.now
    ? save.now.direction === "in"
      ? ` Right now ${money("USDC", save.now.amount)} would go into savings.`
      : ` Right now ${money("USDC", save.now.amount)} would come back to the wallet.`
    : " Right now there is nothing to move.";
  return `${when(automation)}, and whenever money arrives: keep ${keep} ready in the wallet; anything above goes into savings in ${save.vaultName} (${apy})${save.topUp ? `; if the wallet drops below ${keep}, savings top it up` : ""}.${now}`;
}

export function summarizeAutomation(automation: AutomationView): AutomationSummary {
  const blocking = automation.blocking;
  const a = automation.action;
  const save = automation.save;
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
  const ends = automation.endsAt.slice(0, DATE_CHARS);
  const readBack = save
    ? saveReadBack(automation)
    : a && a.amount !== "0"
      ? `${when(automation)}: send ${money(a.asset, a.amount)} to ${a.recipientName ?? a.recipientWords}${a.note ? ` ("${a.note}")` : ""}`
      : null;
  const bound = save
    ? `Kawase can only move USDC between their wallet and their own savings in ${save.vaultName}, never to anyone else, enforced on Arc by the three grants they sign with one Face ID; it ends on ${ends}.`
    : a && a.amount !== "0"
      ? `At most ${money(a.asset, a.amount)} ${per} can ever go, and only to this address, enforced on Arc by the grant they sign; it ends on ${ends}.`
      : null;
  return {
    automationId: automation.id,
    network: automation.network,
    status,
    readBack,
    nextRuns: automation.nextRuns,
    bound,
    problem: blocking ? describe(blocking) : null,
    warnings: automation.results.filter((entry) => entry.kind === "warning").map(describe),
  };
}
