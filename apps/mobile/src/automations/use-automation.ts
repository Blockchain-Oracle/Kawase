// One automation on the device, shared by the chat card and the automations screen. Turning it on is the owner's own
// yes (Face ID, or an email code on the web) followed by the wallet signing the grants the api built (one for a
// scheduled send, three for Auto-save — still one Face ID) — the on-chain bound the runs live within. Cancelling stops runs at once on the api; the grant is then revoked on chain by the
// wallet signing that transaction (if the person declines, Kawase still never uses it, and says so).
import * as React from "react";
import { toast } from "sonner-native";
import type { Address, TypedDataDefinition } from "viem";

import type { AutomationEdit, AutomationEditResponse, AutomationView, SimulationView } from "@kawase/api-client";
import { SigningRefused, checkGrant, receiptOf, type ShownGrant } from "@kawase/wallet";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { sayIfRefused } from "@/wallet/refused";
import { signRevoke, submitRevoke } from "@/wallet/sign-revoke";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const POLL_MS = 5_000;
/** After turning Auto-save on it checks at once: follow it for this long so the first move shows. */
const FIRST_CHECK_MS = 90_000;

/**
 * One grant an automation asks for, as its card shows it: the receipt it came with, decoded again on the phone, and a
 * scheduled send pinned to the person the card names.
 */
function checkAutomationGrant(typedData: unknown, receipt: unknown, automation: AutomationView, wallet: Address) {
  if (!receipt) throw new SigningRefused("a grant without its receipt");
  const decoded = checkGrant(typedData as Parameters<typeof checkGrant>[0], receipt as ShownGrant, wallet);
  const recipient = automation.kind === "scheduled_send" ? automation.action?.recipientAddress : undefined;
  if (recipient && receiptOf(decoded).recipient?.toLowerCase() !== recipient.toLowerCase()) throw new SigningRefused("the grant pays someone other than its card names");
}

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

  const act = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      if (!sayIfRefused(error, t)) toast(t("automation.failed"));
      await refresh();
      return undefined;
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
      // What the card shows is what is signed: every grant decoded on the phone and checked against its receipt (M6).
      request.grants.forEach((entry, index) => checkAutomationGrant(entry.typedData, request.receipts[index], automation, signer.address));
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
      const result = await submitRevoke(revoke, await signRevoke(signer, revoke));
      toast(result.status === "confirmed" ? t("automation.revoked") : t("automation.revokeLater"));
      await refresh();
    });

  /** Practice first: on without a grant; its runs are "would have" until it goes live (turnOn). */
  const practice = () => act(async () => setAutomation((await api.automationsMore.practice(id!)).automation));

  /** What the next runs would do now (the first dry-run on chain); nothing happens. */
  const [simulation, setSimulation] = React.useState<SimulationView>();
  const simulate = () =>
    act(async () => {
      setSimulation(await api.automationsMore.simulate(id!));
    });

  /**
   * Edit in place: narrowing is saved at once; widening comes back with a new grant, signed with the old one's revoke
   * in the same yes (Face ID), then applied.
   */
  const edit = (change: AutomationEdit, prompt: string) =>
    act(async () => {
      const answer = await api.automationsMore.edit(id!, change);
      setAutomation(answer.automation);
      if (!answer.grant) {
        toast(t("automation.edited"));
        return;
      }
      await signEdit(answer, prompt);
    });

  /** A widening edit the api already prepared (from chat): its new grant and the old one's revoke, one Face ID. */
  const approveEdit = (answer: AutomationEditResponse, prompt: string) => act(() => signEdit(answer, prompt));

  /** True once the change is on. */
  const signEdit = async (answer: AutomationEditResponse, prompt: string): Promise<boolean> => {
    if (!answer.grant) return false;
    if (!signer) {
      toast(t("send.approvalUnavailable"));
      return false;
    }
    const check = await confirmWithBiometrics(prompt, t("common.cancel"));
    if (check !== "approved") {
      toast(t("safety.notApproved"));
      return false;
    }
    answer.grant.grants.forEach((entry, index) => checkAutomationGrant(entry.typedData, answer.grant!.receipts[index], answer.automation, signer.address));
    const signatures: { grantId: string; signature: string }[] = [];
    for (const entry of answer.grant.grants) signatures.push({ grantId: entry.grantId, signature: await signer.signTypedData(entry.typedData as TypedDataDefinition) });
    // The old grant's revoke goes with the new one: the api turns it off on chain before the edit applies.
    const signedRevoke = answer.revoke ? await signRevoke(signer, answer.revoke) : undefined;
    const { automation: edited } = await api.automationsMore.editActivate(answer.automation.id, signatures, signedRevoke);
    setAutomation(edited);
    toast(t("automation.edited"));
    return true;
  };

  return { automation, set: setAutomation, busy, refresh, recheck, turnOn, pause, resume, skip, cancel, practice, simulate, simulation, edit, approveEdit };
}
