// Money as people read it, for any asset (R1): token amounts with the token's own decimals, values in the person's
// display currency (the api gives US dollars and the rate), the 24-hour change signed, big market numbers compact.
import type { HoldingView, PortfolioView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";

/** A token amount shows this many decimals at most; tiny meme-coin prices need more on the price line. */
const AMOUNT_DIGITS = 4;
const SMALL_AMOUNT = 1;
const SMALL_AMOUNT_DIGITS = 6;
const VALUE_DIGITS = 2;
const PRICE_SIG_DIGITS = 4;
const CHANGE_DIGITS = 2;
const COMPACT_DIGITS = 1;
const PERCENT = 100;
const TEN = 10n;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;

export type Fx = PortfolioView["fx"];
export const USD_FX: Fx = { currency: "USD", perUsd: 1 };

/** "12.5 ARGUS" from base units. */
export function tokenAmount(balance: string, decimals: number, symbol: string, locale: string, withSymbol = true): string {
  const units = BigInt(balance);
  const whole = units / TEN ** BigInt(decimals);
  const digits = whole < BigInt(SMALL_AMOUNT) ? SMALL_AMOUNT_DIGITS : AMOUNT_DIGITS;
  return formatTokenAmount(units, decimals, symbol, locale, { fractionDigits: digits, withSymbol, trimZeros: true });
}

export const holdingAmount = (holding: HoldingView, locale: string) => tokenAmount(holding.balance, holding.token.decimals, holding.token.symbol, locale);

function currency(code: string) {
  // An unknown currency code makes Intl throw; the api only sends ones it has a rate for, but fall back to USD.
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return code;
  } catch {
    return "USD";
  }
}

/** A value in the display currency, e.g. "€4.20". */
const COMPACT_PROBE = 1_234_567;
const COMPACT_PROBE_LONG = "1,234,567";
const COMPACT_DIGITS_FALLBACK = 2;

/** Whether this engine's Intl knows compact notation (Hermes on a phone does not: it prints "$1,257,855.0"). */
const COMPACT_SUPPORTED = (() => {
  try {
    return new Intl.NumberFormat("en", { notation: "compact" }).format(COMPACT_PROBE) !== COMPACT_PROBE_LONG;
  } catch {
    return false;
  }
})();
const COMPACT_STEPS = [
  { at: 1e12, suffix: "T" },
  { at: 1e9, suffix: "B" },
  { at: 1e6, suffix: "M" },
  { at: 1e3, suffix: "K" },
] as const;

export function money(usd: number | null | undefined, fx: Fx, locale: string, options: { compact?: boolean } = {}): string {
  if (usd === null || usd === undefined) return "—";
  const value = usd * fx.perUsd;
  if (options.compact && !COMPACT_SUPPORTED) {
    // $1.26M the same way on a phone: scale by hand, let Intl place the currency and the decimal separator.
    const step = COMPACT_STEPS.find((entry) => Math.abs(value) >= entry.at);
    if (step) {
      const scaled = new Intl.NumberFormat(locale, { style: "currency", currency: currency(fx.currency), maximumFractionDigits: COMPACT_DIGITS_FALLBACK }).format(value / step.at);
      return scaled.replace(/([\d.,\u00a0\u202f]*\d)/, `$1${step.suffix}`);
    }
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency(fx.currency),
    ...(options.compact
      ? { notation: "compact", maximumFractionDigits: COMPACT_DIGITS }
      : { minimumFractionDigits: VALUE_DIGITS, maximumFractionDigits: VALUE_DIGITS }),
  }).format(value);
}

/** A unit price: two decimals for most, significant digits for tiny meme-coin prices. */
export function price(usd: number | null | undefined, fx: Fx, locale: string): string {
  if (usd === null || usd === undefined) return "—";
  const value = usd * fx.perUsd;
  const small = Math.abs(value) < 1;
  const text = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency(fx.currency),
    ...(small ? { maximumSignificantDigits: PRICE_SIG_DIGITS } : { minimumFractionDigits: VALUE_DIGITS, maximumFractionDigits: VALUE_DIGITS }),
  }).format(value);
  return small ? compactZeros(text) : text;
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
/** From this many zeros after the decimal separator, they are written as a count. */
const ZEROS_TO_COMPACT = 4;
const LEADING_ZEROS = new RegExp(`([.,])(0{${ZEROS_TO_COMPACT},})(?=[1-9])`);

/**
 * A meme coin's price the way traders read it (DexScreener, BasedBot): $0.00002606 → $0.0₄2606, the run of zeros after
 * the decimal separator written as one zero and a subscript count. Shorter runs stay as they are; scripts with their
 * own digits (Arabic-Indic) are left alone.
 */
export function compactZeros(text: string): string {
  return text.replace(LEADING_ZEROS, (_match, separator: string, zeros: string) => {
    const count = [...String(zeros.length)].map((digit) => SUBSCRIPT_DIGITS[Number(digit)]).join("");
    return `${separator}0${count}`;
  });
}

/** "+3.20%" / "−1.05%". */
export function change(pct: number | null | undefined, locale: string): string | undefined {
  if (pct === null || pct === undefined) return undefined;
  return new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero", minimumFractionDigits: CHANGE_DIGITS, maximumFractionDigits: CHANGE_DIGITS }).format(pct / PERCENT);
}

export const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;
