// Kawase Margin on the device: one order's life (the wallet-intent controller over /margin/orders, the same
// guarantees as swaps), the markets (public, R13) and the person's positions, refreshed while shown.
import * as React from "react";

import type { MarginIntent, MarginMarketsView, MarginPositionView, MarginRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving, isIntentOpen, useWalletIntent, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export const isMarginMoving = isIntentMoving;
export const isMarginOpen = isIntentOpen;
export const isMarginFinished = isIntentFinished;

export type MarginController = WalletIntentController<MarginIntent, MarginRequest>;

const POSITIONS_REFRESH_MS = 15_000;

export function useMarginOrder(initial?: MarginIntent | undefined): MarginController {
  const { t } = useT();
  return useWalletIntent(api.margin, { changed: t("margin.changed"), unavailable: t("margin.unavailable") }, initial);
}

export function useMarginMarkets() {
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [view, setView] = React.useState<MarginMarketsView>();
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      setView(await api.margin.markets());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  React.useEffect(() => {
    setView(undefined);
    void load();
  }, [load, network]);
  return { view, failed, refresh: load };
}

export function useMarginPositions() {
  const { status, user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [positions, setPositions] = React.useState<MarginPositionView[]>();
  const load = React.useCallback(async () => {
    if (status !== "account") {
      setPositions([]);
      return;
    }
    try {
      setPositions((await api.margin.positions()).positions);
    } catch {
      // The last good list stays; the next refresh tries again.
    }
  }, [status]);
  React.useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POSITIONS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, network]);
  return { positions, refresh: load };
}
