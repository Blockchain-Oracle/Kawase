// Margin protection (take-profit / stop-loss on Kawase Margin): Kawase may close one of the person's own Aave V4
// positions while they are away, and do nothing else of consequence. Six grants per position, signed together (one
// Face ID), each narrowed by its caveats and redeemable only by the ops wallet until they end:
//  - withdraw:      `spoke.withdraw(reserveId, amount, onBehalfOf)` on the position's collateral reserve, onBehalfOf the
//                   wallet; the Spoke pays the caller, which is the wallet itself (a redeem executes from the delegator);
//  - repay:         `spoke.repay(reserveId, amount, onBehalfOf)` on the position's debt reserve: only its own debt;
//  - approveRouter: `collateral.approve(SwapRouter02, cap)` for exactly the cap (the collateral with headroom), once;
//  - approveSpoke:  `debt.approve(spoke, cap)` for exactly the cap (the debt with headroom), once;
//  - unapprove:     `approve(anyone, 0)` on those two tokens: it can only take an allowance away;
//  - swap:          `SwapRouter02.exactInputSingle(params)` with tokenIn the collateral, tokenOut the debt asset, the fee
//                   tier and the recipient (the wallet) pinned. The struct is static, so those are its first four words
//                   (KyberSwap nests its recipient in a dynamic struct no caveat can pin, which is why protection swaps
//                   through Uniswap v3), and Uniswap's factory holds one pool per pair and fee: this is that one pool.
// With these, a redeem can only take this position's collateral out to the wallet, repay its own debt, and sell at most
// the cap of the collateral for the debt asset in that one pool, paid to the wallet; no native value anywhere. What no
// caveat can pin is the swap's minimum out (it moves with the price). So the worst a misused ops key could do is sell
// up to the cap, once, at a price it pushed first (a sandwich in that pool), plus whatever allowance the wallet itself
// had already given Uniswap's router for that token: bounded by the position's size, never the rest of the wallet.
import { CaveatType, ScopeType, createDelegation, type Delegation } from "@metamask/smart-accounts-kit";
import { concat, decodeFunctionData, erc20Abi, encodeFunctionData, numberToHex, pad, slice, toFunctionSelector, type Address, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";
import { encodeRedeemMany, type ContractCall } from "./redeem";

const WITHDRAW_SIGNATURE = "withdraw(uint256,uint256,address)";
const REPAY_SIGNATURE = "repay(uint256,uint256,address)";
const APPROVE_SIGNATURE = "approve(address,uint256)";
const SWAP_SIGNATURE = "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))";
const SELECTOR_BYTES = 4;
const ABI_WORD_BYTES = 32;
const argumentAt = (position: number) => SELECTOR_BYTES + position * ABI_WORD_BYTES;
const word = (value: Address | bigint | number) => (typeof value === "string" ? pad(value, { size: ABI_WORD_BYTES }) : numberToHex(value, { size: ABI_WORD_BYTES }));
const NO_VALUE = 0n;
const ZERO = 0n;
/** Argument positions: a Spoke call's reserve and onBehalfOf; an approval's spender and amount; the swap struct's first word. */
const RESERVE = 0;
const ON_BEHALF_OF = 2;
const SPENDER = 0;
const AMOUNT = 1;
const SWAP_TOKEN_IN = 0;
/** Each capped approval can be redeemed once: the close approves once, before its first leg. */
const APPROVALS_PER_GRANT = 1;

/** One side of the position's pair: its Spoke reserve, its token, and the most a close may move of it. */
export type ProtectLeg = { token: Address; reserveId: number; cap: bigint };

/** What the grants are about: one position's pair, its caps, and the one Uniswap pool its close sells in. */
export type ProtectScope = {
  spoke: Address;
  /** Uniswap's SwapRouter02 on this chain. */
  router: Address;
  /** What a close sells (the router may take up to its cap). */
  collateral: ProtectLeg;
  /** What a close buys back and repays (the Spoke may take up to its cap). */
  debt: ProtectLeg;
  /** The Uniswap v3 fee tier of the pool the close sells in. */
  fee: number;
};

export type ProtectGrantTerms = ProtectScope & {
  network: NetworkContext;
  /** The person's wallet (the delegator, and the only one paid). */
  wallet: Address;
  /** The ops wallet: the only address that may redeem. */
  redeemer: Address;
  /** Unix seconds. After this the grants are dead. */
  expiresAt: number;
  salts: Record<ProtectPurpose, Hex>;
};

export const PROTECT_PURPOSES = ["withdraw", "repay", "approveRouter", "approveSpoke", "unapprove", "swap"] as const;
export type ProtectPurpose = (typeof PROTECT_PURPOSES)[number];
export type ProtectGrants = Record<ProtectPurpose, Delegation>;

type Pin = { startIndex: number; value: Hex };

function grant(terms: ProtectGrantTerms, targets: readonly Address[], signature: string, pins: Pin[], salt: Hex, maxCalls?: number): Delegation {
  return createDelegation({
    environment: delegationEnvironment(terms.network),
    from: terms.wallet,
    to: terms.redeemer,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [...targets],
      selectors: [signature],
      allowedCalldata: pins,
      valueLte: { maxValue: NO_VALUE },
    },
    caveats: [
      { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: terms.expiresAt },
      { type: CaveatType.Redeemer, redeemers: [terms.redeemer] },
      ...(maxCalls ? [{ type: CaveatType.LimitedCalls, limit: maxCalls } as const] : []),
    ],
    salt,
  });
}

