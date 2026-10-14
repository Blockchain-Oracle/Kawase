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
import { bytesToHex, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, parseAbi, toHex, type Address, type Client, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";
import { buildBridgeGrants } from "./bridge-grants";
import { buildAutomationGrant, type GrantTerms } from "./grants";
import { buildSaveGrants } from "./save";
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

/** One leaf and the single call it was signed for (`value`: native value the call carries, zero when absent). */
export type LeafStep = { grant: Delegation; target: Address; callData: Hex; value?: bigint | undefined };

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

/** One call a venue returned for a swap, as the swap service checked it (approve…, the router call). */
export type VenueCall = { to: Address; data: Hex; value: bigint };

/** One exactly pinned call: a leaf may make this call and nothing else (ExactExecution). */
export type PinnedCall = { target: Address; value: bigint; callData: Hex };

/**
 * A swap as leaves, in redeem order: the approvals (each pinned exactly: `tokenIn.approve(spender, amountIn)`, and
 * Uniswap's `Permit2.approve(tokenIn, router, amountIn, expiration)` passed through), the venue's own call (pinned
 * exactly: target, value and calldata, with the balance-change guarantees), then `tokenIn.approve(spender, 0)` for
 * every spender, so no allowance outlives the swap (the residual-allowance gap, 13-stage2-lead-requests "budget").
 */
export type SwapLeafPlan = { approvals: PinnedCall[]; swap: PinnedCall; resets: PinnedCall[] };

const ERC20_APPROVALS = parseAbi(["function approve(address spender, uint256 amount)", "function increaseAllowance(address spender, uint256 increment)"]);
const PERMIT2_APPROVE = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]);

export class LeafPlanRefused extends Error {}

/**
 * The leaf plan for a venue's checked calls (the swap service's `prepare`, already held to the venue's own rules).
 * Whatever approval the venue asked for (approve, increaseAllowance, or none when it relied on an older allowance),
 * the plan approves exactly `amountIn` to the same spender, and takes it back to zero after the swap. A call it does
 * not recognise is refused: the swap then goes the ordinary way, with the person's confirm.
 */
export function planSwapLeaves(calls: readonly VenueCall[], swap: { tokenIn: Address; amountIn: bigint; permit2: Address }): SwapLeafPlan {
  const main = calls[calls.length - 1];
  if (!main) throw new LeafPlanRefused("no calls");
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const spenders: Address[] = [];
  const permits: PinnedCall[] = [];
  for (const call of calls.slice(0, -1)) {
    if (call.value !== NO_VALUE) throw new LeafPlanRefused("an approval that carries value");
    if (same(call.to, swap.tokenIn)) {
      let decoded;
      try {
        decoded = decodeFunctionData({ abi: ERC20_APPROVALS, data: call.data });
      } catch {
        throw new LeafPlanRefused("a call before the swap that is not an approval");
      }
      const spender = getAddress(decoded.args[0]);
      if (!spenders.some((known) => same(known, spender))) spenders.push(spender);
      continue;
    }
    if (same(call.to, swap.permit2)) {
      let decoded;
      try {
        decoded = decodeFunctionData({ abi: PERMIT2_APPROVE, data: call.data });
      } catch {
        throw new LeafPlanRefused("a Permit2 call that is not its approve");
      }
      const [token, spender, amount] = decoded.args;
      if (!same(token, swap.tokenIn) || !same(spender, main.to) || amount !== swap.amountIn) throw new LeafPlanRefused("a Permit2 approval for something else");
      permits.push({ target: getAddress(call.to), value: NO_VALUE, callData: call.data });
      continue;
    }
    throw new LeafPlanRefused("a call before the swap to another contract");
  }
  // No approval asked for (an allowance set earlier, or USDC paid as Arc's native coin): an ERC-20 swap still gets its
  // own exact approval to the venue it calls, so the allowance it uses is this swap's and ends with it.
  if (spenders.length === 0 && main.value === NO_VALUE) spenders.push(getAddress(main.to));
  const approve = (spender: Address, amount: bigint): PinnedCall => ({ target: swap.tokenIn, value: NO_VALUE, callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
  return {
    approvals: [...spenders.map((spender) => approve(spender, swap.amountIn)), ...permits],
    swap: { target: getAddress(main.to), value: main.value, callData: main.data },
    resets: spenders.map((spender) => approve(spender, NO_VALUE)),
  };
}

/** The plan for a venue whose router is also its spender and whose calldata is known: approve, call, reset. */
export function simpleSwapPlan(tokenIn: Address, router: Address, amountIn: bigint, routerCalldata: Hex): SwapLeafPlan {
  return planSwapLeaves([approveCall(tokenIn, router, amountIn), { to: router, data: routerCalldata, value: NO_VALUE }], { tokenIn, amountIn, permit2: router });
}

const approveCall = (token: Address, spender: Address, amount: bigint): VenueCall => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value: NO_VALUE });

export type SwapLeafTerms = LeafCommon & {
  tokenIn: Address;
  tokenOut: Address;
  /** Base units of tokenIn: the approval, and the most the wallet's tokenIn may fall. */
  amountIn: bigint;
  /** Base units of tokenOut the wallet's balance must rise by, from a quote the phone fetched and checked. */
  minOut: bigint;
  plan: SwapLeafPlan;
  /** One random salt per leaf (approvals + swap + resets); fresh ones when absent. */
  salts?: readonly Hex[] | undefined;
};

export type SwapLeaves = { leaves: Delegation[]; steps: LeafStep[]; expiresAt: number };

