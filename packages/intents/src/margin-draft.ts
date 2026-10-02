// A Kawase Margin order (open or close a leveraged long/short on Aave V4), reduced to what moves money: which
// account (the Spoke) and reserves, exactly how much margin leaves the wallet, exactly what is borrowed (open) or at
// least what is repaid (close), the least collateral supplied (open) or exactly what is withdrawn (close), the least
// USDC that comes back (close), and the fee cap. Estimates (size, liquidation price) are shown but not hashed; these
// are, because the receipt's Spoke events are checked against them.
import { hashStruct, type Address, type Hex } from "viem";

export type MarginDraft = {
  chainId: number;
  from: Address;
  spoke: Address;
  /** 0 = open, 1 = close. */
  action: number;
  /** 0 = long, 1 = short. */
  side: number;
  collateralReserveId: number;
  debtReserveId: number;
  /** USDC base units out of the wallet (open; 0 for a close). */
  margin: bigint;
  /** Open: exactly borrowed. Close: at least repaid. Debt asset base units. */
  debtDelta: bigint;
  /** Open: at least supplied (the floor the approval may not go under). Close: exactly withdrawn. */
  collateralDelta: bigint;
  /** Close: the least USDC back to the wallet. */
  returnedMin: bigint;
  /** Basis points of the position (close). */
  fractionBps: number;
  maxFee: bigint;
};

export const MARGIN_DRAFT_TYPES = {
  MarginDraft: [
    { name: "chainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "spoke", type: "address" },
    { name: "action", type: "uint8" },
    { name: "side", type: "uint8" },
    { name: "collateralReserveId", type: "uint256" },
    { name: "debtReserveId", type: "uint256" },
    { name: "margin", type: "uint256" },
    { name: "debtDelta", type: "uint256" },
    { name: "collateralDelta", type: "uint256" },
    { name: "returnedMin", type: "uint256" },
    { name: "fractionBps", type: "uint256" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export function marginDraftHash(draft: MarginDraft): Hex {
  return hashStruct({
    types: MARGIN_DRAFT_TYPES,
    primaryType: "MarginDraft",
    data: {
      ...draft,
      chainId: BigInt(draft.chainId),
      collateralReserveId: BigInt(draft.collateralReserveId),
      debtReserveId: BigInt(draft.debtReserveId),
      fractionBps: BigInt(draft.fractionBps),
    },
  });
}

export type StoredMarginDraft = Omit<MarginDraft, "margin" | "debtDelta" | "collateralDelta" | "returnedMin" | "maxFee"> & {
  margin: string;
  debtDelta: string;
  collateralDelta: string;
  returnedMin: string;
  maxFee: string;
};

export const storeMarginDraft = (draft: MarginDraft): StoredMarginDraft => ({
  ...draft,
  margin: draft.margin.toString(),
  debtDelta: draft.debtDelta.toString(),
  collateralDelta: draft.collateralDelta.toString(),
  returnedMin: draft.returnedMin.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadMarginDraft = (stored: StoredMarginDraft): MarginDraft => ({
  ...stored,
  margin: BigInt(stored.margin),
  debtDelta: BigInt(stored.debtDelta),
  collateralDelta: BigInt(stored.collateralDelta),
  returnedMin: BigInt(stored.returnedMin),
  maxFee: BigInt(stored.maxFee),
});
