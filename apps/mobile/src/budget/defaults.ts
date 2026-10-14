// A first budget's numbers and reach, shared by the Budget screen and setup's budget step so they never drift: $200 a
// week, $50 at a time, swaps, own-wallet moves, earn and sends to saved contacts, every swap venue, CCTP to the
// wallet's own address and the network's vaults.
import * as React from "react";

import type { NetworkId } from "@kawase/api-client";
import { BUDGET_SWAP_VENUES, type BudgetCategory } from "@kawase/wallet";

import { chainIdOf } from "./silent";
import type { BudgetDraft } from "./sign-budget";
import { useBudgetVaults } from "./use-budget";

export const USD = 1_000_000n;
const DEFAULT_WEEKLY_DOLLARS = 200n;
const DEFAULT_PER_ACTION_DOLLARS = 50n;
export const DEFAULT_WEEKLY = DEFAULT_WEEKLY_DOLLARS * USD;
export const DEFAULT_PER_ACTION = DEFAULT_PER_ACTION_DOLLARS * USD;
export const DEFAULT_CATEGORIES: BudgetCategory[] = ["swap", "bridge", "earn", "send"];
/** The move venue: CCTP to the wallet's own address. */
export const MOVE_VENUES = ["cctp"];

/** Every venue a first budget allows on this network (the vaults arrive a moment later). */
export function useAllBudgetVenues(network: NetworkId, enabled: boolean) {
  const vaults = useBudgetVaults(enabled);
  const swapVenues = React.useMemo(() => Object.keys(BUDGET_SWAP_VENUES[chainIdOf(network)] ?? {}), [network]);
  const venues = React.useMemo(() => [...swapVenues, ...MOVE_VENUES, ...(vaults ?? []).map((vault) => vault.address.toLowerCase())], [swapVenues, vaults]);
  return { venues, vaults, swapVenues };
}

export const defaultDraft = (venues: readonly string[]): BudgetDraft => ({
  weeklyCap: DEFAULT_WEEKLY,
  perActionCap: DEFAULT_PER_ACTION,
  categories: DEFAULT_CATEGORIES,
  venues: [...venues],
});
