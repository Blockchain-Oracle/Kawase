// Margin protection (take-profit / stop-loss on Kawase Margin): Kawase may close the person's own Aave V4 position
// while they are away, and do nothing else of consequence. Five grants, signed once (one Face ID), each narrowed by
// its caveats and redeemable only by the ops wallet until they end:
//  - withdraw:      `spoke.withdraw(reserveId, amount, onBehalfOf)` with onBehalfOf pinned to the wallet; the Spoke pays
//                   the caller, which is the wallet itself (a redeem executes from the delegator);
//  - repay:         `spoke.repay(reserveId, amount, onBehalfOf)` with onBehalfOf pinned to the wallet: only its own debt;
//  - approveSpoke:  `token.approve(spender, amount)` on the listed tokens, the spender pinned to the Spoke;
//  - approveRouter: the same, the spender pinned to Uniswap's SwapRouter02;
//  - swap:          `SwapRouter02.exactInputSingle(params)` with params.recipient pinned to the wallet (the struct is
//                   static, so the recipient is the fourth word of the calldata; KyberSwap's nests it in a dynamic
//                   struct no caveat can pin, which is why protection swaps through Uniswap v3).
// With these, a redeem can only take collateral out to the wallet, repay the wallet's own debt and swap the wallet's
// tokens back into the wallet; no native value anywhere. The worst a misused key could do is swap at a poor price.
import { CaveatType, ScopeType, createDelegation, type Delegation } from "@metamask/smart-accounts-kit";
import { pad, slice, toFunctionSelector, type Address, type Hex } from "viem";
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
const word = (address: Address) => pad(address, { size: ABI_WORD_BYTES });
const NO_VALUE = 0n;
/** Argument positions pinned to the wallet or a spender. */
const ON_BEHALF_OF = 2;
const SPENDER = 0;
const SWAP_RECIPIENT = 3;

export type ProtectGrantTerms = {
  network: NetworkContext;
  /** The person's wallet (the delegator, and the only one paid). */
  wallet: Address;
  /** The ops wallet: the only address that may redeem. */
  redeemer: Address;
  spoke: Address;
  /** Uniswap's SwapRouter02 on this chain. */
  router: Address;
  /** The tokens the closes move (the Spoke's reserves). */
  tokens: readonly Address[];
  /** Unix seconds. After this the grants are dead. */
  expiresAt: number;
  salts: Record<ProtectPurpose, Hex>;
};

export const PROTECT_PURPOSES = ["withdraw", "repay", "approveSpoke", "approveRouter", "swap"] as const;
export type ProtectPurpose = (typeof PROTECT_PURPOSES)[number];
export type ProtectGrants = Record<ProtectPurpose, Delegation>;

function grant(terms: ProtectGrantTerms, targets: readonly Address[], signature: string, pins: { position: number; address: Address }[], salt: Hex): Delegation {
  return createDelegation({
    environment: delegationEnvironment(terms.network),
    from: terms.wallet,
    to: terms.redeemer,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [...targets],
      selectors: [signature],
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

export function buildProtectGrants(terms: ProtectGrantTerms): ProtectGrants {
  const self = [{ position: ON_BEHALF_OF, address: terms.wallet }];
  return {
    withdraw: grant(terms, [terms.spoke], WITHDRAW_SIGNATURE, self, terms.salts.withdraw),
    repay: grant(terms, [terms.spoke], REPAY_SIGNATURE, self, terms.salts.repay),
    approveSpoke: grant(terms, terms.tokens, APPROVE_SIGNATURE, [{ position: SPENDER, address: terms.spoke }], terms.salts.approveSpoke),
    approveRouter: grant(terms, terms.tokens, APPROVE_SIGNATURE, [{ position: SPENDER, address: terms.router }], terms.salts.approveRouter),
    swap: grant(terms, [terms.router], SWAP_SIGNATURE, [{ position: SWAP_RECIPIENT, address: terms.wallet }], terms.salts.swap),
  };
}

const SELECTORS = {
  withdraw: toFunctionSelector(WITHDRAW_SIGNATURE),
  repay: toFunctionSelector(REPAY_SIGNATURE),
  approve: toFunctionSelector(APPROVE_SIGNATURE),
  swap: toFunctionSelector(SWAP_SIGNATURE),
};

export class ProtectCallRefused extends Error {
  constructor(readonly call: { to: Address; data: Hex }) {
    super(`no protection grant covers a call to ${call.to} (${slice(call.data, 0, SELECTOR_BYTES)})`);
    this.name = "ProtectCallRefused";
  }
}

/** Which grant covers a call (by target, selector and, for approvals, the spender); undefined when none does. */
export function protectPurposeOf(call: { to: Address; data: Hex; value?: bigint | undefined }, terms: Pick<ProtectGrantTerms, "spoke" | "router" | "tokens">): ProtectPurpose | undefined {
  if ((call.value ?? NO_VALUE) !== NO_VALUE) return undefined;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const selector = slice(call.data, 0, SELECTOR_BYTES);
  if (same(call.to, terms.spoke) && selector === SELECTORS.withdraw) return "withdraw";
  if (same(call.to, terms.spoke) && selector === SELECTORS.repay) return "repay";
  if (same(call.to, terms.router) && selector === SELECTORS.swap) return "swap";
  if (selector === SELECTORS.approve && terms.tokens.some((token) => same(token, call.to))) {
    const spender = slice(call.data, argumentAt(SPENDER), argumentAt(SPENDER + 1));
    if (same(spender, word(terms.spoke))) return "approveSpoke";
    if (same(spender, word(terms.router))) return "approveRouter";
  }
  return undefined;
}

/** The ops wallet's one transaction for a protective close: every call under the grant that covers it, in order. */
export function encodeRedeemProtect(network: NetworkContext, grants: ProtectGrants, terms: Pick<ProtectGrantTerms, "spoke" | "router" | "tokens">, calls: readonly { to: Address; data: Hex; value?: bigint | undefined }[]): ContractCall {
  return encodeRedeemMany(
    network,
    calls.map((call) => {
      const purpose = protectPurposeOf(call, terms);
      if (!purpose) throw new ProtectCallRefused(call);
      return { grant: grants[purpose], target: call.to, callData: call.data };
    }),
  );
}
