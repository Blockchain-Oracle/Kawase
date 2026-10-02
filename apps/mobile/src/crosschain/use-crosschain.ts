// One cross-chain move's life on the device, shared by the Move screen and the chat card: the wallet-intent
// controller over /crosschain/orders (a transaction on Arc for moves out, one EIP-712 permit for Bring to Arc).
import * as React from "react";

import type { CrossChainIntent, CrossChainRequest, ElsewhereView } from "@kawase/api-client";

import { useT } from "@/i18n";
import { useWalletIntent, type WalletIntentApi, type WalletIntentController } from "@/intents/use-wallet-intent";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

export type CrossChainController = WalletIntentController<CrossChainIntent, CrossChainRequest>;

const calls: WalletIntentApi<CrossChainIntent, CrossChainRequest> = {
  get: api.crosschain.get,
  revise: api.crosschain.revise,
  cancel: api.crosschain.cancel,
  approve: api.crosschain.approve,
  signature: (id, approvalId, signed, kind) => api.crosschain.signature(id, approvalId, kind === "typed" ? { signature: signed } : { signedTransaction: signed }),
};

export function useCrossChain(initial?: CrossChainIntent | undefined): CrossChainController {
  const { t } = useT();
  return useWalletIntent(calls, { changed: t("move.changed"), unavailable: t("move.unavailable") }, initial);
}

/** USDC waiting at the person's address on other chains (Bring to Arc). */
export function useElsewhere() {
  const { status, user } = useSession();
  const [view, setView] = React.useState<ElsewhereView>();
  React.useEffect(() => {
    if (status !== "account") return;
    let live = true;
    void api.crosschain
      .elsewhere()
      .then((next) => live && setView(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status, user?.activeNetwork]);
  return view;
}
