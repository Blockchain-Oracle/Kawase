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
  /** A first payment well above this offers sending this much first ("send a test amount first?", D-cooldown). */
  testAmount: bigint;
  maxSlippageStableBps: number;
  maxSlippageOtherBps: number;
  /**
   * The price-impact rule (D12 token rules, "max price impact 5%"): a swap quoted this far below the market rate is
   * braked — it warns and needs the person's explicit override (cards/automate-safety.md "Brake"); three times this is
   * refused outright (ARCHITECTURE §8 `POLICY_PRICE_IMPACT`).
   */
  maxRateGapBps: number;
  /** Above this it carries a warning. */
  warnRateGapBps: number;
};

/**
 * Consumer defaults per network. Users can change them (loosening = step-up + wallet signature).
 * Source: Kawase's limits research. These are judgment calls based on precedents (Circle Agent Wallet caps, Bankr 24 h cooldown, App Kit 300 bps), not benchmarks.
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
    testAmount: usdc("1"),
    // The "at least" floor a person is shown; the route itself is built at half of it (SWAP_ROUTE_SLIPPAGE_DIVISOR).
    maxSlippageStableBps: 100,
    maxSlippageOtherBps: 300,
    maxRateGapBps: 500,
    warnRateGapBps: 100,
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
    testAmount: usdc("0.01"),
    // Circle's swap service finds no route on Arc testnet for USDC→EURC below 1% slippage ("No route available",
    // 331001, 2026-10-01), and the route is built at half the floor (SWAP_ROUTE_SLIPPAGE_DIVISOR), so the floor is 2%.
    maxSlippageStableBps: 200,
    maxSlippageOtherBps: 300,
    // Testnet pools are thin and drift far from market prices (USDC→EURC quoted ~7% under Circle's rates on
    // 2026-10-01); the gap is still shown, but only an extreme one refuses.
    maxRateGapBps: 1500,
    warnRateGapBps: 100,
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

/** Days of the month offered for a monthly automation (1–28, so every month has them). */
export const MONTHLY_RUN_DAYS = [1, 15, 28] as const;
