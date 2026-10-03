// A send, reduced to the fields that move money, and its EIP-712 hash (ARCHITECTURE §4). The hash names exactly
// one version of one payment: an approval carries it, the executor re-derives it, and the receipt is compared
// with it. The note is private, so only its hash is part of the draft. A reference written on chain through Arc's
// Memo contract (an invoice or order id; public) is part of it too: `reference` hashes the memoId and the memo data.
import { encodeAbiParameters, hashStruct, keccak256, stringToHex, toBytes, zeroHash, type Address, type Hex } from "viem";

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
  /** keccak256(memoId, memoData) of the on-chain reference, or zero when the send carries none. */
  reference: Hex;
};

/** An on-chain reference (Arc Memo): the indexed bytes32 id and the public text written with it. */
export type SendMemo = { memoId: Hex; memoData: string };

/** The id for a text reference that came without one: keccak256 of the text (Arc's docs' lookup key). */
export const memoIdFor = (text: string): Hex => keccak256(stringToHex(text));

export const memoReference = (memo: SendMemo | null | undefined): Hex =>
  memo ? keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [memo.memoId, memo.memoData])) : zeroHash;

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
    { name: "reference", type: "bytes32" },
  ],
} as const;

export const memoHash = (note: string | undefined | null): Hex =>
  note && note.trim() ? keccak256(toBytes(note.trim())) : ZERO_HASH;

export function sendDraftHash(draft: SendDraft): Hex {
  return hashStruct({ types: SEND_DRAFT_TYPES, primaryType: "SendDraft", data: { ...draft, chainId: BigInt(draft.chainId) } });
}

/** The draft as stored (bigints as decimal strings). */
export type StoredSendDraft = Omit<SendDraft, "amount" | "maxFee" | "reference"> & { amount: string; maxFee: string; reference?: Hex };

export const storeSendDraft = (draft: SendDraft): StoredSendDraft => ({
  ...draft,
  amount: draft.amount.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadSendDraft = (stored: StoredSendDraft): SendDraft => ({
  ...stored,
  amount: BigInt(stored.amount),
  maxFee: BigInt(stored.maxFee),
  // Drafts stored before references existed carry none.
  reference: stored.reference ?? zeroHash,
});
