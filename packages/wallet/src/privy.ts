// Privy behind the WalletSigner interface (D41).
// Like turnkey.ts, this file does not import Privy's SDK: the app passes in one function, `signHash`, which wraps the
// embedded wallet's EIP-1193 `secp256k1_sign` (native @privy-io/expo and web @privy-io/react-auth expose the same
// method), so one adapter serves both and stays testable with a local key.
// Everything is a raw 32-byte digest: viem hashes the message, the typed data, the authorization or the transaction
// here, and the wallet signs that digest. This is the pattern turnkey.ts already proved for the delegation typed data
// (spike 16 finding 1), and it means no Privy-side encoding can differ from what the chain checks.
// Before anything is signed, the phone checks it against what is compiled into the app (checks.ts, review M6).
import {
  hashMessage,
  hashTypedData,
  keccak256,
  parseSignature,
  serializeSignature,
  serializeTransaction,
  type Address,
  type Hex,
  type SignableMessage,
  type TransactionSerializable,
  type TypedDataDefinition,
} from "viem";
import { toAccount } from "viem/accounts";
import { hashAuthorization } from "viem/utils";

import { checkAuthorization, checkTypedData } from "./checks";
import type { ApprovalStrength, WalletSigner } from "./signer";

const DIGEST_HEX_LENGTH = 66;

export type PrivySignerDeps = {
  address: Address;
  /**
   * Signs a 32-byte digest raw with the embedded wallet:
   * `provider.request({ method: "secp256k1_sign", params: [hash] })`. Returns a 65-byte 0x signature (v as 27/28 or
   * 0/1; both parse).
   */
  signHash: (hash: Hex) => Promise<Hex>;
  /**
   * Privy keys are not bound to the device, so there is no per-signature system sheet. With `passkey`, this runs
   * before each signature (the app's own Face ID gate); a rejection stops the signature.
   */
  confirm?: (() => Promise<void>) | undefined;
  approval: ApprovalStrength;
};

/** Splits a 65-byte signature into the parts viem serializes (yParity from v = 27/28 or 0/1). */
export function signatureParts(signature: Hex) {
  const { r, s, yParity } = parseSignature(signature);
  return { r, s, yParity: yParity ?? 0 };
}

export function privySigner(deps: PrivySignerDeps): WalletSigner {
  const { address, approval } = deps;
  const sign = async (hash: Hex) => {
    if (hash.length !== DIGEST_HEX_LENGTH) throw new Error("only a 32-byte digest is signed");
    if (approval === "passkey" && deps.confirm) await deps.confirm();
    return signatureParts(await deps.signHash(hash));
  };

  const account = toAccount({
    address,
    async signMessage({ message }: { message: SignableMessage }) {
      return serializeSignature(await sign(hashMessage(message)));
    },
    async signTypedData(typedData) {
      // The digest is signed raw, so what it commits to is checked here first: a delegation must decode (checks.ts).
      checkTypedData(typedData as TypedDataDefinition, address);
      return serializeSignature(await sign(hashTypedData(typedData as TypedDataDefinition)));
    },
    async signTransaction(transaction) {
      // How viem's own local account signs: the keccak of the unsigned serialization, then the signed serialization.
      const unsigned = transaction as TransactionSerializable;
      const parts = await sign(keccak256(serializeTransaction(unsigned)));
      return serializeTransaction(unsigned, parts);
    },
    async signAuthorization(authorization) {
      // Only ever MetaMask's DeleGator, only on Arc: the address and chain ids are compiled into the app (M6).
      checkAuthorization(authorization);
      const target = authorization.contractAddress ?? authorization.address;
      const parts = await sign(
        hashAuthorization({ contractAddress: target, chainId: authorization.chainId, nonce: authorization.nonce }),
      );
      return { address: target, chainId: authorization.chainId, nonce: authorization.nonce, ...parts };
    },
  });
  return account as WalletSigner;
}
