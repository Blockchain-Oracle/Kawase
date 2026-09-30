import { parseAmount } from "@kawase/money";

/** Build an exact USDC base-unit amount from a decimal string, e.g. usdc("250"). Only for constants. */
export const usdc = (decimal: string): bigint => parseAmount(decimal, "USDC", "en").baseUnits;

export const MS_PER_SECOND = 1_000;
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3_600;
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_WEEK = 604_800;
