// Health as the Spoke counts it (Σ collateral value × factor ÷ debt value), projected on the device from the account
// view so the gauge moves on every keystroke; the api recomputes it from fresh reads when the ticket is drafted, and
// that figure is the one that decides.
import { formatUnits } from "viem";

import type { LendAccountView, LendReserveView } from "@kawase/api-client";

export const PRICE_DECIMALS = 8;
const FLOOR_MARGIN = 0.995;
const DECIMAL_BASE = 10;

export type LendAction = "supply" | "withdraw" | "borrow" | "repay";

export const priceOf = (reserve: Pick<LendReserveView, "price">) => Number(formatUnits(BigInt(reserve.price), PRICE_DECIMALS));

export type Projection = { action: LendAction; reserve: LendReserveView; amount: number; all: boolean; collateral?: { reserve: LendReserveView; amount: number } | undefined };

/** Health after the action, or null with no debt left. */
export function projectHealth(account: LendAccountView, input: Projection): number | null {
  let weighted = account.weightedCollateralUsd;
  let debt = account.debtUsd;
  const value = input.amount * priceOf(input.reserve);
  const supplied = account.supplied.find((entry) => entry.reserveId === input.reserve.reserveId);
  const owed = account.borrowed.find((entry) => entry.reserveId === input.reserve.reserveId)?.usd ?? 0;
  if (input.action === "borrow") {
    debt += value;
    if (input.collateral) weighted += input.collateral.amount * priceOf(input.collateral.reserve) * input.collateral.reserve.collateralFactor;
  } else if (input.action === "repay") debt -= input.all ? owed : Math.min(value, owed);
  else if (supplied?.collateral) {
    const moved = input.all && input.action === "withdraw" ? supplied.usd : value;
    weighted += (input.action === "supply" ? moved : -moved) * input.reserve.collateralFactor;
  }
  return debt > 0 ? Math.max(0, weighted) / debt : null;
}

/** The most of `reserve` that could be borrowed keeping health at the floor, with what is put in alongside. */
export function maxBorrow(account: LendAccountView, reserve: LendReserveView, collateral?: Projection["collateral"]): number {
  const weighted = account.weightedCollateralUsd + (collateral ? collateral.amount * priceOf(collateral.reserve) * collateral.reserve.collateralFactor : 0);
  const room = (weighted / account.minBorrowHealth - account.debtUsd) * FLOOR_MARGIN;
  const price = priceOf(reserve);
  return room > 0 && price > 0 ? room / price : 0;
}

/** A decimal string for the keypad, rounded down to what the asset shows. */
export const toInput = (value: number, digits: number) => {
  const scale = DECIMAL_BASE ** digits;
  const floored = Math.floor(value * scale) / scale;
  return floored > 0 ? floored.toFixed(digits).replace(/\.?0+$/, "") : "";
};
