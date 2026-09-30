// Turnkey behind the WalletSigner interface.
// This file does not import Turnkey's SDK: the app passes in the two functions it gets from
// `useTurnkey()` (native kit) or the web kit, so the same adapter serves both and stays testable.
// Payload encodings follow @turnkey/viem 0.14.43 for messages and authorizations. Typed data is hashed here
// with viem and signed as a raw digest: signing it through Turnkey's own EIP-712 encoding produced a
// signature that did not verify against viem's hash for the delegation typed data (spike 16, 2026-09-30).
import {
  hashMessage,
  hashTypedData,
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

import type { ApprovalStrength, WalletSigner } from "./signer";

export type TurnkeyPayloadEncoding =
  | "PAYLOAD_ENCODING_HEXADECIMAL"
  | "PAYLOAD_ENCODING_EIP712"
  | "PAYLOAD_ENCODING_EIP7702_AUTHORIZATION";

/** r and s as hex without the 0x prefix, v as "00" or "01": the shape Turnkey returns. */
export type TurnkeyRawSignature = { r: string; s: string; v: string };

export type TurnkeySignerDeps = {
  address: Address;
  /**
   * Wraps `httpClient.signRawPayload({ signWith: address, payload, encoding, hashFunction: "HASH_FUNCTION_NO_OP" })`.
   * Do not use the kit's `signMessage` here: for hexadecimal payloads it hex-encodes the string a second time.
   */
  signRawPayload: (request: {
    payload: string;
    encoding: TurnkeyPayloadEncoding;
    approval: ApprovalStrength;
  }) => Promise<TurnkeyRawSignature>;
  /** Wraps the kit's `signTransaction` (`TRANSACTION_TYPE_ETHEREUM`); takes and returns 0x-prefixed hex. */
  signTransaction: (request: { unsignedTransaction: Hex; approval: ApprovalStrength }) => Promise<Hex>;
  /** `passkey` makes every signature show the system passkey sheet (Face ID). */
  approval: ApprovalStrength;
};

const HEX_PREFIX = "0x";
const Y_PARITY_ODD = 1;

const withPrefix = (value: string): Hex => (value.startsWith(HEX_PREFIX) ? (value as Hex) : `${HEX_PREFIX}${value}`);

function toSignatureParts(raw: TurnkeyRawSignature) {
  const yParity = Number.parseInt(raw.v, 16) === Y_PARITY_ODD ? Y_PARITY_ODD : 0;
  return { r: withPrefix(raw.r), s: withPrefix(raw.s), yParity };
}

export function turnkeySigner(deps: TurnkeySignerDeps): WalletSigner {
  const { address, approval } = deps;
  const sign = async (payload: string, encoding: TurnkeyPayloadEncoding) =>
    toSignatureParts(await deps.signRawPayload({ payload, encoding, approval }));

  const account = toAccount({
    address,
    async signMessage({ message }: { message: SignableMessage }) {
      return serializeSignature(await sign(hashMessage(message), "PAYLOAD_ENCODING_HEXADECIMAL"));
    },
    async signTypedData(typedData) {
      return serializeSignature(
        await sign(hashTypedData(typedData as TypedDataDefinition), "PAYLOAD_ENCODING_HEXADECIMAL"),
      );
    },
    async signTransaction(transaction) {
      const unsignedTransaction = serializeTransaction(transaction as TransactionSerializable);
      return deps.signTransaction({ unsignedTransaction, approval });
    },
    async signAuthorization(authorization) {
      const target = authorization.contractAddress ?? authorization.address;
      const parts = await sign(
        JSON.stringify({ address: target, chainId: authorization.chainId, nonce: authorization.nonce }),
        "PAYLOAD_ENCODING_EIP7702_AUTHORIZATION",
      );
      return { address: target, chainId: authorization.chainId, nonce: authorization.nonce, ...parts };
    },
  });
  return account as WalletSigner;
}

/** For callers that hold a serialized signature and need Turnkey's raw shape (tests). */
export function toTurnkeyRawSignature(signature: Hex): TurnkeyRawSignature {
  const { r, s, yParity } = parseSignature(signature);
  return { r: r.slice(HEX_PREFIX.length), s: s.slice(HEX_PREFIX.length), v: yParity === Y_PARITY_ODD ? "01" : "00" };
}
