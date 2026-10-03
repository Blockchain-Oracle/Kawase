// Paying a checked payout (one Face ID, all or nothing): the wallet signs the self-batch transaction, or — when its
// USDC cannot pay the fee (B2-3, no gas dead end) — the one-time delegation for exactly that batch, which Kawase's
// relayer then sends and pays for.
import type { TypedDataDefinition } from "viem";

import type { PayoutView } from "@kawase/api-client";

import { api } from "@/session/api";
import { toSerializable } from "@/wallet/use-wallet-setup";
import type { useWalletSigner } from "@/wallet/use-wallet-signer";

type Signer = NonNullable<ReturnType<typeof useWalletSigner>>;

export async function signAndSubmitPayout(signer: Signer, payoutId: string): Promise<PayoutView> {
  const request = await api.business.signPayout(payoutId);
  if ("relayed" in request) {
    const signature = await signer.signTypedData(request.typedData as unknown as TypedDataDefinition);
    return (await api.business.submitPayout(payoutId, request.requestId, signature, "typed")).payout;
  }
  const signed = await signer.signTransaction(toSerializable(request.transaction));
  return (await api.business.submitPayout(payoutId, request.requestId, signed)).payout;
}
