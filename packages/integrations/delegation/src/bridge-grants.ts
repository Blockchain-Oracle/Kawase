// Bridge rules (Stage 8b): Kawase may move the person's USDC from Arc to the person's own address on one chain,
// through Circle CCTP with Circle's forwarder, and nowhere else. Two grants, redeemable only by the ops wallet until
// they end:
//  - allowance: `usdc.increaseAllowance(bridge, …)` or `usdc.approve(bridge, …)` — the spender pinned to App Kit's
//    bridge contract;
//  - burn: `bridge.bridgeWithPreapprovalAndHook(BridgeParams, hook)` with, pinned in the calldata: no developer fee,
//    the mint to the wallet's own address, any caller on the destination, USDC as the token, the destination's CCTP
//    domain, and exactly the forwarder's hook ("cctp-forward"). `BridgeParams` is a static struct, so each field
//    sits at a fixed offset (checked against a captured App Kit call on 2026-10-01).
// The amount is free (it is the person's own money going to their own address). The forwarder's fee cap `maxFee`
// cannot be bounded by "≤" in a caveat, so its top 29 bytes are pinned to zero: no bridge under these grants can
// let the route take more than 2^24 − 1 base units (16.777215 USDC); Kawase checks the quoted fee on every run.
import { CaveatType, ScopeType, createDelegation, type Delegation } from "@metamask/smart-accounts-kit";
import { concat, pad, stringToHex, toHex, type Address, type Hex } from "viem";
import type { NetworkContext } from "@kawase/networks";

import { delegationEnvironment } from "./environment";

const SELECTOR_BYTES = 4;
const WORD = 32;
const at = (word: number) => SELECTOR_BYTES + word * WORD;
/** `BridgeParams` words: 0 amount, 1 maxFee, 2 fee, 3 mintRecipient, 4 destinationCaller, 5 burnToken, 6 feeRecipient, 7 destinationDomain, 8 minFinalityThreshold; then the hook's offset (9), length (10) and bytes (11). */
const WORDS = { maxFee: 1, fee: 2, domain: 7, hookOffset: 9 } as const;
const ZERO_WORD = pad("0x", { size: WORD });
const NO_VALUE = 0n;
/** Free low bytes of `maxFee`: the rest of the word must be zero. */
const MAX_FEE_FREE_BYTES = 3;
const BYTE_BITS = 8n;
const TWO = 2n;
const ONE = 1n;
export const BRIDGE_GRANT_MAX_FEE = TWO ** (BigInt(MAX_FEE_FREE_BYTES) * BYTE_BITS) - ONE;
/** The hook's position in calldata: right after the nine-word struct (0x140 = 10 words from the arguments' start). */
const HOOK_OFFSET = 0x140;
const FORWARD_HOOK = "cctp-forward";

const ALLOWANCE_SIGNATURES = ["increaseAllowance(address,uint256)", "approve(address,uint256)"];
const BURN_SIGNATURE = "bridgeWithPreapprovalAndHook((uint256,uint256,uint256,bytes32,bytes32,address,address,uint32,uint32),bytes)";

export type BridgeGrantTerms = {
  network: NetworkContext;
  /** The person's wallet: the delegator, and the only recipient on the destination. */
  wallet: Address;
  redeemer: Address;
  usdc: Address;
  /** App Kit's bridge contract on Arc. */
  bridge: Address;
  /** The destination's CCTP domain. */
  domain: number;
  expiresAt: number;
  salts: { allowance: Hex; burn: Hex };
};

export type BridgeGrants = { allowance: Delegation; burn: Delegation };
export type BridgePurpose = keyof BridgeGrants;
export const BRIDGE_PURPOSES: readonly BridgePurpose[] = ["allowance", "burn"];

export function buildBridgeGrants(terms: BridgeGrantTerms): BridgeGrants {
  const environment = delegationEnvironment(terms.network);
  const allowance = createDelegation({
    environment,
    from: terms.wallet,
    to: terms.redeemer,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [terms.usdc],
      selectors: ALLOWANCE_SIGNATURES,
      allowedCalldata: [{ startIndex: at(0), value: pad(terms.bridge, { size: WORD }) }],
      valueLte: { maxValue: NO_VALUE },
    },
    caveats: [
      { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: terms.expiresAt },
      { type: CaveatType.Redeemer, redeemers: [terms.redeemer] },
    ],
    salt: terms.salts.allowance,
  });
  const burn = createDelegation({
    environment,
    from: terms.wallet,
    to: terms.redeemer,
    scope: {
      type: ScopeType.FunctionCall,
      targets: [terms.bridge],
      selectors: [BURN_SIGNATURE],
      allowedCalldata: [
        // maxFee (word 1): only its low three bytes may be set.
        { startIndex: at(WORDS.maxFee), value: pad("0x", { size: WORD - MAX_FEE_FREE_BYTES }) },
        // fee = 0, mintRecipient = the wallet, destinationCaller = anyone, burnToken = USDC (words 2–5).
        { startIndex: at(WORDS.fee), value: concat([ZERO_WORD, pad(terms.wallet, { size: WORD }), ZERO_WORD, pad(terms.usdc, { size: WORD })]) },
        // destinationDomain (word 7).
        { startIndex: at(WORDS.domain), value: pad(toHex(terms.domain), { size: WORD }) },
        // The hook: its offset, its length (one word) and "cctp-forward" (words 9–11).
        { startIndex: at(WORDS.hookOffset), value: concat([pad(toHex(HOOK_OFFSET), { size: WORD }), pad(toHex(WORD), { size: WORD }), stringToHex(FORWARD_HOOK, { size: WORD })]) },
      ],
      valueLte: { maxValue: NO_VALUE },
    },
    caveats: [
      { type: CaveatType.Timestamp, afterThreshold: 0, beforeThreshold: terms.expiresAt },
      { type: CaveatType.Redeemer, redeemers: [terms.redeemer] },
    ],
    salt: terms.salts.burn,
  });
  return { allowance, burn };
}
