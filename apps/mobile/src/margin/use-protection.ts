// Take-profit / stop-loss on the device: whether Kawase may close positions for the person (the five grants, signed
// once with one Face ID), turning that on or off, and setting a position's targets. The api checks every target and
// every signature; this only asks and signs.
import * as React from "react";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import { ApiError, type MarginProtectionChange, type MarginProtectionResult, type MarginProtectionView } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

/** Why a target was refused, as the api names it (a key in the `protect` namespace), or a plain failure. */
export type ProtectionRefusal = "take_profit_wrong_side" | "stop_loss_wrong_side" | "stop_loss_past_liquidation" | "protection_unavailable" | "failed";
const KNOWN: ReadonlySet<string> = new Set(["take_profit_wrong_side", "stop_loss_wrong_side", "stop_loss_past_liquidation", "protection_unavailable"]);

export function useProtection() {
  const { t } = useT();
  const { status, user } = useSession();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [view, setView] = React.useState<MarginProtectionView>();
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (status !== "account") return;
    setView(await api.margin.protection().catch(() => undefined));
  }, [status]);
  React.useEffect(() => {
    void refresh();
  }, [refresh, user?.activeNetwork]);

  /** Sign the grants (one Face ID for all five), then they are on and targets are watched. */
  const turnOn = async () => {
    if (!signer) {
      toast(t("send.approvalUnavailable"));
      return false;
    }
    setBusy(true);
    try {
      const request = await api.margin.protectionGrant();
      const check = await confirmWithBiometrics(t("protect.grantPrompt"), t("common.cancel"));
      if (check !== "approved") {
        toast(check === "unavailable" ? t("send.approvalUnavailable") : check === "failed" ? t("send.approvalFailed") : t("send.faceIdCancelled"));
        return false;
      }
      const signatures: { grantId: string; signature: string }[] = [];
      for (const entry of request.grants) signatures.push({ grantId: entry.grantId, signature: await signer.signTypedData(entry.typedData as TypedDataDefinition) });
      setView(await api.margin.protectionActivate(signatures));
      return true;
    } catch {
      toast(t("protect.failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      setView(await api.margin.protectionRevoke());
    } catch {
      toast(t("protect.failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Save one position's targets; a refusal comes back as its reason. */
  const protect = async (positionId: string, change: MarginProtectionChange): Promise<MarginProtectionResult | { refused: ProtectionRefusal }> => {
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
