// A send, reduced to the fields that move money, and its EIP-712 hash (ARCHITECTURE §4). The hash names exactly
// one version of one payment: an approval carries it, the executor re-derives it, and the receipt is compared
// with it. The note is private, so only its hash is part of the draft.
import { hashStruct, keccak256, toBytes, zeroHash, type Address, type Hex } from "viem";

export type SendDraft = {
  chainId: number;
  from: Address;
  to: Address;
  /** The ERC-20 contract (USDC or EURC on Arc). */
  asset: Address;
  /** Base units of the asset. */
  amount: bigint;
  /** keccak256 of the private note, or zero. */
  memoHash: Hex;
  /** The most the wallet may pay in fees, in the native unit (18 decimals); 0 when Kawase pays. */
  maxFee: bigint;
};

const ZERO_HASH: Hex = zeroHash;

export const SEND_DRAFT_TYPES = {
  SendDraft: [
    { name: "chainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "memoHash", type: "bytes32" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export const memoHash = (note: string | undefined | null): Hex =>
  note && note.trim() ? keccak256(toBytes(note.trim())) : ZERO_HASH;

export function sendDraftHash(draft: SendDraft): Hex {
  return hashStruct({ types: SEND_DRAFT_TYPES, primaryType: "SendDraft", data: { ...draft, chainId: BigInt(draft.chainId) } });
}

/** The draft as stored (bigints as decimal strings). */
export type StoredSendDraft = Omit<SendDraft, "amount" | "maxFee"> & { amount: string; maxFee: string };

export const storeSendDraft = (draft: SendDraft): StoredSendDraft => ({
  ...draft,
  amount: draft.amount.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadSendDraft = (stored: StoredSendDraft): SendDraft => ({
  ...stored,
  amount: BigInt(stored.amount),
  maxFee: BigInt(stored.maxFee),
});
