// Action grants (D38, the weekly budget): what lets Kawase act inside the person's budget with no Face ID, and still
// never lets a leaked server key steal. Two kinds, both built here in code, never by the model (K2):
//
// One-shot leaves, signed by the phone per action while the person watches (docs pack §5):
//  - swap:  an `approve(router, amountIn)` pinned by ExactExecution, and the router call under AllowedTargets [router],
//           ValueLte 0, ERC20BalanceChange "tokenOut of the wallet rises by at least minOut" and "tokenIn of the wallet
//           falls by at most amountIn". Whatever calldata the ops wallet sends, output that does not land in the
//           wallet, or less than minOut of it, reverts on chain; that holds for every venue with no calldata parsing.
//  - earn:  ERC-4626 `deposit(assets, wallet)` / `withdraw(assets, wallet, wallet)` pinned exactly (the receiver and
//           owner are the wallet), plus the share and asset balance changes.
//  Every leaf: Timestamp now+120 s, LimitedCalls 1, Redeemer ops, a fresh random salt (LimitedCalls and the balance
//  cache are keyed by the delegation hash; identical leaves would share counters, kit issue #207), and the Nonce.
//
// Standing per-contact send grants (the away pack): `transfer` of one token only to one saved contact, capped per
// period, replacing the any-recipient allowance (grants.ts `buildAllowanceGrant`).
//
// The Nonce kill-switch: every grant and leaf carries the wallet's current NonceEnforcer nonce. One transaction from
// the wallet, `NonceEnforcer.incrementNonce(DelegationManager)`, kills all of them at once.
//
// Balance-change, Nonce and LogicalOr enforcers only run in the default single mode (docs pack §4): every leaf is
// redeemed as SingleDefault with one execution, several leaves side by side in one `redeemDelegations`
// (`encodeRedeemMany`).
import { BalanceChangeType, ROOT_AUTHORITY, createExecution, type Delegation } from "@metamask/smart-accounts-kit";
import { NonceEnforcer } from "@metamask/smart-accounts-kit/contracts";
import { createCaveatBuilder } from "@metamask/smart-accounts-kit/utils";
import { bytesToHex, encodeFunctionData, erc20Abi, parseAbi, toHex, type Address, type Client, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";
import { buildAutomationGrant, type GrantTerms } from "./grants";
import { encodeRedeemMany, type ContractCall } from "./redeem";

/** How long a one-shot leaf lives: long enough for Arc finality and clock skew (docs pack §10), short enough to be useless later. */
export const LEAF_TTL_SECONDS = 120;
const ONCE = 1;
const NO_VALUE = 0n;
const UNSIGNED: Hex = "0x";
const SALT_BYTES = 32;
const NONCE_BYTES = 32;

export const ERC4626_ABI = parseAbi([
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function asset() view returns (address)",
]);

/** 32 random bytes for a delegation's salt. */
export function randomSalt(): Hex {
  const bytes = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** The Nonce caveat's terms: the wallet's current nonce, as 32 bytes. */
export const nonceTerms = (nonce: bigint): Hex => toHex(nonce, { size: NONCE_BYTES });

/** What every leaf shares: who signs, who redeems, when it dies, and the kill-switch it is bound to. */
export type LeafCommon = {
  network: NetworkContext;
  /** The person's wallet (the delegator). */
  wallet: Address;
  /** The agent's ops wallet: the only delegate and the only redeemer. */
  ops: Address;
  /** The wallet's current NonceEnforcer nonce (`readGrantNonce`). */
  nonce: bigint;
  /** Unix seconds; the leaf dies at now + LEAF_TTL_SECONDS. */
  now: number;
};

/** One leaf and the single call it was signed for. */
export type LeafStep = { grant: Delegation; target: Address; callData: Hex };

type Builder = ReturnType<typeof createCaveatBuilder>;

function leafCommon(builder: Builder, terms: LeafCommon): Builder {
  return builder
    .addCaveat("timestamp", { afterThreshold: 0, beforeThreshold: terms.now + LEAF_TTL_SECONDS })
    .addCaveat("limitedCalls", { limit: ONCE })
    .addCaveat("redeemer", { redeemers: [terms.ops] })
    .addCaveat("nonce", { nonce: nonceTerms(terms.nonce) });
}

function leaf(terms: LeafCommon, caveats: ReturnType<Builder["build"]>, salt: Hex): Delegation {
  return { delegate: terms.ops, delegator: terms.wallet, authority: ROOT_AUTHORITY as Hex, caveats, salt, signature: UNSIGNED };
}

/** The approval a leaf pins exactly: `token.approve(spender, amount)` from the wallet, no value. */
export function approveExecution(token: Address, spender: Address, amount: bigint) {
  return createExecution({ target: token, value: NO_VALUE, callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
}

// ── Swap ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SwapLeafTerms = LeafCommon & {
  /** The venue's contract: the approve's only spender and the swap's only target. */
  router: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** Base units of tokenIn: the approval, and the most the wallet's tokenIn may fall. */
  amountIn: bigint;
  /** Base units of tokenOut the wallet's balance must rise by, from a quote the phone fetched and checked. */
  minOut: bigint;
  /** The venue's swap calldata (the router call). Not pinned: the balance changes are what guard it. */
  routerCalldata: Hex;
  salts: readonly [Hex, Hex];
};

export type SwapLeaves = { approveLeaf: Delegation; swapLeaf: Delegation; steps: [LeafStep, LeafStep]; expiresAt: number };

/** The two one-shot leaves of a swap, unsigned (sign each with `grantTypedData`). */
export function buildSwapLeaves(terms: SwapLeafTerms): SwapLeaves {
  const environment = delegationEnvironment(terms.network);
  const approve = approveExecution(terms.tokenIn, terms.router, terms.amountIn);
  const approveLeaf = leaf(terms, leafCommon(createCaveatBuilder(environment).addCaveat("exactExecution", { execution: approve }), terms).build(), terms.salts[0]);
  const swapLeaf = leaf(
    terms,
    leafCommon(
      createCaveatBuilder(environment)
        .addCaveat("allowedTargets", { targets: [terms.router] })
        .addCaveat("valueLte", { maxValue: NO_VALUE })
        .addCaveat("erc20BalanceChange", { tokenAddress: terms.tokenOut, recipient: terms.wallet, balance: terms.minOut, changeType: BalanceChangeType.Increase })
        .addCaveat("erc20BalanceChange", { tokenAddress: terms.tokenIn, recipient: terms.wallet, balance: terms.amountIn, changeType: BalanceChangeType.Decrease }),
      terms,
    ).build(),
    terms.salts[1],
  );
  return {
    approveLeaf,
    swapLeaf,
    steps: [
      { grant: approveLeaf, target: approve.target, callData: approve.callData },
      { grant: swapLeaf, target: terms.router, callData: terms.routerCalldata },
    ],
    expiresAt: terms.now + LEAF_TTL_SECONDS,
  };
}

// ── Earn (ERC-4626 vaults) ────────────────────────────────────────────────────────────────────────────────────────

export type EarnLeafTerms = LeafCommon & {
  action: "deposit" | "withdraw";
  vault: Address;
  /** The vault's asset (USDC). */
  asset: Address;
  /** Base units of the asset deposited, or withdrawn. */
  amount: bigint;
  /** Deposit: the least shares the wallet must gain. Withdraw: the least asset the wallet must gain. */
  minOut: bigint;
  /** Withdraw only: the most shares the wallet may lose. */
  maxSharesIn?: bigint | undefined;
  /** Two salts for a deposit (approve, deposit); a withdraw uses the first. */
  salts: readonly [Hex, Hex];
};

export type EarnLeaves = { leaves: Delegation[]; steps: LeafStep[]; expiresAt: number };

/**
 * The one-shot leaves of a vault move, unsigned. Deposit: an exact `approve(vault, amount)` and an exact
 * `deposit(amount, wallet)`, shares up by at least minOut and the asset down by at most amount. Withdraw: an exact
 * `withdraw(amount, wallet, wallet)`, the asset up by at least minOut and shares down by at most maxSharesIn.
 */
export function buildEarnLeaves(terms: EarnLeafTerms): EarnLeaves {
  const environment = delegationEnvironment(terms.network);
  const expiresAt = terms.now + LEAF_TTL_SECONDS;
  if (terms.action === "deposit") {
    const approve = approveExecution(terms.asset, terms.vault, terms.amount);
    const deposit = createExecution({ target: terms.vault, value: NO_VALUE, callData: encodeFunctionData({ abi: ERC4626_ABI, functionName: "deposit", args: [terms.amount, terms.wallet] }) });
    const approveLeaf = leaf(terms, leafCommon(createCaveatBuilder(environment).addCaveat("exactExecution", { execution: approve }), terms).build(), terms.salts[0]);
    const depositLeaf = leaf(
      terms,
      leafCommon(
        createCaveatBuilder(environment)
          .addCaveat("exactExecution", { execution: deposit })
          .addCaveat("erc20BalanceChange", { tokenAddress: terms.vault, recipient: terms.wallet, balance: terms.minOut, changeType: BalanceChangeType.Increase })
          .addCaveat("erc20BalanceChange", { tokenAddress: terms.asset, recipient: terms.wallet, balance: terms.amount, changeType: BalanceChangeType.Decrease }),
        terms,
      ).build(),
      terms.salts[1],
    );
    return {
      leaves: [approveLeaf, depositLeaf],
      steps: [
        { grant: approveLeaf, target: approve.target, callData: approve.callData },
        { grant: depositLeaf, target: deposit.target, callData: deposit.callData },
      ],
      expiresAt,
    };
  }
  if (terms.maxSharesIn === undefined) throw new Error("a withdraw leaf needs maxSharesIn");
  const withdraw = createExecution({ target: terms.vault, value: NO_VALUE, callData: encodeFunctionData({ abi: ERC4626_ABI, functionName: "withdraw", args: [terms.amount, terms.wallet, terms.wallet] }) });
  const withdrawLeaf = leaf(
    terms,
    leafCommon(
      createCaveatBuilder(environment)
        .addCaveat("exactExecution", { execution: withdraw })
        .addCaveat("erc20BalanceChange", { tokenAddress: terms.asset, recipient: terms.wallet, balance: terms.minOut, changeType: BalanceChangeType.Increase })
        .addCaveat("erc20BalanceChange", { tokenAddress: terms.vault, recipient: terms.wallet, balance: terms.maxSharesIn, changeType: BalanceChangeType.Decrease }),
      terms,
    ).build(),
    terms.salts[0],
  );
  return { leaves: [withdrawLeaf], steps: [{ grant: withdrawLeaf, target: withdraw.target, callData: withdraw.callData }], expiresAt };
}

/** The ops wallet's one transaction for a set of signed leaves: each in its own SingleDefault slot, all or nothing. */
export function encodeRedeemLeaves(network: NetworkContext, steps: readonly LeafStep[]): ContractCall {
  if (steps.length === 0) throw new Error("nothing to redeem");
  if (steps.some((step) => step.grant.signature === UNSIGNED)) throw new Error("a leaf is not signed");
  return encodeRedeemMany(network, steps);
}

// ── Per-contact send grants (the away pack) ───────────────────────────────────────────────────────────────────────

export type ContactSendTerms = Omit<GrantTerms, "salt" | "nonce"> & {
  /** The wallet's current NonceEnforcer nonce. */
  nonce: bigint;
  /** One grant per saved contact, each with its own salt. */
  contacts: readonly { address: Address; salt: Hex }[];
};

/**
 * One standing grant per saved contact: `transfer` of one token only to that contact, at most `amountPerPeriod` per
 * period, redeemable only by ops, until `expiresAt`, bound to the Nonce kill-switch. A leaked ops key can only pay
 * people the owner already saved, inside the cap; a new person always needs the owner.
 */
export function buildContactSendGrants(terms: ContactSendTerms): Delegation[] {
  const { contacts, ...rest } = terms;
  return contacts.map((contact) => buildAutomationGrant({ ...rest, recipient: contact.address, salt: contact.salt }));
}

// ── The Nonce kill-switch ─────────────────────────────────────────────────────────────────────────────────────────

/** The wallet's current nonce at the NonceEnforcer: every grant signed now carries it. */
export async function readGrantNonce(client: Client, network: NetworkContext, wallet: Address): Promise<bigint> {
  const environment = delegationEnvironment(network);
  return NonceEnforcer.read.currentNonce({
    client,
    contractAddress: environment.caveatEnforcers.NonceEnforcer!,
    delegationManager: environment.DelegationManager,
    delegator: wallet,
  });
}

/**
 * The revoke-everything call: `NonceEnforcer.incrementNonce(DelegationManager)`. The WALLET must send it (the enforcer
 * keys the nonce on its caller), as its own transaction or inside its self-batch / a relayed batch. After it mines,
 * every grant and leaf signed with the old nonce fails `NonceEnforcer:invalid-nonce`.
 */
export function encodeIncrementNonce(network: NetworkContext): ContractCall {
  const environment = delegationEnvironment(network);
  return { to: environment.caveatEnforcers.NonceEnforcer!, data: NonceEnforcer.encode.incrementNonce(environment.DelegationManager) };
}
