// Aero LP on the device: the pools, the wallet's positions with Merkl's rewards, a deposit quoted as the amount is
// typed, and the three actions — deposit, withdraw a position, claim — each one transaction the api builds and
// simulates, signed by the wallet after the person's own yes (Face ID, a fingerprint, or the device check on the web).
import * as React from "react";
import { toast } from "sonner-native";

import { ApiError, type LpPoolView, type LpPositionsView, type LpQuoteView, type TransactionRequestResponse } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const QUOTE_DEBOUNCE_MS = 450;
const HTTP_CONFLICT = 409;

export type LpOutcome = "done" | "cancelled" | "failed" | "practice";

export function useLpPools() {
  const [pools, setPools] = React.useState<LpPoolView[]>();
  React.useEffect(() => {
    void api.lp
      .pools()
      .then((view) => setPools(view.pools))
      .catch(() => setPools([]));
  }, []);
  return pools;
}

export function useLpPositions() {
  const { status, user } = useSession();
  const [view, setView] = React.useState<LpPositionsView>();
  const refresh = React.useCallback(async () => {
    if (status !== "account" || user?.activeNetwork !== "mainnet") return;
    setView(await api.lp.positions().catch(() => undefined));
  }, [status, user?.activeNetwork]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  return { view, refresh };
}

/** The deposit quoted for what is typed (debounced); undefined while nothing is typed or it is loading. */
export function useLpQuote(input: { pool: string; asset: string; amount: string } | undefined) {
  const [quote, setQuote] = React.useState<LpQuoteView>();
  const [loading, setLoading] = React.useState(false);
  const key = input ? `${input.pool}|${input.asset}|${input.amount}` : "";
  React.useEffect(() => {
    setQuote(undefined);
    if (!input || !(Number(input.amount) > 0)) return;
    let live = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void api.lp
        .quote(input)
        .then((value) => live && setQuote(value))
        .catch(() => live && setQuote(undefined))
        .finally(() => live && setLoading(false));
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The key carries the input.
  }, [key]);
  return { quote, loading };
}

/** One LP action: the person's yes, then the api builds it, the wallet signs exactly that, and it is sent. */
export function useLpActions(onDone?: () => void) {
  const { t } = useT();
  const signer = useWalletSigner();
  const [busy, setBusy] = React.useState(false);

  const run = async (prompt: string, build: () => Promise<{ request: TransactionRequestResponse }>, done: string): Promise<LpOutcome> => {
    if (!signer) {
      toast(t("send.approvalUnavailable"));
      return "failed";
    }
    const check = await confirmWithBiometrics(prompt, t("common.cancel"));
    if (check !== "approved") {
      toast(check === "unavailable" ? t("send.approvalUnavailable") : check === "failed" ? t("send.approvalFailed") : t("send.faceIdCancelled"));
      return "cancelled";
    }
    setBusy(true);
    try {
      const { request } = await build();
      const signed = await signer.signTransaction(toSerializable(request.transaction));
      const sent = await api.lp.submit(request.requestId, signed);
      if (sent.status !== "confirmed") throw new Error(sent.status);
      toast(done);
      onDone?.();
      return "done";
    } catch (error) {
      if (error instanceof ApiError && error.status === HTTP_CONFLICT && error.code === "practice_mode") {
        toast(t("lp.practice"));
        return "practice";
      }
      toast(t("lp.failed"));
      return "failed";
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    deposit: (input: { pool: string; asset: string; amount: string }) => run(t("lp.depositPrompt"), () => api.lp.deposit(input), t("lp.deposited")),
    withdraw: (positionId: string) => run(t("lp.withdrawPrompt"), () => api.lp.withdraw(positionId), t("lp.withdrawn")),
    claim: () => run(t("lp.claimPrompt"), () => api.lp.claim(), t("lp.claimed")),
  };
}
