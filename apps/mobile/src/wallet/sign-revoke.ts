// An on-chain revoke the api prepared (`disableDelegation` for each grant it covers). Kawase's relayer sends it and pays,
// so the wallet signs a one-time delegation for exactly those calls; while the relayer has no gas it is a transaction
// the wallet sends itself. Either way what the wallet signed goes back with the request id: on its own (submitRevoke),
// or with the new grant it makes way for, so the api turns the old one off on chain before the new one goes on.
import type { TypedDataDefinition } from "viem";

import type { RevokeRequest, SignedRevokeInput } from "@kawase/api-client";
import { checkRevoke, type WalletSigner } from "@kawase/wallet";

import { api } from "@/session/api";
import { toSerializable } from "@/wallet/serializable";

export async function signRevoke(signer: WalletSigner, request: RevokeRequest): Promise<SignedRevokeInput> {
  // A revoke does only that: every call is disableDelegation of this wallet's own grants, decoded here (M6).
  checkRevoke("relayed" in request ? { typedData: request.typedData } : { transaction: request.transaction }, signer.address);
  if ("relayed" in request) return { requestId: request.requestId, signed: await signer.signTypedData(request.typedData as unknown as TypedDataDefinition) };
  return { requestId: request.requestId, signed: await signer.signTransaction(toSerializable(request.transaction)) };
}

/** A revoke signed on its own: the api sends it and answers with the chain's outcome. */
export function submitRevoke(request: RevokeRequest, signed: SignedRevokeInput) {
  return "relayed" in request ? api.wallet.submitSignature(signed.requestId, signed.signed) : api.wallet.submitTransaction(signed.requestId, signed.signed);
}
