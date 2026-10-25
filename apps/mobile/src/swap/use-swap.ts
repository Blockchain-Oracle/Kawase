// One swap's life on the device, shared by the swap screen and the chat card: the wallet-intent controller over
// the api's /swaps (see intents/use-wallet-intent.ts for the guarantees).
import * as React from "react";
import { toast } from "sonner-native";

import type { SwapIntent, SwapRequest } from "@kawase/api-client";

import type { RehearsalChanged } from "@/chat/rehearsal";
import { useT } from "@/i18n";
import { venueName } from "@/routes/from-draft";
import { isIntentFinished, isIntentMoving, isIntentOpen, useWalletIntent, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";

export const isSwapMoving = isIntentMoving;
export const isSwapOpen = isIntentOpen;
export const isSwapFinished = isIntentFinished;

export type SwapController = WalletIntentController<SwapIntent, SwapRequest>;

export function useSwap(initial?: SwapIntent | undefined): SwapController {
  const { t } = useT();
  return useWalletIntent(
    api.swaps,
    {
      changed: t("swap.changed"),
      unavailable: t("swap.quoteUnavailable"),
      routeFailed: (before) => t("swap.routeFailed", { venue: venueName(before.draft?.venue ?? "", before.draft?.provider) }),
    },
    initial,
  );
}

/**
 * A swap's rehearsal came back as a new version: the api benched a route that reverts on Arc and drafted the next best.
 * Says so (naming the venue) and reads the new version, which is simulated in turn.
 */
export function useSwapRehearsalChanged(refresh: () => Promise<void>) {
  const { t } = useT();
  return React.useCallback(
    (result: RehearsalChanged) => {
      if (result.reason === "route_failed" && result.venue) toast(t("swap.routeFailed", { venue: venueName(result.venue) }));
      void refresh();
    },
    [refresh, t],
  );
}
