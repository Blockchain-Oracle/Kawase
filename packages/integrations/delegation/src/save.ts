// Auto-save (Stage 8b): Kawase may move the person's USDC between their wallet and their own position in one vault,
// and nowhere else. Three grants, each narrowed by its caveats and redeemable only by the ops wallet until it ends:
//  - approve:  `usdc.approve(vault, …)` — the spender pinned to that vault;
//  - deposit:  `vault.deposit(assets, receiver)` — the receiver pinned to the wallet itself;
//  - withdraw: `vault.withdraw(assets, receiver, owner)` — receiver and owner both pinned to the wallet.
// Any redeem under them can only turn the person's USDC into the person's own vault shares and back. They are
// separate grants because a caveat applies to every call a grant allows: one grant for all three could not pin a
// different argument for each (and would let the vault's own shares be approved away).
import { CaveatType, ExecutionMode, ScopeType, createDelegation, createExecution, type Delegation } from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { encodeFunctionData, erc20Abi, pad, type Address, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";
import { encodeRedeem, type ContractCall } from "./redeem";

const APPROVE_SIGNATURE = "approve(address,uint256)";
const DEPOSIT_SIGNATURE = "deposit(uint256,address)";
const WITHDRAW_SIGNATURE = "withdraw(uint256,address,address)";
const SELECTOR_BYTES = 4;
const ABI_WORD_BYTES = 32;
/** Where an argument starts in calldata: after the selector, one ABI word per earlier argument. */
const argumentAt = (position: number) => SELECTOR_BYTES + position * ABI_WORD_BYTES;
const word = (address: Address) => pad(address, { size: ABI_WORD_BYTES });
const NO_VALUE = 0n;

const VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

export type SaveGrantTerms = {
  network: NetworkContext;
  /** The person's wallet (the delegator, and the only receiver). */
  wallet: Address;
  /** The ops wallet: the only address that may redeem. */
  redeemer: Address;
  usdc: Address;
  vault: Address;
  /** Unix seconds. After this the grants are dead. */
  expiresAt: number;
  /** Random 32 bytes each; makes every grant unique. */
  salts: { approve: Hex; deposit: Hex; withdraw: Hex };
};

export type SaveGrants = { approve: Delegation; deposit: Delegation; withdraw: Delegation };
export type SavePurpose = keyof SaveGrants;
export const SAVE_PURPOSES: readonly SavePurpose[] = ["approve", "deposit", "withdraw"];

function grant(terms: SaveGrantTerms, target: Address, selector: string, pins: { position: number; address: Address }[], salt: Hex): Delegation {
  return createDelegation({
    environment: delegationEnvironment(terms.network),
    from: terms.wallet,
    to: terms.redeemer,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [target],
      selectors: [selector],
      allowedCalldata: pins.map((pin) => ({ startIndex: argumentAt(pin.position), value: word(pin.address) })),
      valueLte: { maxValue: NO_VALUE },
    },
    caveats: [
      { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: terms.expiresAt },
      { type: CaveatType.Redeemer, redeemers: [terms.redeemer] },
    ],
    salt,
  });
}

export function buildSaveGrants(terms: SaveGrantTerms): SaveGrants {
  return {
    approve: grant(terms, terms.usdc, APPROVE_SIGNATURE, [{ position: 0, address: terms.vault }], terms.salts.approve),
    deposit: grant(terms, terms.vault, DEPOSIT_SIGNATURE, [{ position: 1, address: terms.wallet }], terms.salts.deposit),
    withdraw: grant(
      terms,
      terms.vault,
      WITHDRAW_SIGNATURE,
      [
        { position: 1, address: terms.wallet },
        { position: 2, address: terms.wallet },
      ],
      terms.salts.withdraw,
    ),
  };
}

export type SaveMove = { direction: "in" | "out"; amount: bigint; wallet: Address; usdc: Address; vault: Address };

/**
 * The ops wallet's one transaction for a move. In: approve exactly the amount, then deposit it for the wallet — two
 * redeems processed in order in one call. Out: withdraw the amount to the wallet, from the wallet's own shares.
 */
export function encodeRedeemSave(network: NetworkContext, grants: Pick<SaveGrants, "approve" | "deposit"> | Pick<SaveGrants, "withdraw">, move: SaveMove): ContractCall {
  const environment = delegationEnvironment(network);
  if (move.direction === "in") {
    const { approve, deposit } = grants as Pick<SaveGrants, "approve" | "deposit">;
    const approveData = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [move.vault, move.amount] });
    const depositData = encodeFunctionData({ abi: VAULT_ABI, functionName: "deposit", args: [move.amount, move.wallet] });
    const data = DelegationManager.encode.redeemDelegations({
      delegations: [[approve], [deposit]],
      modes: [ExecutionMode.SingleDefault, ExecutionMode.SingleDefault],
      executions: [[createExecution({ target: move.usdc, callData: approveData })], [createExecution({ target: move.vault, callData: depositData })]],
    });
    return { to: environment.DelegationManager, data };
  }
  const { withdraw } = grants as Pick<SaveGrants, "withdraw">;
  const withdrawData = encodeFunctionData({ abi: VAULT_ABI, functionName: "withdraw", args: [move.amount, move.wallet, move.wallet] });
  return encodeRedeem(network, withdraw, { target: move.vault, callData: withdrawData });
}