export function buildProtectGrants(terms: ProtectGrantTerms): ProtectGrants {
  const { collateral, debt } = terms;
  const self = { startIndex: argumentAt(ON_BEHALF_OF), value: word(terms.wallet) };
  const reserve = (leg: ProtectLeg) => ({ startIndex: argumentAt(RESERVE), value: word(BigInt(leg.reserveId)) });
  const exactly = (spender: Address, cap: bigint) => ({ startIndex: argumentAt(SPENDER), value: concat([word(spender), word(cap)]) });
  return {
    withdraw: grant(terms, [terms.spoke], WITHDRAW_SIGNATURE, [reserve(collateral), self], terms.salts.withdraw),
    repay: grant(terms, [terms.spoke], REPAY_SIGNATURE, [reserve(debt), self], terms.salts.repay),
    approveRouter: grant(terms, [collateral.token], APPROVE_SIGNATURE, [exactly(terms.router, collateral.cap)], terms.salts.approveRouter, APPROVALS_PER_GRANT),
    approveSpoke: grant(terms, [debt.token], APPROVE_SIGNATURE, [exactly(terms.spoke, debt.cap)], terms.salts.approveSpoke, APPROVALS_PER_GRANT),
    unapprove: grant(terms, [collateral.token, debt.token], APPROVE_SIGNATURE, [{ startIndex: argumentAt(AMOUNT), value: word(ZERO) }], terms.salts.unapprove),
    // tokenIn, tokenOut, fee, recipient: the struct's first four words, one pin.
    swap: grant(terms, [terms.router], SWAP_SIGNATURE, [{ startIndex: argumentAt(SWAP_TOKEN_IN), value: concat([word(collateral.token), word(debt.token), word(terms.fee), word(terms.wallet)]) }], terms.salts.swap),
  };
}

const SELECTORS = {
  withdraw: toFunctionSelector(WITHDRAW_SIGNATURE),
  repay: toFunctionSelector(REPAY_SIGNATURE),
  approve: toFunctionSelector(APPROVE_SIGNATURE),
  swap: toFunctionSelector(SWAP_SIGNATURE),
};

type Call = { to: Address; data: Hex; value?: bigint | undefined };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class ProtectCallRefused extends Error {
  constructor(readonly call: { to: Address; data: Hex }) {
    super(`no protection grant covers a call to ${call.to} (${slice(call.data, 0, SELECTOR_BYTES)})`);
    this.name = "ProtectCallRefused";
  }
}

