// A cross-chain move (routes.md: out of Arc to anyone on another chain, or "Bring to Arc"), reduced to what moves
// money: exactly `amount` of `token` leaves `from` on the origin chain, at least `minReceived` arrives for
// `recipient` on the destination chain, through one provider, with the wallet paying at most `maxFee` in gas (0 for
// a permit Relay executes). The route's quote is shown but not hashed; the minimum is, because the built calls (or
// the provider's fill) are checked against it.
import { hashStruct, type Address, type Hex } from "viem";

export const CROSSCHAIN_PROVIDERS = ["cctp", "across", "relay"] as const;
export type CrossChainProvider = (typeof CROSSCHAIN_PROVIDERS)[number];

export type CrossChainDraft = {
  originChainId: number;
  destinationChainId: number;
  from: Address;
  token: Address;
  amount: bigint;
  recipient: Address;
  minReceived: bigint;
  /** Index in CROSSCHAIN_PROVIDERS. */
  provider: number;
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
    { name: "minReceived", type: "uint256" },
    { name: "provider", type: "uint8" },
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

export type StoredCrossChainDraft = Omit<CrossChainDraft, "amount" | "minReceived" | "maxFee"> & { amount: string; minReceived: string; maxFee: string };

export const storeCrossChainDraft = (draft: CrossChainDraft): StoredCrossChainDraft => ({
  ...draft,
  amount: draft.amount.toString(),
  minReceived: draft.minReceived.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadCrossChainDraft = (stored: StoredCrossChainDraft): CrossChainDraft => ({
  ...stored,
  amount: BigInt(stored.amount),
  minReceived: BigInt(stored.minReceived),
  maxFee: BigInt(stored.maxFee),
});
