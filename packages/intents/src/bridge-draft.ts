// A bridge, reduced to what moves money: exactly `amount` USDC burned on Arc for `recipient` on the CCTP domain of
// the destination, with at most `maxRouteFee` taken on the way (so at least amount − maxRouteFee arrives), the
// wallet paying at most `maxFee` in network fees. Hashed like every other draft (ARCHITECTURE §4).
import { hashStruct, type Address, type Hex } from "viem";

export type BridgeDraft = {
  chainId: number;
  from: Address;
  token: Address;
  amount: bigint;
  destinationDomain: number;
  recipient: Address;
  /** USDC base units the route may take (Circle's forwarder fee and CCTP's fast fee), at most. */
  maxRouteFee: bigint;
  /** Network fee cap for the wallet's transaction on Arc, native unit. */
  maxFee: bigint;
};

export const BRIDGE_DRAFT_TYPES = {
  BridgeDraft: [
    { name: "chainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "destinationDomain", type: "uint32" },
    { name: "recipient", type: "address" },
    { name: "maxRouteFee", type: "uint256" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export function bridgeDraftHash(draft: BridgeDraft): Hex {
  return hashStruct({ types: BRIDGE_DRAFT_TYPES, primaryType: "BridgeDraft", data: { ...draft, chainId: BigInt(draft.chainId) } });
}

export type StoredBridgeDraft = Omit<BridgeDraft, "amount" | "maxRouteFee" | "maxFee"> & { amount: string; maxRouteFee: string; maxFee: string };

export const storeBridgeDraft = (draft: BridgeDraft): StoredBridgeDraft => ({
  ...draft,
  amount: draft.amount.toString(),
  maxRouteFee: draft.maxRouteFee.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadBridgeDraft = (stored: StoredBridgeDraft): BridgeDraft => ({
  ...stored,
  amount: BigInt(stored.amount),
  maxRouteFee: BigInt(stored.maxRouteFee),
  maxFee: BigInt(stored.maxFee),
});
