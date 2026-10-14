// Numbers for the RouteList: base-unit amounts in the person's locale, the gap to the best route, time to arrive.
// Pure functions (no React), so the agent's run card and the screens word routes the same way.
import type { RouteAmount, RouteQuote } from "@kawase/api-client";

const LARGE = 1_000;
const WHOLE = 1;
const FRACTION_LARGE = 2;
const FRACTION_UNIT = 4;
const SIGNIFICANT_SMALL = 4;
const SECONDS_INSTANT = 2;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const NONE = 0n;

/** A base-unit amount as a number of whole tokens (display only; money math stays in bigint). */
export function toUnits(amount: string, decimals: number): number {
  const negative = amount.startsWith("-");
  const digits = (negative ? amount.slice(1) : amount).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "0";
  const value = Number(`${whole}.${fraction}`);
  return negative ? -value : value;
}

/** "8.9269", "1,204.50", "0.0003991": precise enough to tell routes apart, never noisy. */
export function formatTokens(value: number, locale: string): string {
  const size = Math.abs(value);
  const options: Intl.NumberFormatOptions =
    size >= LARGE ? { maximumFractionDigits: FRACTION_LARGE } : size >= WHOLE ? { maximumFractionDigits: FRACTION_UNIT } : { maximumSignificantDigits: SIGNIFICANT_SMALL };
  return new Intl.NumberFormat(locale, options).format(value);
}

export const formatAmount = (amount: RouteAmount, locale: string) => `${formatTokens(toUnits(amount.amount, amount.decimals), locale)} ${amount.symbol}`;

export function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: value < WHOLE ? FRACTION_UNIT : FRACTION_LARGE }).format(value);
}

/** How much less this row delivers than the best, in its own token, or null for the best itself (or no comparison). */
export function deltaToBest(row: RouteQuote, best: RouteQuote | undefined): RouteAmount | null {
  if (!best || !row.receive || !best.receive || row.venue === best.venue || row.net === null || best.net === null) return null;
  if (row.receive.symbol !== best.receive.symbol || row.receive.decimals !== best.receive.decimals) return null;
  const gap = BigInt(best.net) - BigInt(row.net);
  return gap > NONE ? { amount: gap.toString(), symbol: row.receive.symbol, decimals: row.receive.decimals } : null;
}

export type EtaWords = { key: "etaInstant" | "etaSeconds" | "etaMinutes" | "etaHours"; count: number };

/** Seconds to arrive as words: instant, ~N s, ~N min, ~N h. */
export function etaWords(seconds: number | null): EtaWords | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds <= SECONDS_INSTANT) return { key: "etaInstant", count: 0 };
  if (seconds < SECONDS_PER_MINUTE) return { key: "etaSeconds", count: Math.round(seconds) };
  if (seconds < SECONDS_PER_HOUR) return { key: "etaMinutes", count: Math.round(seconds / SECONDS_PER_MINUTE) };
  return { key: "etaHours", count: Math.round(seconds / SECONDS_PER_HOUR) };
}

/** Rows a person can pick (quoted, executable), and the rest (shown once, below, with why). */
export function splitRows(rows: readonly RouteQuote[]) {
  const choices = rows.filter((row) => row.status === "checking" || (row.status === "quoted" && row.executable));
  const others = rows.filter((row) => !choices.includes(row));
  return { choices, others };
}
