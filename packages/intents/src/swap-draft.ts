// A swap, reduced to what moves money: exactly `amountIn` of one token leaves the wallet and at least `minOut` of
// the other comes back, on one chain, paid for by the wallet up to `maxFee`. The quote's estimate is shown to the
// person but not hashed; the stop limit is, because the adapter contract enforces it on chain and the receipt is
// checked against it.
import { hashStruct, type Address, type Hex } from "viem";

export type SwapDraft = {
  chainId: number;
  from: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** Base units of tokenIn. */
  amountIn: bigint;
  /** Base units of tokenOut: the least the swap may deliver (the stop limit). */
  minOut: bigint;
  /** The most the wallet may pay in network fees, native unit (18 decimals). */
  maxFee: bigint;
};

export const SWAP_DRAFT_TYPES = {
  SwapDraft: [
    { name: "chainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export function swapDraftHash(draft: SwapDraft): Hex {
  return hashStruct({ types: SWAP_DRAFT_TYPES, primaryType: "SwapDraft", data: { ...draft, chainId: BigInt(draft.chainId) } });
}

export type StoredSwapDraft = Omit<SwapDraft, "amountIn" | "minOut" | "maxFee"> & { amountIn: string; minOut: string; maxFee: string };

export const storeSwapDraft = (draft: SwapDraft): StoredSwapDraft => ({
  ...draft,
  amountIn: draft.amountIn.toString(),
  minOut: draft.minOut.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadSwapDraft = (stored: StoredSwapDraft): SwapDraft => ({
  ...stored,
  amountIn: BigInt(stored.amountIn),
  minOut: BigInt(stored.minOut),
  maxFee: BigInt(stored.maxFee),
});
