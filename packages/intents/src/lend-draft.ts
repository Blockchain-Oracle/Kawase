// An Aave V4 action on the person's own account (earn-borrow.md): supply or withdraw an asset, borrow against
// collateral (supplied in the same batch when asked), or repay. What moves money is hashed: the Spoke, the action, the
// reserve and exact amount (or "all" for a full withdraw/repay), the collateral put in with a borrow, and the fee cap.
import { hashStruct, type Address, type Hex } from "viem";

export const LEND_ACTIONS = ["supply", "withdraw", "borrow", "repay"] as const;
export type LendAction = (typeof LEND_ACTIONS)[number];

export type LendDraft = {
  chainId: number;
  from: Address;
  spoke: Address;
  /** Index in LEND_ACTIONS. */
  action: number;
  reserveId: number;
  /** Base units; for withdraw/repay "all" this is the amount read at drafting (the call takes everything). */
  amount: bigint;
  all: boolean;
  /** Borrow only: collateral supplied in the same batch (0 when the account already has enough). */
  collateralReserveId: number;
  collateralAmount: bigint;
  maxFee: bigint;
};

const TYPES = {
  LendDraft: [
    { name: "chainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "spoke", type: "address" },
    { name: "action", type: "uint8" },
    { name: "reserveId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "all", type: "bool" },
    { name: "collateralReserveId", type: "uint256" },
    { name: "collateralAmount", type: "uint256" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export function lendDraftHash(draft: LendDraft): Hex {
  return hashStruct({
    types: TYPES,
    primaryType: "LendDraft",
    data: { ...draft, chainId: BigInt(draft.chainId), reserveId: BigInt(draft.reserveId), collateralReserveId: BigInt(draft.collateralReserveId) },
  });
}

export type StoredLendDraft = Omit<LendDraft, "amount" | "collateralAmount" | "maxFee"> & { amount: string; collateralAmount: string; maxFee: string };

export const storeLendDraft = (draft: LendDraft): StoredLendDraft => ({ ...draft, amount: draft.amount.toString(), collateralAmount: draft.collateralAmount.toString(), maxFee: draft.maxFee.toString() });
export const loadLendDraft = (stored: StoredLendDraft): LendDraft => ({ ...stored, amount: BigInt(stored.amount), collateralAmount: BigInt(stored.collateralAmount), maxFee: BigInt(stored.maxFee) });