/**
 * A swap's one-shot leaves, unsigned (sign each with `grantTypedData`): every call pinned exactly (ExactExecution), so
 * a leaked ops key can change nothing about any of them (not the router's calldata either: the residual-allowance
 * gap), and the venue's call additionally must leave at least `minOut` more tokenOut and at most `amountIn` less
 * tokenIn in the wallet (ERC20BalanceChange), which is what the phone can verify without reading venue calldata.
 */
export function buildSwapLeaves(terms: SwapLeafTerms): SwapLeaves {
  const environment = delegationEnvironment(terms.network);
  const { plan } = terms;
  const count = plan.approvals.length + 1 + plan.resets.length;
  const salts = terms.salts ?? Array.from({ length: count }, () => randomSalt());
  if (salts.length !== count) throw new Error(`a swap of ${count} leaves needs ${count} salts`);
  const pinned = (call: PinnedCall) => createCaveatBuilder(environment).addCaveat("exactExecution", { execution: createExecution(call) });
  const builders = [
    ...plan.approvals.map(pinned),
    pinned(plan.swap)
      .addCaveat("erc20BalanceChange", { tokenAddress: terms.tokenOut, recipient: terms.wallet, balance: terms.minOut, changeType: BalanceChangeType.Increase })
      .addCaveat("erc20BalanceChange", { tokenAddress: terms.tokenIn, recipient: terms.wallet, balance: terms.amountIn, changeType: BalanceChangeType.Decrease }),
    ...plan.resets.map(pinned),
  ];
  const calls = [...plan.approvals, plan.swap, ...plan.resets];
  const leaves = builders.map((builder, index) => leaf(terms, leafCommon(builder, terms).build(), salts[index]!));
  return { leaves, steps: leaves.map((grant, index) => ({ grant, target: calls[index]!.target, callData: calls[index]!.callData, value: calls[index]!.value })), expiresAt: terms.now + LEAF_TTL_SECONDS };
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

// ── The away pack (signed with the budget, one approval) ─────────────────────────────────────────────────────────

/** What one away-pack grant is for; the phone checks each against its own expectation (@kawase/wallet). */
export type AwayPurpose = "contact_send" | "vault_approve" | "vault_deposit" | "vault_withdraw" | "bridge_allowance" | "bridge_burn";

export type AwayGrant = {
  purpose: AwayPurpose;
  grant: Delegation;
  /** The saved contact's address (contact_send), the vault (vault_*), or the CCTP domain (bridge_*). */
  subject: string;
};

export type AwayPackTerms = {
  network: NetworkContext;
  wallet: Address;
  ops: Address;
  /** The wallet's current NonceEnforcer nonce: every grant in the pack dies with the kill-switch. */
  nonce: bigint;
  /** Unix seconds: the pack starts now and ends at `expiresAt`. */
  now: number;
  expiresAt: number;
  usdc: Address;
  /** Saved contacts (one transfer grant each, USDC only, at most `perContactPerWeek` a week). */
  contacts: readonly Address[];
  perContactPerWeek: bigint;
  /** Vaults in the budget: approve, deposit and withdraw, the receiver and owner pinned to the wallet. */
  vaults: readonly Address[];
  /** App Kit's bridge on Arc and the CCTP domains a move to the wallet's own address may go to. */
  bridge?: { contract: Address; domains: readonly number[] } | undefined;
};

const WEEK_SECONDS = 604_800;

/**
 * The away pack (D38): the standing grants that let Kawase act inside the budget while the phone is closed, all
 * signed in the same approval as the budget, all bound to the kill-switch nonce, all redeemable only by ops:
 *  - per saved contact: USDC `transfer` only to that contact, capped per week (replaces the any-recipient allowance);
 *  - per vault: `approve(vault)`, `deposit(…, wallet)`, `withdraw(…, wallet, wallet)`;
 *  - per destination: CCTP through App Kit's bridge, the mint pinned to the wallet's own address.
 * A leaked ops key can then only pay people the person saved (capped), or move the person's money to themselves.
 */
export function buildAwayPack(terms: AwayPackTerms): AwayGrant[] {
  const common = { network: terms.network, wallet: terms.wallet, redeemer: terms.ops, nonce: terms.nonce, expiresAt: terms.expiresAt };
  const sends = buildContactSendGrants({
    ...common,
    token: terms.usdc,
    amountPerPeriod: terms.perContactPerWeek,
    periodSeconds: WEEK_SECONDS,
    startsAt: terms.now,
    contacts: terms.contacts.map((address) => ({ address, salt: randomSalt() })),
  }).map((grant, index): AwayGrant => ({ purpose: "contact_send", grant, subject: getAddress(terms.contacts[index]!) }));
  const vaults = terms.vaults.flatMap((vault): AwayGrant[] => {
    const built = buildSaveGrants({ ...common, usdc: terms.usdc, vault, salts: { approve: randomSalt(), deposit: randomSalt(), withdraw: randomSalt() } });
    const subject = getAddress(vault);
    return [
      { purpose: "vault_approve", grant: built.approve, subject },
      { purpose: "vault_deposit", grant: built.deposit, subject },
      { purpose: "vault_withdraw", grant: built.withdraw, subject },
    ];
  });
  const bridge = terms.bridge;
  const moves = bridge
    ? bridge.domains.flatMap((domain): AwayGrant[] => {
        const built = buildBridgeGrants({ ...common, usdc: terms.usdc, bridge: bridge.contract, domain, salts: { allowance: randomSalt(), burn: randomSalt() } });
        return [
          { purpose: "bridge_allowance", grant: built.allowance, subject: String(domain) },
          { purpose: "bridge_burn", grant: built.burn, subject: String(domain) },
        ];
      })
    : [];
  return [...sends, ...vaults, ...moves];
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