/** The close needs more than the grants let the router or the Spoke take (the position grew since they were signed). */
export class ProtectCapExceeded extends Error {
  constructor(
    readonly leg: "collateral" | "debt",
    readonly needed: bigint,
    readonly cap: bigint,
  ) {
    super(`the close needs ${needed} of the ${leg} token; the grants allow ${cap}`);
    this.name = "ProtectCapExceeded";
  }
}

function approval(call: Call): { spender: Address; amount: bigint } | undefined {
  if (slice(call.data, 0, SELECTOR_BYTES) !== SELECTORS.approve) return undefined;
  const { args } = decodeFunctionData({ abi: erc20Abi, data: call.data });
  return { spender: args[0] as Address, amount: args[1] as bigint };
}

/**
 * A close plan's calls in the shape the grants allow: the router and the Spoke approved once, for exactly their caps,
 * before anything else; each leg's own approval dropped (they add up to what the close needs, checked against the
 * caps); both allowances back to zero at the end.
 */
export function shapeProtectiveClose(scope: ProtectScope, calls: readonly Call[]): Call[] {
  let router = ZERO;
  let spoke = ZERO;
  const rest: Call[] = [];
  for (const call of calls) {
    const approved = approval(call);
    if (!approved) {
      rest.push(call);
      continue;
    }
    if (same(call.to, scope.collateral.token) && same(approved.spender, scope.router)) router += approved.amount;
    else if (same(call.to, scope.debt.token) && same(approved.spender, scope.spoke)) spoke += approved.amount;
    else throw new ProtectCallRefused(call);
  }
  if (router > scope.collateral.cap) throw new ProtectCapExceeded("collateral", router, scope.collateral.cap);
  if (spoke > scope.debt.cap) throw new ProtectCapExceeded("debt", spoke, scope.debt.cap);
  const approve = (token: Address, spender: Address, amount: bigint): Call => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }), value: NO_VALUE });
  return [
    approve(scope.collateral.token, scope.router, scope.collateral.cap),
    approve(scope.debt.token, scope.spoke, scope.debt.cap),
    ...rest,
    approve(scope.collateral.token, scope.router, ZERO),
    approve(scope.debt.token, scope.spoke, ZERO),
  ];
}

/** Which grant covers a call (by target, selector and, for approvals, the spender and amount); undefined when none does. */
export function protectPurposeOf(call: Call, scope: ProtectScope): ProtectPurpose | undefined {
  if ((call.value ?? NO_VALUE) !== NO_VALUE) return undefined;
  const selector = slice(call.data, 0, SELECTOR_BYTES);
  if (same(call.to, scope.spoke) && selector === SELECTORS.withdraw) return "withdraw";
  if (same(call.to, scope.spoke) && selector === SELECTORS.repay) return "repay";
  if (same(call.to, scope.router) && selector === SELECTORS.swap) return "swap";
  const approved = approval(call);
  if (!approved) return undefined;
  const onPair = same(call.to, scope.collateral.token) || same(call.to, scope.debt.token);
  if (onPair && approved.amount === ZERO) return "unapprove";
  if (same(call.to, scope.collateral.token) && same(approved.spender, scope.router)) return "approveRouter";
  if (same(call.to, scope.debt.token) && same(approved.spender, scope.spoke)) return "approveSpoke";
  return undefined;
}

/** The ops wallet's one transaction for a protective close: every call under the grant that covers it, in order. */
export function encodeRedeemProtect(network: NetworkContext, grants: ProtectGrants, scope: ProtectScope, calls: readonly Call[]): ContractCall {
  return encodeRedeemMany(
    network,
    calls.map((call) => {
      const purpose = protectPurposeOf(call, scope);
      if (!purpose) throw new ProtectCallRefused(call);
      return { grant: grants[purpose], target: call.to, callData: call.data };
    }),
  );
}
