// Earning, reduced to what moves money (Stage 6c). A deposit: exactly `amount` USDC into `vault`, at least `minOut`
// shares back. A withdrawal: at most `maxIn` shares out of the wallet, at least `minOut` USDC back (`amount` is what
// the person asked for). Both paid by the wallet up to `maxFee`. Hashed like every other draft (ARCHITECTURE §4).
import { hashStruct, type Address, type Hex } from "viem";

export const EARN_ACTIONS = { deposit: 0, withdraw: 1 } as const;
export type EarnAction = keyof typeof EARN_ACTIONS;

export type EarnDraft = {
  chainId: number;
  from: Address;
  vault: Address;
  action: EarnAction;
  /** USDC base units asked for. */
  amount: bigint;
  /** The most of what goes in (USDC for a deposit, shares for a withdrawal). */
  maxIn: bigint;
  /** The least of what comes back (shares for a deposit, USDC for a withdrawal). */
  minOut: bigint;
  maxFee: bigint;
};

export const EARN_DRAFT_TYPES = {
  EarnDraft: [
    { name: "chainId", type: "uint256" },
    { name: "from", type: "address" },
    { name: "vault", type: "address" },
    { name: "action", type: "uint8" },
    { name: "amount", type: "uint256" },
    { name: "maxIn", type: "uint256" },
    { name: "minOut", type: "uint256" },
    { name: "maxFee", type: "uint256" },
  ],
} as const;

export function earnDraftHash(draft: EarnDraft): Hex {
  return hashStruct({
    types: EARN_DRAFT_TYPES,
    primaryType: "EarnDraft",
    data: { ...draft, chainId: BigInt(draft.chainId), action: EARN_ACTIONS[draft.action] },
  });
}

export type StoredEarnDraft = Omit<EarnDraft, "amount" | "maxIn" | "minOut" | "maxFee"> & { amount: string; maxIn: string; minOut: string; maxFee: string };

export const storeEarnDraft = (draft: EarnDraft): StoredEarnDraft => ({
  ...draft,
  amount: draft.amount.toString(),
  maxIn: draft.maxIn.toString(),
  minOut: draft.minOut.toString(),
  maxFee: draft.maxFee.toString(),
});

export const loadEarnDraft = (stored: StoredEarnDraft): EarnDraft => ({
  ...stored,
  amount: BigInt(stored.amount),
  maxIn: BigInt(stored.maxIn),
  minOut: BigInt(stored.minOut),
  maxFee: BigInt(stored.maxFee),
});
