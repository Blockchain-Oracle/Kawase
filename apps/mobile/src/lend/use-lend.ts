// Earn options and borrowing on the device (earn-borrow.md): one Aave V4 action's life (the wallet-intent controller
// over /lend/orders, the same guarantees as swaps and margin), the person's account there (what the wallet holds,
// what is supplied and borrowed, health), and the yield options for an asset (public, R13), refreshed while shown.
import * as React from "react";

import type { LendAccountView, LendIntent, LendRequest, YieldOptionsView } from "@kawase/api-client";

import { useT } from "@/i18n";
import { useWalletIntent, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export type LendController = WalletIntentController<LendIntent, LendRequest>;

const ACCOUNT_REFRESH_MS = 20_000;

export function useLendOrder(initial?: LendIntent | undefined): LendController {
  const { t } = useT();
  return useWalletIntent(api.lend, { changed: t("lend.changed"), unavailable: t("lend.unavailable") }, initial);
}

export function useLendAccount() {
  const { status, user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [view, setView] = React.useState<LendAccountView>();
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      setView(await api.lend.account());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  React.useEffect(() => {
    if (status !== "account") return;
    setView(undefined);
    void load();
    const timer = setInterval(() => void load(), ACCOUNT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, network, status]);
  return { view, failed, refresh: load };
}

export function useYieldOptions(asset: string, amount?: string | null) {
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [view, setView] = React.useState<YieldOptionsView>();
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      setView(await api.lend.options(asset, amount ?? undefined));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [amount, asset]);
  React.useEffect(() => {
    void load();
  }, [load, network]);
  return { view, failed, refresh: load };
}
