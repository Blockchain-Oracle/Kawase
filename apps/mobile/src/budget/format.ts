// Budget dollars (6-decimal base units) as the person reads them, in their language: "$200", "$34.50".
const UNITS_PER_CENT = 10_000n;
const CENTS_PER_DOLLAR = 100n;
const NONE = 0n;
const CENT_DIGITS = 2;

export function formatUsd(baseUnits: bigint, locale: string): string {
  const cents = baseUnits / UNITS_PER_CENT;
  const whole = cents % CENTS_PER_DOLLAR === NONE;
  const value = Number(cents) / Number(CENTS_PER_DOLLAR);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : CENT_DIGITS, maximumFractionDigits: CENT_DIGITS }).format(value);
  } catch {
    return `$${value.toFixed(whole ? 0 : CENT_DIGITS)}`;
  }
}
