// How one row of the agent's feed reads: one line that says what Kawase did ("Swapped 2 USDC → 1.71 EURC"), the
// outcome as a word (never colour alone: Done, Held for you, Skipped and why, Watching, Found), the venue it went
// through, and when. Shared by Home's feed, Activity and the detail sheet, so a row reads the same everywhere.
import type { AgentFeedGroup, AgentFeedItem } from "@kawase/api-client";
import { getVenueIdentity } from "@kawase/identity";
import { formatTokenAmount } from "@kawase/money";

import { useRunReason } from "@/automations/copy";
import { copyFor } from "@/home/for-you";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

const SHORT_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEAD = 6;
const TAIL = 4;
const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;

const short = (value: string) => (SHORT_ADDRESS.test(value) ? `${value.slice(0, HEAD)}…${value.slice(-TAIL)}` : value);

/** The automation's period in seconds, for the Watching row's ring (it empties over one period). */
export const PERIOD_SECONDS: Record<string, number> = { hour: 3_600, day: 86_400, week: 604_800, month: 2_592_000 };

export function useFeedCopy() {
  const { t } = useT();
  const { locale } = useLocale();
  const reason = useRunReason();

  const money = (amount: string | null, token: AgentFeedItem["token"]) => {
    if (!amount || !token) return "";
    // Feed amounts are base units; an "asked" amount is a decimal as typed.
    return /^\d+$/.test(amount) ? formatTokenAmount(BigInt(amount), token.decimals, token.symbol, locale, { trimZeros: true }) : `${amount} ${token.symbol}`;
  };

  const venueName = (item: AgentFeedItem) => (item.venue ? (getVenueIdentity(item.venue)?.name ?? null) : null);

  /** The one line: what Kawase did, with its amounts. */
  const line = (item: AgentFeedItem): string => {
    const what = money(item.amount, item.token);
    const who = item.counterparty ? short(item.counterparty) : "";
    const asked = item.asked ? [item.asked.amount, item.asked.from].filter(Boolean).join(" ") : "";
    switch (item.kind) {
      case "swap":
        if (item.other) return t("feed.list.lineSwap", { from: money(item.other.amount, item.other.token), to: what });
        return t("feed.list.lineSwapAsked", { from: asked || what, to: item.asked?.to ?? item.token?.symbol ?? "" });
      case "send":
      case "practice":
        return t("feed.list.lineSend", { amount: what || asked, name: who || (item.asked?.to ?? "") });
      case "bridge":
      case "crosschain":
        return t("feed.list.lineBridge", { amount: what || asked, place: who || (item.asked?.to ?? "") });
      case "earn":
      case "lend":
        return t("feed.list.lineEarn", { amount: what || asked, place: who });
      case "withdraw":
        return t("feed.list.lineWithdraw", { amount: what || asked, place: who });
      case "margin": {
        const side = item.asked?.from === "long" || item.asked?.from === "short" ? t(`margin.${item.asked.from}`) : null;
        const market = item.asked?.to ?? null;
        const stake = what || (item.asked?.amount ? `${item.asked.amount} USDC` : "");
        if (side && market) return stake ? t("feed.list.lineMarginSide", { side, market, amount: stake }) : t("feed.list.lineMarginBare", { side, market });
        return stake ? t("feed.list.lineMargin", { amount: stake }) : t("feed.list.lineMarginAny");
      }
      case "automation":
        return who ? t("feed.list.lineAutomationTo", { amount: what, name: who }) : t("feed.list.lineAutomation");
      case "suggestion":
        return item.suggestion ? t(copyFor(item.suggestion).title, item.suggestion.facts) : t("feed.list.lineFound");
      default:
        return t("feed.list.lineOther");
    }
  };

  /** The outcome as a word, with its reason when it has one. */
  const outcome = (item: AgentFeedItem): string => {
    const why = item.reason && item.source !== "proposal" && item.source !== "automation" ? reason(item.reason, item.reasonParams, item.network) : "";
    switch (item.outcome) {
      case "confirmed":
        return t("feed.list.outcomeDone");
      case "practiced":
        return t("feed.list.outcomePracticed");
      case "in_flight":
        return t("feed.list.outcomeMoving");
      case "waiting":
        return why ? t("feed.list.outcomeHeldWhy", { reason: why }) : t("feed.list.outcomeHeld");
      case "skipped":
        return why ? t("feed.list.outcomeSkippedWhy", { reason: why }) : t("feed.list.outcomeSkipped");
      case "failed":
        return why ? t("feed.list.outcomeFailedWhy", { reason: why }) : t("feed.list.outcomeFailed");
      case "scheduled":
        return t("feed.list.outcomeWatching");
      case "suggested":
        // What makes it worth a look, never a bare "Found": a trending token says how it moved and how deep it is.
        if (item.suggestion?.kind === "trending_token" && item.suggestion.facts.change && item.suggestion.facts.liquidity)
          return t("feed.list.foundTrending", { change: item.suggestion.facts.change, liquidity: item.suggestion.facts.liquidity });
        return t("feed.list.foundHead");
    }
  };

  /** "Done · via KyberSwap": the outcome and the venue, the row's second line. */
  const detail = (item: AgentFeedItem) => {
    const venue = venueName(item);
    return [outcome(item), venue ? t("feed.list.via", { venue }) : null].filter(Boolean).join(" · ");
  };

  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  /** "in 2d 4h" / "in 35 min" until a scheduled run. */
  const until = (iso: string, now: number = Date.now()) => {
    const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now) / MINUTE_MS));
    if (minutes < HOUR_MINUTES) return t("feed.list.inMinutes", { count: minutes });
    const hours = Math.floor(minutes / HOUR_MINUTES);
    if (hours < DAY_HOURS) return t("feed.list.inHours", { hours, minutes: minutes % HOUR_MINUTES });
    return t("feed.list.inDays", { days: Math.floor(hours / DAY_HOURS), hours: hours % DAY_HOURS });
  };

  /** "Today", "Yesterday" or the date: the day a row falls on, for the timeline's groups. */
  const day = (iso: string, now: Date = new Date()) => {
    const date = new Date(iso);
    const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const days = Math.round((start(now) - start(date)) / (DAY_HOURS * HOUR_MINUTES * MINUTE_MS));
    if (days === 0) return t("feed.list.today");
    if (days === 1) return t("feed.list.yesterday");
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(date);
  };

  const group = (value: AgentFeedGroup | "all") => t(`feed.list.filter_${value}`);

  return { line, outcome, detail, time, until, day, group, venueName, money };
}
