import type { AssetId } from "./assets";
import { ASSETS } from "./assets";
import { decimalsOf, type Amount } from "./amount";

const TEN = 10n;
const ZERO = 0n;
const DEFAULT_DISPLAY_FRACTION_DIGITS = 2;

export type FormatOptions = {
  /** Fraction digits to show (never more than the asset has). Defaults to 2. */
  fractionDigits?: number;
  /** Show the asset symbol after the number. Default true. */
  withSymbol?: boolean;
  /** Drop trailing zeros after the decimal point ("63.67", not "63.670000"). */
  trimZeros?: boolean;
};

/**
 * Locale-aware display of an exact amount. Intl.NumberFormat rejects "USDC" as a currency code,
 * so the number is formatted as a plain decimal and the symbol appended (context/08-product-research/05-voice-language-genui/i18n.md).
 * Formatting works from bigint strings, so large amounts never lose precision.
 */
export function formatAmount(value: Amount, locale: string, options: FormatOptions = {}): string {
  return formatTokenAmount(value.baseUnits, decimalsOf(value.asset), ASSETS[value.asset].symbol, locale, options);
}

/**
 * The same, for any token (R1): base units with the token's own decimals and symbol, as read from its contract or
 * the asset registry. USDC and EURC go through `formatAmount`; every other token comes here.
 */
export function formatTokenAmount(baseUnits: bigint, decimals: number, symbol: string, locale: string, options: FormatOptions = {}): string {
  const fractionDigits = Math.min(options.fractionDigits ?? DEFAULT_DISPLAY_FRACTION_DIGITS, decimals);
  const negative = baseUnits < ZERO;
  const abs = negative ? -baseUnits : baseUnits;
  const divisor = TEN ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, "0").slice(0, fractionDigits);
  const decimalString = fractionDigits > 0 ? `${whole}.${fraction}` : `${whole}`;
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: options.trimZeros ? 0 : fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  // Intl accepts decimal strings for exact formatting ("string" overload, ES2023 Intl.NumberFormat v3).
  const number = formatter.format(decimalString as unknown as number);
  const signed = negative ? `-${number}` : number;
  return options.withSymbol === false ? signed : `${signed} ${symbol}`;
}

/**
 * A price that can be a fraction of a cent (x402 services cost $0.002–$0.10): every digit that matters, at least two.
 * "0.006 USDC", "0.10 USDC", "1.25 USDC".
 */
export function formatPrice(value: Amount, locale: string, options: Pick<FormatOptions, "withSymbol"> = {}): string {
  const decimals = decimalsOf(value.asset);
  const fraction = (value.baseUnits < ZERO ? -value.baseUnits : value.baseUnits) % TEN ** BigInt(decimals);
  const significant = fraction.toString().padStart(decimals, "0").replace(/0+$/, "").length;
  return formatAmount(value, locale, { fractionDigits: Math.max(significant, DEFAULT_DISPLAY_FRACTION_DIGITS), ...options });
}

/** The canonical, locale-independent form (Latin digits, dot decimal) shown on confirmation cards next to the localized one. */
export function canonicalAmount(value: Amount): string {
  const decimals = decimalsOf(value.asset);
  const divisor = TEN ** BigInt(decimals);
  const negative = value.baseUnits < ZERO;
  const abs = negative ? -value.baseUnits : value.baseUnits;
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""} ${ASSETS[value.asset].symbol}`;
}

export function assetSymbol(asset: AssetId): string {
  return ASSETS[asset].symbol;
}
