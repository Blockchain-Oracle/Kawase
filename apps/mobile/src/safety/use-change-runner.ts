// One change from ask to outcome, with the words the person sees at each ending: a tightening is saved at once; a
// loosening waits on the Now → After panel for the approval; a token's allowance turned off offers its on-chain revoke.
import * as React from "react";
import { toast } from "sonner-native";

import type { SafetyChange, SafetyView, TransactionRequestResponse } from "@kawase/api-client";

import { useT } from "@/i18n";

import { useSafetyChange, type Pending } from "./use-safety";

export function useChangeRunner(onSafety?: (safety: SafetyView) => void, via: "app" | "chat" = "app") {
  const { t } = useT();
  const { request, approve, revoke } = useSafetyChange();
  const [pending, setPending] = React.useState<Pending>();
  const [revokeOffer, setRevokeOffer] = React.useState<TransactionRequestResponse>();
  const [busy, setBusy] = React.useState(false);

  const submit = React.useCallback(
    async (change: SafetyChange): Promise<"applied" | "pending" | "unchanged" | "failed"> => {
      setBusy(true);
      try {
        const response = await request(change, via);
        if (response.status === "needs_approval") {
          setPending(response);
          return "pending";
        }
        onSafety?.(response.safety);
        if (response.status === "applied") toast(t("safety.saved"), { description: t("safety.tightenNote") });
        if (response.revoke) setRevokeOffer(response.revoke);
        return response.status;
      } catch {
        toast(t("safety.failed"));
        return "failed";
      } finally {
        setBusy(false);
      }
    },
    [request, via, onSafety, t],
  );

  /** Shows an approval that arrived elsewhere (the chat card holds the api's answer already). */
  const show = React.useCallback((next: Pending | undefined) => setPending(next), []);

  const confirm = React.useCallback(async () => {
    if (!pending) return false;
    setBusy(true);
    try {
      const { outcome, response } = await approve(pending, t("safety.approvePrompt"), t("common.cancel"));
      if (outcome === "applied") {
        setPending(undefined);
        if (response && response.status !== "needs_approval") onSafety?.(response.safety);
        toast(t("safety.saved"));
        return true;
      }
      toast(outcome === "expired" ? t("safety.expired") : outcome === "cancelled" ? t("safety.notApproved") : t("safety.failed"));
      if (outcome === "expired") setPending(undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }, [pending, approve, onSafety, t]);

  const doRevoke = React.useCallback(async () => {
    if (!revokeOffer) return;
    setBusy(true);
    try {
      const outcome = await revoke(revokeOffer, t("safety.revokePrompt"), t("common.cancel"));
      toast(outcome === "revoked" ? t("safety.revokedOnArc") : t("safety.revokeLater"));
      setRevokeOffer(undefined);
    } finally {
      setBusy(false);
    }
  }, [revokeOffer, revoke, t]);

  const reset = React.useCallback(() => {
    setPending(undefined);
    setRevokeOffer(undefined);
  }, []);

  return { submit, confirm, show, doRevoke, reset, pending, revokeOffer, busy };
}
