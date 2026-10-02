// Money rails (B1): earn liquidity, bridge routes, margin, onramp. Product constants only; protocol addresses live
// in @kawase/networks and live facts are read at run time.

/**
 * A yield source is ranked by what it can pay out now, not by its yield alone (gaps.md G1: on 2026-10-02 Galaxy and
 * Keyrock USDC held $90M / $75M with $0 / $392 withdrawable). Below `stuckBelowUsd` withdrawable it is "stuck":
 * hidden from deposits and never chosen for one. Below `lowShare` of its deposits it is "low": shown with a warning,
 * ranked after every liquid source.
 */
export const EARN_LIQUIDITY = { stuckBelowUsd: 1_000, lowShare: 0.1 } as const;
