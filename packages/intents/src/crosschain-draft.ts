// A cross-chain move (routes.md: out of Arc to anyone on another chain, or "Bring to Arc"), reduced to what moves
// money: exactly `amount` of `token` leaves `from` on the origin chain (plus `nativeFee` in the origin's native coin
// when the provider charges a flat fee on top), at least `minReceived` of `outputToken` arrives for `recipient` on the
// destination chain, through one provider, with the wallet paying at most `maxFee` in gas (0 for a permit Relay
// executes). Converting first: `token` is swapped to USDC on Arc in the same batch through `swapVenue` for at least
// `swapMinOut`, and exactly that much USDC is bridged. The route's quote is shown but not hashed; the minimums are,
// because the built calls (or the provider's fill) are checked against them.
import { hashStruct, zeroAddress, type Address, type Hex } from "viem";

export const CROSSCHAIN_PROVIDERS = ["cctp", "across", "relay", "lifi", "debridge", "socket", "gaszip"] as const;
export type CrossChainProvider = (typeof CROSSCHAIN_PROVIDERS)[number];
/** Where a convert-first swap runs on Arc (the swap fan-out's venues). */
export const CONVERT_VENUES = ["kyberswap", "app_kit", "lifi"] as const;

export type CrossChainDraft = {
  originChainId: number;
  destinationChainId: number;
  from: Address;
  /** What leaves the origin (the zero address for a native coin). */
  token: Address;
  amount: bigint;
  recipient: Address;
  /** What arrives, on the destination chain. */
  outputToken: Address;
  minReceived: bigint;
  /** Index in CROSSCHAIN_PROVIDERS. */
  provider: number;
  /** A flat provider fee in the origin's native coin, paid on top (deBridge); 0 otherwise. */
  nativeFee: bigint;
  /** Convert first: the least USDC the Arc swap gives, which is what is bridged; 0 without a swap. */
  swapMinOut: bigint;
  /** Index in CONVERT_VENUES (meaningful only with swapMinOut > 0). */
  swapVenue: number;
  maxFee: bigint;
};

const TYPES = {
  CrossChainDraft: [
    { name: "originChainId", type: "uint256" },
    { name: "destinationChainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "minReceived", type: "uint256" },
    { name: "provider", type: "uint8" },
    { name: "nativeFee", type: "uint256" },
    { name: "swapMinOut", type: "uint256" },
    { name: "swapVenue", type: "uint8" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export function crossChainDraftHash(draft: CrossChainDraft): Hex {
  return hashStruct({
    types: TYPES,
    primaryType: "CrossChainDraft",
    data: { ...draft, originChainId: BigInt(draft.originChainId), destinationChainId: BigInt(draft.destinationChainId) },
  });
}

type Big = "amount" | "minReceived" | "maxFee" | "nativeFee" | "swapMinOut";
export type StoredCrossChainDraft = Omit<CrossChainDraft, Big> & { [K in Big]: string };

export const storeCrossChainDraft = (draft: CrossChainDraft): StoredCrossChainDraft => ({
  ...draft,
  amount: draft.amount.toString(),
  minReceived: draft.minReceived.toString(),
  maxFee: draft.maxFee.toString(),
  nativeFee: draft.nativeFee.toString(),
  swapMinOut: draft.swapMinOut.toString(),
});

/** A stored draft; one from before any-asset moves reads with no output token, so its hash no longer matches and it is drafted again. */
export const loadCrossChainDraft = (stored: Partial<StoredCrossChainDraft> & Omit<StoredCrossChainDraft, Big | "outputToken" | "swapVenue"> & { amount: string; minReceived: string; maxFee: string }): CrossChainDraft => ({
  ...stored,
  outputToken: stored.outputToken ?? zeroAddress,
  amount: BigInt(stored.amount),
  minReceived: BigInt(stored.minReceived),
  maxFee: BigInt(stored.maxFee),
  nativeFee: BigInt(stored.nativeFee ?? "0"),
  swapMinOut: BigInt(stored.swapMinOut ?? "0"),
  swapVenue: stored.swapVenue ?? 0,
});
