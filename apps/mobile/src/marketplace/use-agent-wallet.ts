// The person's agent wallet on the device (cards/marketplace.md "The Agent wallet page"), shared by the page and the
// chat cards. Topping up rides the marketplace grant: the first time, the person's yes (Face ID, or an email code on the
// web) signs it — USDC only into this agent wallet, capped per day — and the same tap then tops up. Later top-ups need
// no prompt (the grant is the authority). Loosening the budget asks for Face ID; tightening is instant (R5).
import * as React from "react";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import type { AgentWalletSettingsChange, AgentWalletView } from "@kawase/api-client";
import { amount, formatPrice } from "@kawase/money";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { sayIfPractice } from "@/safety/practice-refusal";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { signRevoke } from "@/wallet/sign-revoke";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const ZERO = BigInt(0);

/** "0.006 USDC" in the person's locale (sub-cent prices keep their digits). */
export function usePrice() {
  const { locale } = useLocale();
  return React.useCallback((baseUnits: string) => formatPrice(amount("USDC", BigInt(baseUnits)), locale), [locale]);
}

export function useAgentWallet(options: { load?: boolean } = {}) {
  const { t } = useT();
  const { user } = useSession();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const price = usePrice();
  const account = Boolean(user && !user.isGuest);
  const scope = `${user?.id ?? "guest"}:${user?.activeNetwork ?? "testnet"}`;
  const [view, setView] = React.useState<AgentWalletView>();
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState<"top_up" | "return" | "settings" | undefined>();
  const latest = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!account) return;
    const ticket = ++latest.current;
    try {
      const fresh = await api.marketplace.wallet();
      if (ticket === latest.current) {
        setView(fresh);
        setFailed(false);
      }
    } catch {
      if (ticket === latest.current) setFailed(true);
    }
  }, [account]);

  React.useEffect(() => {
    setView(undefined);
    if (options.load !== false) void refresh();
  }, [scope, refresh, options.load]);

  /** Tops up by `baseUnits`; true when the money landed. Signs the grant first when there is none. */
  const topUp = async (baseUnits: string): Promise<boolean> => {
    setBusy("top_up");
    try {
      let result = await api.marketplace.topUp(baseUnits);
      if (result.status === "needs_grant") {
        if (!signer) {
          toast(t("send.approvalUnavailable"));
          return false;
        }
        const check = await confirmWithBiometrics(t("agentWallet.topUpPrompt"), t("common.cancel"));
        if (check !== "approved") {
          toast(check === "unavailable" ? t("send.approvalUnavailable") : check === "failed" ? t("send.approvalFailed") : t("send.faceIdCancelled"));
          return false;
        }
        const signature = await signer.signTypedData(result.grant.typedData as unknown as TypedDataDefinition);
        // The same yes also turns off an earlier grant that still works on chain (Kawase pays its fee when it can).
        const revoke = result.grant.revoke ? await signRevoke(signer, result.grant.revoke) : undefined;
        await api.marketplace.grantSubmit(result.grant.grantId, signature, revoke);
        result = await api.marketplace.topUp(baseUnits);
      }
      if (result.status !== "topped_up") return false;
      setView(result.wallet);
      toast(t("agentWallet.toppedUp", { amount: price(baseUnits) }));
      return true;
    } catch (error) {
      if (!sayIfPractice(error, t)) toast(t("agentWallet.topUpFailed"));
      await refresh();
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const returnAll = async () => {
    setBusy("return");
    try {
      const result = await api.marketplace.returnAll();
      setView(result.wallet);
      const back = result.moves.filter((move) => move.status === "confirmed").reduce((sum, move) => sum + BigInt(move.amount), ZERO);
      if (result.status === "nothing_to_return") toast(t("agentWallet.nothingToReturn"));
      else if (result.moves.some((move) => move.status === "failed")) toast(t("agentWallet.returnFailed"));
      else toast(t("agentWallet.returned", { amount: price(back.toString()) }));
    } catch (error) {
      if (!sayIfPractice(error, t)) toast(t("agentWallet.returnFailed"));
      await refresh();
    } finally {
      setBusy(undefined);
    }
  };

  /** Saves a change; raising a cap (or turning "ask first" off) asks for Face ID first. */
  const updateSettings = async (change: AgentWalletSettingsChange) => {
    if (!view) return;
    const current = view.settings;
    const loosens =
      (change.dailyBudget !== undefined && BigInt(change.dailyBudget) > BigInt(current.dailyBudget)) ||
      (change.perCallCap !== undefined && BigInt(change.perCallCap) > BigInt(current.perCallCap)) ||
      (change.askFirst === false && current.askFirst) ||
      (change.allowedCategories !== undefined && current.allowedCategories.length > 0 && (change.allowedCategories.length === 0 || change.allowedCategories.some((category) => !current.allowedCategories.includes(category)))) ||
      (change.blockedSellers !== undefined && change.blockedSellers.length < current.blockedSellers.length);
    if (loosens) {
      const check = await confirmWithBiometrics(t("agentWallet.loosenPrompt"), t("common.cancel"));
      if (check !== "approved") {
        toast(check === "unavailable" ? t("send.approvalUnavailable") : t("send.faceIdCancelled"));
        return;
      }
    }
    setBusy("settings");
    try {
      const { settings } = await api.marketplace.updateSettings(change);
      setView((previous) => (previous ? { ...previous, settings } : previous));
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(undefined);
    }
  };

  return { view, failed, busy, account, refresh, topUp, returnAll, updateSettings, price };
}
