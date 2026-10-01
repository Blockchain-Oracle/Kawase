// One deposit or withdrawal's life on the device, shared by the earn screen and the chat card: the wallet-intent
// controller over the api's /earn/intents (see intents/use-wallet-intent.ts for the guarantees).
import type { EarnIntent, EarnRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { useWalletIntent, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";

export type EarnController = WalletIntentController<EarnIntent, EarnRequest>;

export function useEarn(initial?: EarnIntent | undefined): EarnController {
  const { t } = useT();
  return useWalletIntent(api.earn, { changed: t("earn.changed"), unavailable: t("earn.unavailable") }, initial);
}
