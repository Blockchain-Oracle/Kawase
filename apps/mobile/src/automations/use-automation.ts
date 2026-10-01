// One automation on the device, shared by the chat card and the automations screen. Turning it on is the owner's own
// yes (Face ID, or an email code on the web) followed by the wallet signing the grant the api built — the on-chain
// bound the runs live within. Cancelling stops runs at once on the api; the grant is then revoked on chain by the
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

export function useAutomation(initial: AutomationView | undefined) {
  const { t } = useT();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [automation, setAutomation] = React.useState<AutomationView | undefined>(initial);
  const [busy, setBusy] = React.useState(false);
  const id = automation?.id;

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const { automation: fresh } = await api.automations.get(id).catch(() => ({ automation: undefined }));
    if (fresh) setAutomation(fresh);
  }, [id]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  // While it is on and a run is in flight, follow it.
  const inFlight = automation?.runs.some((run) => run.status === "executing") ?? false;
  React.useEffect(() => {
    if (!inFlight) return undefined;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [inFlight, refresh]);

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
      const grant = await api.automations.grant(automation.id);
      const check = await confirmWithBiometrics(prompt, t("common.cancel"));
      if (check !== "approved") {
        toast(check === "unavailable" ? t("send.approvalUnavailable") : check === "failed" ? t("send.approvalFailed") : t("send.faceIdCancelled"));
        return;
      }
      const signature = await signer.signTypedData(grant.typedData as TypedDataDefinition);
      const { automation: on } = await api.automations.activate(automation.id, grant.grantId, signature);
      setAutomation(on);
    });

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

  return { automation, set: setAutomation, busy, refresh, turnOn, pause, resume, skip, cancel };
}
