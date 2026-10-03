// Paying a checked payout (one Face ID, all or nothing): the wallet signs the self-batch transaction, or — when its
// USDC cannot pay the fee (B2-3, no gas dead end) — the one-time delegation for exactly that batch, which Kawase's
// relayer then sends and pays for.
import type { TypedDataDefinition } from "viem";

import { ApiError, type PayoutView } from "@kawase/api-client";
import { GAS_FLOAT_USDC_BASE_UNITS } from "@kawase/config";
import { formatTokenAmount } from "@kawase/money";

import type { useT } from "@/i18n";
import { api } from "@/session/api";
import { toSerializable } from "@/wallet/use-wallet-setup";
import type { useWalletSigner } from "@/wallet/use-wallet-signer";

type Signer = NonNullable<ReturnType<typeof useWalletSigner>>;

const USDC_DECIMALS = 6;

/**
 * What a payout that did not go out says: when Kawase's relayer would not carry it today (the person's share of free
 * network fees, or the day's budget, is used), the reason and the fix (keep a little USDC for the fee); otherwise the
 * plain failure.
 */
export function payoutFailedText(error: unknown, t: ReturnType<typeof useT>["t"], locale: string): string {
  const code = error instanceof ApiError ? (error.code === "relay_limit" ? "GAS_RELAY_LIMIT" : error.code === "relayer_budget_spent" ? "GAS_RELAY_BUDGET_SPENT" : undefined) : undefined;
  if (!code) return t("business.payoutFailed");
  return t(`policy.${code}`, { needed: formatTokenAmount(GAS_FLOAT_USDC_BASE_UNITS, USDC_DECIMALS, "USDC", locale) });
}

export async function signAndSubmitPayout(signer: Signer, payoutId: string): Promise<PayoutView> {
  const request = await api.business.signPayout(payoutId);
  if ("relayed" in request) {
    const signature = await signer.signTypedData(request.typedData as unknown as TypedDataDefinition);
    return (await api.business.submitPayout(payoutId, request.requestId, signature, "typed")).payout;
  }
  const signed = await signer.signTransaction(toSerializable(request.transaction));
  return (await api.business.submitPayout(payoutId, request.requestId, signed)).payout;
}
