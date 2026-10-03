// Take-profit / stop-loss on the device, for one position: whether Kawase may close it for the person (its six grants,
// signed together with one Face ID), turning that on or off, and setting its targets. Turning it on over live grants,
// or off, also disables the old grants on Arc through the wallet's shared revoke: signed in the same yes (or, off, one
// more) and sent by Kawase's relayer. The phone decodes each grant against its receipt before signing (M6); the api
// checks every target and every signature.
import * as React from "react";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import { ApiError, type MarginProtectionChange, type MarginProtectionResult, type MarginProtectionView } from "@kawase/api-client";
import { SigningRefused, checkGrant, type ShownGrant } from "@kawase/wallet";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { sayIfRefused } from "@/wallet/refused";
import { signRevoke, submitRevoke } from "@/wallet/sign-revoke";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

/** Why a target was refused, as the api names it (a key in the `protect` namespace), or a plain failure. */
export type ProtectionRefusal = "take_profit_wrong_side" | "stop_loss_wrong_side" | "stop_loss_past_liquidation" | "protection_unavailable" | "failed";
const KNOWN: ReadonlySet<string> = new Set(["take_profit_wrong_side", "stop_loss_wrong_side", "stop_loss_past_liquidation", "protection_unavailable"]);

export function useProtection(positionId: string) {
  const { t } = useT();
  const { status, user } = useSession();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [view, setView] = React.useState<MarginProtectionView>();
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (status !== "account") return;
    setView(await api.margin.protection(positionId).catch(() => undefined));
  }, [status, positionId]);
  React.useEffect(() => {
    void refresh();
  }, [refresh, user?.activeNetwork]);

  /** Sign the position's grants (one Face ID for all six, and for disabling any they replace); then its targets are watched. */
  const turnOn = async () => {
    if (!signer) {
      toast(t("send.approvalUnavailable"));
      return false;
    }
    setBusy(true);
    try {
      const request = await api.margin.protectionGrant(positionId);
      const check = await confirmWithBiometrics(t("protect.grantPrompt"), t("common.cancel"));
      if (check !== "approved") {
        toast(check === "unavailable" ? t("send.approvalUnavailable") : check === "failed" ? t("send.approvalFailed") : t("send.faceIdCancelled"));
        return false;
      }
      // What the card shows is what is signed: each grant decoded on the phone against its receipt (M6).
      request.grants.forEach((entry, index) => {
        if (!request.receipts[index]) throw new SigningRefused("a grant without its receipt");
        checkGrant(entry.typedData, request.receipts[index] as unknown as ShownGrant, signer.address);
      });
      const signatures: { grantId: string; signature: string }[] = [];
      for (const entry of request.grants) signatures.push({ grantId: entry.grantId, signature: await signer.signTypedData(entry.typedData as TypedDataDefinition) });
      // The grants these replace are revoked in the same yes; the api turns them off on chain before these go on.
      const revoke = request.revoke ? await signRevoke(signer, request.revoke) : undefined;
      setView(await api.margin.protectionActivate(signatures, revoke));
      return true;
    } catch (error) {
      if (!sayIfRefused(error, t)) toast(t("protect.failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Kawase stops at once; then the person's yes disables the grants on Arc too (or later, if they decline). */
  const turnOff = async () => {
    setBusy(true);
    try {
      const off = await api.margin.protectionRevoke(positionId);
      setView(off);
      if (!off.revoke || !signer) return;
      const check = await confirmWithBiometrics(t("safety.revokePrompt"), t("common.cancel"));
      const done = check === "approved" ? (await submitRevoke(off.revoke, await signRevoke(signer, off.revoke))).status === "confirmed" : false;
      toast(done ? t("safety.revokedOnArc") : t("safety.revokeLater"));
    } catch (error) {
      if (!sayIfRefused(error, t)) toast(t("protect.failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Save the position's targets; a refusal comes back as its reason. */
  const protect = async (change: MarginProtectionChange): Promise<MarginProtectionResult | { refused: ProtectionRefusal }> => {
    setBusy(true);
    try {
      return await api.margin.protect(positionId, change);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      return { refused: KNOWN.has(code) ? (code as ProtectionRefusal) : "failed" };
    } finally {
      setBusy(false);
    }
  };

  return { view, busy, refresh, turnOn, turnOff, protect };
}
