// Every word and number the share card shows, formatted once for both renderers (the web canvas and the phone's native
// drawing): the person's language and display currency, signed money the way wallet rows sign it, dates in the
// person's calendar words. The film asks for the moving figures at each frame (`figureAt`, `pillAt`).
import { PUBLIC_LINKS } from "@kawase/config";
import type { TFunction } from "i18next";

import { money, type Fx } from "@/portfolio/format";

import type { FactKey, PeriodCardData, ShareFact, SharePeriod } from "./model";

const MINUS = "−";
const PCT_DIGITS = 1;
const DAY_MS = 86_400_000;
const SAME_DAY_MS = DAY_MS;

export const CARD_URL = PUBLIC_LINKS.landing;
export const CARD_URL_LABEL = CARD_URL.replace(/^https?:\/\//, "");

export type CardWords = {
  handle: string;
  dates: string;
  chip: string;
  network: string;
  label: string;
  figure: string;
  pct: string | null;
  pctUp: boolean | null;
  fromStart: string | null;
  facts: readonly { label: string; value: string }[];
  ticks: readonly [string, string, string];
  pill: string;
  word: string;
  stubLine: string;
  /** For the share sheet's text and the image's accessibility label. */
  periodName: string;
  shareText: string;
  alt: string;
};

export type Tone = "up" | "down" | "flat";
export const toneOf = (change: number): Tone => (change > 0.004 ? "up" : change < -0.004 ? "down" : "flat");

export function signedMoney(usd: number, fx: Fx, locale: string): string {
  const body = money(Math.abs(usd), fx, locale);
  return usd > 0.004 ? `+${body}` : usd < -0.004 ? `${MINUS}${body}` : body;
}

const PERIOD_KEY: Record<SharePeriod, { period: string; chip: string }> = {
  "7d": { period: "shareCard.period7d", chip: "shareCard.chip7d" },
  "30d": { period: "shareCard.period30d", chip: "shareCard.chip30d" },
  all: { period: "shareCard.periodAll", chip: "shareCard.chipAll" },
};

const FACT_KEY: Record<FactKey, string> = {
  received: "shareCard.received",
  sent: "shareCard.sent",
  swapped: "shareCard.swapped",
  bridged: "shareCard.bridged",
  saved: "shareCard.saved",
  traded: "shareCard.traded",
};

function factValue(fact: ShareFact, fx: Fx, locale: string, t: TFunction): string {
  if (fact.usd !== null) return money(fact.usd, fx, locale);
  return fact.count > 0 ? t("shareCard.times", { count: fact.count }) : money(0, fx, locale);
}

/** "9 Oct – 16 Oct 2026", "16 Oct 2026", "2 Sep 2026 – 16 Oct 2026". */
function dateRange(from: number, to: number, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const a = day.format(new Date(from));
  const b = day.format(new Date(to));
  return a === b ? b : `${a} – ${b}`;
}

/** Three ticks under the plot: its start, middle and end, in hours for a single day and in dates otherwise. */
function ticksOf(from: number, to: number, locale: string, nowWord: string): [string, string, string] {
  const span = to - from;
  const fmt =
    span <= SAME_DAY_MS
      ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return [fmt.format(new Date(from)), fmt.format(new Date(from + span / 2)), nowWord];
}

export function cardWords(input: {
  card: PeriodCardData;
  handle: string;
  fx: Fx;
  locale: string;
  t: TFunction;
}): CardWords {
  const { card, fx, locale, t } = input;
  const keys = PERIOD_KEY[card.period];
  const figure = signedMoney(card.change, fx, locale);
  const pct = card.changePct === null ? null : `${Math.abs(card.changePct).toLocaleString(locale, { maximumFractionDigits: PCT_DIGITS, minimumFractionDigits: PCT_DIGITS })}%`;
  const periodName = t(keys.chip);
  return {
    handle: input.handle,
    dates: dateRange(card.from, card.to, locale),
    chip: periodName,
    network: card.network === "testnet" ? t("shareCard.testnetLine") : t("shareCard.mainnetLine"),
    label: t("shareCard.netChange"),
    figure,
    pct,
    pctUp: card.changePct === null ? null : card.changePct >= 0,
    // "from $0.00" says nothing on a new wallet: the start shows only where the percentage does.
    fromStart: card.changePct === null ? null : t("shareCard.fromStart", { amount: money(card.start, fx, locale) }),
    facts: card.facts.map((fact) => ({ label: t(FACT_KEY[fact.key]), value: factValue(fact, fx, locale, t) })),
    ticks: ticksOf(card.from, card.to, locale, t("shareCard.now")),
    pill: money(card.end, fx, locale),
    word: "Kawase",
    stubLine: t("shareCard.stubLine"),
    periodName,
    shareText: t("shareCard.shareText", { period: periodName.toLocaleLowerCase(locale), change: figure, url: CARD_URL }),
    alt: t("shareCard.cardAlt", { change: figure, period: periodName.toLocaleLowerCase(locale) }),
  };
}

/** The film's moving numbers: the figure counting with the line, and the pill following the head. */
export const figureAt = (change: number, fx: Fx, locale: string) => signedMoney(change, fx, locale);
export const pillAt = (value: number, fx: Fx, locale: string) => money(value, fx, locale);
