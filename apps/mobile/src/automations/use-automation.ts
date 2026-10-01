// One automation on the device, shared by the chat card and the automations screen. Turning it on is the owner's own
// yes (Face ID, or an email code on the web) followed by the wallet signing the grants the api built (one for a
// scheduled send, three for Auto-save — still one Face ID) — the on-chain bound the runs live within. Cancelling stops runs at once on the api; the grant is then revoked on chain by the
// wallet signing that transaction (if the person declines, Kawase still never uses it, and says so).
import * as React from "react";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import type { AutomationView } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const POLL_MS = 5_000;
/** After turning Auto-save on it checks at once: follow it for this long so the first move shows. */
const FIRST_CHECK_MS = 90_000;

export function useAutomation(initial: AutomationView | undefined) {
  const { t } = useT();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [automation, setAutomation] = React.useState<AutomationView | undefined>(initial);
  const [busy, setBusy] = React.useState(false);
  const [followUntil, setFollowUntil] = React.useState(0);
  const id = automation?.id;

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const { automation: fresh } = await api.automations.get(id).catch(() => ({ automation: undefined }));
    if (fresh) setAutomation(fresh);
  }, [id]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  // While it is on and a run is in flight (or Auto-save's first check is due), follow it.
  const inFlight = automation?.runs.some((run) => run.status === "executing") ?? false;
  const firstCheck = followUntil > 0 && (automation?.runs.length ?? 0) === 0;
  React.useEffect(() => {
    if (!inFlight && !firstCheck) return undefined;
    const timer = setInterval(() => {
      if (!inFlight && Date.now() > followUntil) setFollowUntil(0);
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, firstCheck, followUntil, refresh]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      toast(t("automation.failed"));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const turnOn = (prompt: string) =>
    act(async () => {
      if (!automation || !signer) {
        toast(t("send.approvalUnavailable"));
        return;
      }
      const request = await api.automations.grant(automation.id);
      // An alert holds no grant and moves no money: the tap is the yes.
      if (request.grants.length === 0) {
        setAutomation((await api.automations.activate(automation.id, [])).automation);
        return;
      }
      const check = await confirmWithBiometrics(prompt, t("common.cancel"));
      if (check !== "approved") {
        toast(check === "unavailable" ? t("send.approvalUnavailable") : check === "failed" ? t("send.approvalFailed") : t("send.faceIdCancelled"));
        return;
      }
      // One yes covers every grant this automation needs.
      const signatures: { grantId: string; signature: string }[] = [];
      for (const entry of request.grants) signatures.push({ grantId: entry.grantId, signature: await signer.signTypedData(entry.typedData as TypedDataDefinition) });
      const { automation: on } = await api.automations.activate(automation.id, signatures);
      setAutomation(on);
      if (on.kind === "auto_save") setFollowUntil(Date.now() + FIRST_CHECK_MS);
    });

  /** The same draft, checked again after a fix; it never turns anything on (review K03). */
  const recheck = React.useCallback(async () => {
    if (!id) return;
    const { automation: fresh } = await api.automations.recheck(id).catch(() => ({ automation: undefined }));
    if (fresh) setAutomation(fresh);
  }, [id]);
  const pause = () => act(async () => setAutomation((await api.automations.pause(id!)).automation));
  const resume = () => act(async () => setAutomation((await api.automations.resume(id!)).automation));
  const skip = () => act(async () => setAutomation((await api.automations.skip(id!)).automation));
  const cancel = (prompt: string) =>
    act(async () => {
      const { automation: canceled, revoke } = await api.automations.cancel(id!);
      setAutomation(canceled);
      if (!revoke || !signer) {
        toast(t("automation.revokeLater"));
        return;
      }
      const check = await confirmWithBiometrics(prompt, t("common.cancel"));
      if (check !== "approved") {
        toast(t("automation.revokeLater"));
        return;
      }
      const signed = await signer.signTransaction(toSerializable(revoke.transaction));
      const result = await api.wallet.submitTransaction(revoke.requestId, signed);
      toast(result.status === "confirmed" ? t("automation.revoked") : t("automation.revokeLater"));
      await refresh();
    });

  return { automation, set: setAutomation, busy, refresh, recheck, turnOn, pause, resume, skip, cancel };
}
