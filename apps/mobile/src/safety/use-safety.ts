// Wallet & limits on the device (cards/automate-safety.md "Stay in control"), shared by the screen and the chat cards.
// A change goes to the api, which classifies it: a tightening comes back applied; a loosening comes back with what the
// wallet signs. Approving is the owner's own yes (Face ID, a fingerprint, or an email code on the web) followed by the
// wallet signing exactly that — the step-up message, or the new grant together with the revoke of the grant it
// replaces (one yes covers both), so the chain never holds two allowances for one token. Only an explicit "approved"
// from the device check signs (review R03).
import * as React from "react";
import type { TypedDataDefinition } from "viem";

import { ApiError, type SafetyChange, type SafetyChangeResponse, type SafetyView, type TransactionRequestResponse } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";

import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

export const ARC_CHAIN_IDS = { mainnet: 5042, testnet: 5042002 } as const;
const SECONDS_PER_HOUR = 3_600;
const HTTP_CONFLICT = 409;
const TENTHS = 10;

export type Pending = Extract<SafetyChangeResponse, { status: "needs_approval" }>;
export type ApprovalOutcome = "applied" | "cancelled" | "unavailable" | "failed" | "expired";
export type RevokeOutcome = "revoked" | "later";

/** The limits on the active network, loaded when asked and kept per account and network. */
export function useSafetyView() {
  const { user } = useSession();
  const scope = `${user?.id ?? "guest"}:${user?.activeNetwork ?? "testnet"}`;
  const [view, setView] = React.useState<{ scope: string; safety: SafetyView }>();
  const [failed, setFailed] = React.useState(false);
  const canLoad = Boolean(user && !user.isGuest);
  const load = React.useCallback(async () => {
    if (!canLoad) return;
    try {
      const safety = await api.safety.get();
      setView({ scope, safety });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [canLoad, scope]);
  const set = React.useCallback((safety: SafetyView) => setView({ scope, safety }), [scope]);
  return { safety: view?.scope === scope ? view.safety : undefined, failed, load, set, canLoad };
}

/** Asking for a change, approving a loosening, and signing an on-chain revoke. */
export function useSafetyChange() {
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const session = useSession();

  /** A tightening applies now; a loosening returns what to approve. Errors are thrown to the caller. */
  const request = React.useCallback(
    async (change: SafetyChange, via: "app" | "chat" = "app") => {
      const response = await api.safety.change(change, via);
      if (response.status !== "needs_approval") await session.refresh();
      return response;
    },
    [session],
  );

  /** The owner's yes, then exactly what the api asked for is signed and sent back. */
  const approve = React.useCallback(
    async (pending: Pending, prompt: string, cancelLabel: string): Promise<{ outcome: ApprovalOutcome; response?: SafetyChangeResponse }> => {
      if (!signer) return { outcome: "unavailable" };
      const check = await confirmWithBiometrics(prompt, cancelLabel);
      if (check !== "approved") return { outcome: check === "unavailable" ? "unavailable" : check === "failed" ? "failed" : "cancelled" };
      try {
        const signature = await signer.signTypedData(pending.approval.typedData as unknown as TypedDataDefinition);
        // The old grant's revoke is signed in the same yes, before anything is sent.
        const revoke = pending.approval.kind === "grant" ? pending.approval.revoke : null;
        const signedRevoke = revoke ? await signer.signTransaction(toSerializable(revoke.transaction)) : undefined;
        const response = await api.safety.approve(pending.changeId, signature);
        if (revoke && signedRevoke) await api.wallet.submitTransaction(revoke.requestId, signedRevoke).catch(() => undefined);
        await session.refresh();
        return { outcome: "applied", response };
      } catch (error) {
        if (error instanceof ApiError && error.status === HTTP_CONFLICT) return { outcome: "expired" };
        return { outcome: "failed" };
      }
    },
    [signer, session],
  );

  /** An on-chain revoke the api prepared: the owner's yes, the wallet signs it, the api broadcasts and confirms it. */
  const revoke = React.useCallback(
    async (transaction: TransactionRequestResponse, prompt: string, cancelLabel: string): Promise<RevokeOutcome> => {
      if (!signer) return "later";
      const check = await confirmWithBiometrics(prompt, cancelLabel);
      if (check !== "approved") return "later";
      try {
        const signed = await signer.signTransaction(toSerializable(transaction.transaction));
        const result = await api.wallet.submitTransaction(transaction.requestId, signed);
        await session.refresh();
        return result.status === "confirmed" ? "revoked" : "later";
      } catch {
        return "later";
      }
    },
    [signer, session],
  );

  return { request, approve, revoke, canSign: Boolean(signer) };
}

/** Amounts in any token's own decimals, times and hours, in the person's language. */
export function useSafetyFormat() {
  const { locale } = useLocale();
  return React.useMemo(() => {
    const money = (baseUnits: string | bigint | undefined, decimals: number, symbol: string) =>
      formatTokenAmount(BigInt(baseUnits ?? 0), decimals, symbol, locale, { trimZeros: true });
    const usdc = (baseUnits: string | bigint | undefined) => money(baseUnits, USDC_DECIMALS, "USDC");
    const time = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    const hours = (seconds: number) => Math.round((seconds / SECONDS_PER_HOUR) * TENTHS) / TENTHS;
    return { money, usdc, time, hours };
  }, [locale]);
}

const USDC_DECIMALS = 6;
const TEN = 10n;

/** "12.5" or "12,5" → base units in `decimals`; undefined when it is not a plain positive amount. */
export function toBaseUnits(text: string, decimals: number): bigint | undefined {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const [whole = "0", fraction = ""] = cleaned.split(".");
  if (fraction.length > decimals) return undefined;
  return BigInt(whole) * TEN ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/** Base units → the plain number a field shows ("12.5"). */
export function fromBaseUnits(baseUnits: string | bigint, decimals: number): string {
  const value = BigInt(baseUnits);
  const divisor = TEN ** BigInt(decimals);
  const fraction = (value % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${value / divisor}.${fraction}` : `${value / divisor}`;
}
