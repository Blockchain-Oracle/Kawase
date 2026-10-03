// Take-profit / stop-loss on the device, for one position: whether Kawase may close it for the person (its six grants,
// signed together with one Face ID), turning that on or off, and setting its targets. Turning it on over live grants,
// or off, also disables the old grants on Arc: the wallet signs that in the same yes (or, off, one more), as its own
// transaction or — when its USDC can't pay the fee — a one-time delegation Kawase's relayer sends. The api checks every
// target and every signature; this only asks and signs.
import * as React from "react";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import { ApiError, type GrantDisableRequest, type MarginProtectionChange, type MarginProtectionResult, type MarginProtectionView } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

/** Why a target was refused, as the api names it (a key in the `protect` namespace), or a plain failure. */
export type ProtectionRefusal = "take_profit_wrong_side" | "stop_loss_wrong_side" | "stop_loss_past_liquidation" | "protection_unavailable" | "failed";
const KNOWN: ReadonlySet<string> = new Set(["take_profit_wrong_side", "stop_loss_wrong_side", "stop_loss_past_liquidation", "protection_unavailable"]);

type Signer = NonNullable<ReturnType<typeof useWalletSigner>>;
type SignedDisable = { requestId: string; relayed: boolean; signed: string };

/** The wallet signs an on-chain disable (no device check here: the caller already has the person's yes). */
async function signDisable(signer: Signer, request: GrantDisableRequest): Promise<SignedDisable> {
  if ("relayed" in request) return { requestId: request.requestId, relayed: true, signed: await signer.signTypedData(request.typedData as unknown as TypedDataDefinition) };
  return { requestId: request.requestId, relayed: false, signed: await signer.signTransaction(toSerializable(request.transaction)) };
}

/** Sent and confirmed on Arc: the wallet broadcasts its own; the relayer sends the relayed one. */
async function submitDisable(disable: SignedDisable): Promise<boolean> {
  const result = disable.relayed ? await api.margin.protectionDisable(disable.requestId, disable.signed) : await api.wallet.submitTransaction(disable.requestId, disable.signed);
  return result.status === "confirmed";
}

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
      const signatures: { grantId: string; signature: string }[] = [];
      for (const entry of request.grants) signatures.push({ grantId: entry.grantId, signature: await signer.signTypedData(entry.typedData as TypedDataDefinition) });
      // The grants these replace are disabled in the same yes, signed before anything is sent.
      const disable = request.revoke ? await signDisable(signer, request.revoke) : undefined;
      setView(await api.margin.protectionActivate(signatures));
      if (disable) await submitDisable(disable).catch(() => false);
      return true;
    } catch {
      toast(t("protect.failed"));
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
      const done = check === "approved" ? await submitDisable(await signDisable(signer, off.revoke)).catch(() => false) : false;
      toast(done ? t("safety.revokedOnArc") : t("safety.revokeLater"));
    } catch {
      toast(t("protect.failed"));
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
