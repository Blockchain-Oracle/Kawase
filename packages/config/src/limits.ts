import type { NetworkId } from "@kawase/networks";
import { usdc, SECONDS_PER_DAY } from "./units";

export type LimitDefaults = {
  perTransaction: bigint;
  daily: bigint;
  weekly: bigint;
  monthly: bigint;
  perRecipientWeekly: bigint;
  newRecipientCooldownS: number;
  newRecipientMaxDuringCooldown: bigint;
  /** Sends above this always need an explicit approval, even in autonomous mode. */
  approvalThreshold: bigint;
  firstTimeRecipientApprovalThreshold: bigint;
  maxSlippageStableBps: number;
  maxSlippageOtherBps: number;
};

/**
 * Consumer defaults per network. Users can change them (loosening = step-up + wallet signature).
 * Source: context/08-product-research/07-automations-contacts-safety/limits-and-safety.md §1. The research labels these
 * as judgment calls based on precedents (Circle Agent Wallet caps, Bankr 24 h cooldown, App Kit 300 bps), not benchmarks.
 * Testnet values are looser because no real money is at risk [INFERENCE].
 */
export const DEFAULT_LIMITS = {
  mainnet: {
    perTransaction: usdc("250"),
    daily: usdc("500"),
    weekly: usdc("1500"),
    monthly: usdc("4000"),
    perRecipientWeekly: usdc("200"),
    newRecipientCooldownS: SECONDS_PER_DAY,
    newRecipientMaxDuringCooldown: usdc("50"),
    approvalThreshold: usdc("100"),
    firstTimeRecipientApprovalThreshold: usdc("20"),
    maxSlippageStableBps: 50,
    maxSlippageOtherBps: 300,
  },
  testnet: {
    perTransaction: usdc("2500"),
    daily: usdc("5000"),
    weekly: usdc("15000"),
    monthly: usdc("40000"),
    perRecipientWeekly: usdc("2000"),
    newRecipientCooldownS: 0,
    newRecipientMaxDuringCooldown: usdc("500"),
    approvalThreshold: usdc("1000"),
    firstTimeRecipientApprovalThreshold: usdc("200"),
    maxSlippageStableBps: 50,
    maxSlippageOtherBps: 300,
  },
} as const satisfies Record<NetworkId, LimitDefaults>;

/**
 * A changed contact address waits this long before money can go to it, and the contact is frozen meanwhile (I4:
 * "vendor master change control"; Bankr's 24 h cooldown, `07-automations-contacts-safety/limits-and-safety.md`).
 * The first address of a new contact is payable at once: the first-time warning covers it.
 */
export const CONTACT_ADDRESS_CHANGE_COOLDOWN_S = SECONDS_PER_DAY;
/** An address whose first and last characters match a saved contact's this far is flagged as a lookalike (I5). */
export const LOOKALIKE_PREFIX_CHARS = 4;
export const LOOKALIKE_SUFFIX_CHARS = 4;
