// One bridge's life on the device, shared by the bridge screen and the chat card: the wallet-intent controller over
// the api's /bridges (see intents/use-wallet-intent.ts). It keeps polling while the money crosses: the burn on
// Arc, Circle's attestation, the forwarder's mint on the other chain.
import type { BridgeIntent, BridgeRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { useWalletIntent, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";

export type BridgeController = WalletIntentController<BridgeIntent, BridgeRequest>;

export function useBridge(initial?: BridgeIntent | undefined): BridgeController {
  const { t } = useT();
  return useWalletIntent(api.bridges, { changed: t("bridge.changed"), unavailable: t("bridge.routeUnavailable") }, initial);
}
