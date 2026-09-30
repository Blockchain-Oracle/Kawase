import type { AssetId } from "./assets";
import { amount, decimalsOf, type Amount } from "./amount";

export class AmountParseError extends Error {
  constructor(readonly input: string, readonly reason: "empty" | "invalid" | "too_many_decimals" | "negative") {
    super(`Cannot read "${input}" as an amount (${reason}).`);
    this.name = "AmountParseError";
  }
}

const DIGIT_GROUP_SEPARATORS = /[\s  '’_]/g;

/** Arabic decimal (U+066B) and thousands (U+066C) marks, which people type even when Intl reports Latin separators. */
const ARABIC_DECIMAL_SEPARATOR = "٫";
const ARABIC_GROUP_SEPARATOR = "٬";

/** Probe value whose formatting reveals both separators: "12,345.6" (en) → group ",", decimal ".". */
const SEPARATOR_PROBE = 12345.6;
const PROBE_FRACTION_DIGITS = 1;

/**
 * Locale separators, detected from Intl.NumberFormat#format only: Hermes (React Native) lacks formatToParts
 * (spike 11, plan/spikes/11-hermes-intl.md). The decimal mark is the character just before the final digit;
 * the group mark is the first non-digit before it (absent in locales that don't group 5-digit numbers).
 */
function separatorsFor(locale: string): { decimal: string; group: string } {
  const formatted = toAsciiDigits(
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: PROBE_FRACTION_DIGITS,
      maximumFractionDigits: PROBE_FRACTION_DIGITS,
    }).format(SEPARATOR_PROBE),
  );
  const decimal = formatted.charAt(formatted.length - PROBE_FRACTION_DIGITS - 1) || ".";
  const integerPart = formatted.slice(0, formatted.length - PROBE_FRACTION_DIGITS - 1);
  const group = [...integerPart].find((char) => !/\d/.test(char)) ?? (decimal === "." ? "," : ".");
  return { decimal, group };
}

/**
 * Code point of the digit ZERO in each non-Latin numbering system used by Kawase's locales
 * (ar: Arabic-Indic, ur/fa: Extended Arabic-Indic, hi: Devanagari, bn: Bengali).
 */
const NON_LATIN_DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6] as const;
const DIGITS_PER_SYSTEM = 10;

/** Convert locale-native digits to ASCII 0–9 so typed amounts in any supported locale parse exactly. */
function toAsciiDigits(input: string): string {
  return [...input]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const zero = NON_LATIN_DIGIT_ZEROS.find((z) => code >= z && code < z + DIGITS_PER_SYSTEM);
      return zero === undefined ? char : String(code - zero);
    })
    .join("");
}

/**
 * Parse what a person typed (in their locale) into exact base units. Never uses floating point.
 * Rejects more fractional digits than the asset supports rather than silently rounding.
 */
export function parseAmount<A extends AssetId>(input: string, asset: A, locale: string): Amount<A> {
  const trimmed = toAsciiDigits(input.trim());
  if (trimmed === "") throw new AmountParseError(input, "empty");
  if (trimmed.startsWith("-")) throw new AmountParseError(input, "negative");
  const { decimal, group } = separatorsFor(locale);
  const withLocaleMarks = trimmed.split(ARABIC_GROUP_SEPARATOR).join(group).split(ARABIC_DECIMAL_SEPARATOR).join(decimal);
  const normalized = withLocaleMarks.split(group).join("").replace(DIGIT_GROUP_SEPARATORS, "").split(decimal).join(".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new AmountParseError(input, "invalid");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const decimals = decimalsOf(asset);
  if (fraction.length > decimals) throw new AmountParseError(input, "too_many_decimals");
  return amount(asset, BigInt(whole + fraction.padEnd(decimals, "0")));
}
