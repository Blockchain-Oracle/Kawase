// Whether the weekly budget would send this card without asking (D38), for the review's words and its button: a
// preview of the phone's guard, read again when the card changes; undefined while it is being worked out.
import * as React from "react";
import type { Address } from "viem";

import type { SendIntent } from "@kawase/api-client";

import { useWalletStatus } from "@/wallet/use-wallet-status";

import { previewSendVerdict } from "./silent";

export function useBudgetCoversSend(intent: SendIntent | undefined): boolean | undefined {
  const wallet = useWalletStatus().wallet?.address as Address | undefined;
  const [covered, setCovered] = React.useState<boolean>();
  const key = intent ? `${intent.id}:${intent.version}` : "";
  React.useEffect(() => {
    if (!intent || !wallet) return undefined;
    let live = true;
    previewSendVerdict(intent, wallet)
      .then((silent) => {
        if (live) setCovered(silent);
      })
      .catch(() => {
        if (live) setCovered(false);
      });
    return () => {
      live = false;
    };
    // The card's identity and version (`key`) say when it changed.
  }, [key, wallet]);
  return covered;
}
