// The weekly budget on the device, shared by the budget screen and the Home chip: the signed budget on the active
// network (null when there is none), loading / ready / error, and the last good answer kept on the device so an
// offline start still shows it, marked stale. Guests have no budget (a budget needs a wallet).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";

import type { BudgetLedgerRow, EarnVaultView } from "@kawase/api-client";

import { diagnose, type Diagnosis } from "@/components/kit";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

import { budgetApi } from "./client";
import type { BudgetView } from "./types";

const CACHE_PREFIX = "kawase.budget.view.";

export type BudgetState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "ready"; view: BudgetView | null; asOf: number; stale: boolean; error?: Diagnosis | undefined }
  | { status: "error"; error: Diagnosis };

type Listener = (scope: string, view: BudgetView | null) => void;
const listeners = new Set<Listener>();

/** Tell every mounted screen and chip that the budget changed (a save, a pause, revoke-all). */
export function publishBudget(scope: string, view: BudgetView | null) {
  for (const listener of listeners) listener(scope, view);
  void AsyncStorage.setItem(`${CACHE_PREFIX}${scope}`, JSON.stringify({ view, at: Date.now() })).catch(() => undefined);
}

async function readCache(scope: string): Promise<{ view: BudgetView | null; at: number } | undefined> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${scope}`);
    return raw ? (JSON.parse(raw) as { view: BudgetView | null; at: number }) : undefined;
  } catch {
    return undefined;
  }
}

export function useBudget() {
  const { user, status } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const scope = `${user?.id ?? "guest"}:${network}`;
  const account = status === "account";
  const [state, setState] = React.useState<BudgetState>(account ? { status: "loading" } : { status: "guest" });

  const load = React.useCallback(async () => {
    if (!account) {
      setState({ status: "guest" });
      return;
    }
    try {
      const { budget } = await budgetApi.get();
      setState({ status: "ready", view: budget, asOf: Date.now(), stale: false });
      publishBudget(scope, budget);
    } catch (error) {
      const cached = await readCache(scope);
      const diagnosis = diagnose(error);
      setState(cached ? { status: "ready", view: cached.view, asOf: cached.at, stale: true, error: diagnosis } : { status: "error", error: diagnosis });
    }
  }, [account, scope]);

  React.useEffect(() => {
    setState(account ? { status: "loading" } : { status: "guest" });
    void load();
  }, [account, load]);

  React.useEffect(() => {
    const listener: Listener = (changed, view) => {
      if (changed === scope) setState({ status: "ready", view, asOf: Date.now(), stale: false });
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [scope]);

  const set = React.useCallback((view: BudgetView | null) => publishBudget(scope, view), [scope]);
  return { state, load, set, network, scope };
}

/** The vaults a budget can name (the active network's, highest yield first; a vault nothing can leave is left out). */
export function useBudgetVaults(enabled: boolean) {
  const [vaults, setVaults] = React.useState<EarnVaultView[] | undefined>();
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    api.earn
      .overview()
      .then(({ vaults: list }) => live && setVaults(list.filter((vault) => vault.liquidity !== "stuck")))
      .catch(() => live && setVaults([]));
    return () => {
      live = false;
    };
  }, [enabled]);
  return vaults;
}

/** This week's silent actions, newest first (loaded when the person opens the disclosure). */
export function useBudgetLedger(enabled: boolean, key: string) {
  const [rows, setRows] = React.useState<BudgetLedgerRow[] | undefined>();
  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    api.budget
      .ledger()
      .then(({ rows: list }) => live && setRows(list))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [enabled, key]);
  return rows;
}
