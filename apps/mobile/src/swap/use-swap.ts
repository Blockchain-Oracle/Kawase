// One swap's life on the device, shared by the swap screen and the chat card: the wallet-intent controller over
// the api's /swaps (see intents/use-wallet-intent.ts for the guarantees).
import type { SwapIntent, SwapRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving, isIntentOpen, useWalletIntent, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";

export const isSwapMoving = isIntentMoving;
export const isSwapOpen = isIntentOpen;
export const isSwapFinished = isIntentFinished;

export type SwapController = WalletIntentController<SwapIntent, SwapRequest>;

export function useSwap(initial?: SwapIntent | undefined): SwapController {
  const { t } = useT();
  return useWalletIntent(api.swaps, { changed: t("swap.changed"), unavailable: t("swap.quoteUnavailable") }, initial);
}
