import { SECONDS_PER_DAY, usdc } from "./units";

/**
 * The in-app test-money faucet (S2; testnet only). The drip is Circle's testnet faucet sending to the user's own
 * address; these are Kawase's rules around it. Circle decides the amounts it sends — the figures here are what
 * the app tells the person to expect (20 USDC and 20 EURC per drip on ARC-TESTNET, observed 2026-10-01).
 */
export const FAUCET = {
  /** One successful claim per user per this many seconds. */
  claimEveryS: SECONDS_PER_DAY,
  expected: { USDC: usdc("20"), EURC: usdc("20") },
  /** Where a person can ask Circle directly when the in-app drip is refused. */
  circleFaucetUrl: "https://faucet.circle.com",
} as const;
