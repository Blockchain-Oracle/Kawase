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
  return formatTokenAmount(units, decimals, symbol, locale, { fractionDigits: digits, withSymbol });
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
export function money(usd: number | null | undefined, fx: Fx, locale: string, options: { compact?: boolean } = {}): string {
  if (usd === null || usd === undefined) return "—";
  const value = usd * fx.perUsd;
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
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency(fx.currency),
    ...(small ? { maximumSignificantDigits: PRICE_SIG_DIGITS } : { minimumFractionDigits: VALUE_DIGITS, maximumFractionDigits: VALUE_DIGITS }),
  }).format(value);
}

/** "+3.20%" / "−1.05%". */
export function change(pct: number | null | undefined, locale: string): string | undefined {
  if (pct === null || pct === undefined) return undefined;
  return new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero", minimumFractionDigits: CHANGE_DIGITS, maximumFractionDigits: CHANGE_DIGITS }).format(pct / PERCENT);
}

export const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;
