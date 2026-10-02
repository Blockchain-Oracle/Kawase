// Money rails (B1): earn liquidity, bridge routes, margin, onramp. Product constants only; protocol addresses live
// in @kawase/networks and live facts are read at run time.

/**
 * A yield source is ranked by what it can pay out now, not by its yield alone (gaps.md G1: on 2026-10-02 Galaxy and
 * Keyrock USDC held $90M / $75M with $0 / $392 withdrawable). Below `stuckBelowUsd` withdrawable it is "stuck":
 * hidden from deposits and never chosen for one. Below `lowShare` of its deposits it is "low": shown with a warning,
 * ranked after every liquid source.
 */
export const EARN_LIQUIDITY = { stuckBelowUsd: 1_000, lowShare: 0.1 } as const;

/**
 * Kawase Margin (long/short through Aave V4 on Arc; trade.md, X23). Leverage = notional ÷ margin. Health is in
 * basis points of 1.0 (11_000 = 1.10).
 * - The ticket's cap comes from the live collateral factor: long ≤ H ÷ (H − CF), short ≤ CF ÷ (H − CF), with H the
 *   opening floor below (e.g. cirBTC long 3.4×, WETH long 4.0×, any short against USDC 2.4× at 10-02 factors).
 * - Inside the batch each loop borrows only down to `loopHealthBps`, so a price tick between build and block cannot
 *   make a step fail; the account still opens at or above `minOpenHealthBps`.
 */
export const MARGIN = {
  minOpenHealthBps: 11_000,
  loopHealthBps: 10_200,
  maxLoops: 6,
  maxLeverage: 5,
  leverageStep: 0.5,
  /** Shown and quoted; the router calldata is built tighter (build re-prices). */
  slippageBps: 50,
  buildSlippageBps: 25,
  /** A loop step worth less than this (USD, 8 decimals = 1 cent) is not worth its gas. */
  dustValue: 1_000_000n,
  /** Interest accrues between the read and the block: a full repay approves this much over the debt read. */
  repayBufferBps: 20,
  /** At approval the fresh plan may give at most this much less collateral than the version shown, else a new version. */
  driftBps: 75,
  /** Gas per loop (borrow + approve + swap + approve + supply) and for the rest of the batch. */
  gasPerLoop: 900_000n,
  gasBase: 500_000n,
  /** Health pushes (card: "Health falls → push (1.5, 1.2)"). */
  warnHealthBps: [15_000, 12_000],
  /** Presets for the margin hero (USD). */
  presets: [10, 50, 100],
  /** Close a quarter, half, three quarters or all of a position (surfaces.md "Close 25/50/75/All"). */
  closeShares: [0.25, 0.5, 0.75, 1],
  /** The ticket opens at this leverage when the person did not say one. */
  defaultLeverage: 2,
} as const;

/** What people call a market, mapped to the symbol the venue lists (naming data, not flow logic; R1). */
export const MARGIN_MARKET_ALIASES = {
  btc: "cirBTC",
  bitcoin: "cirBTC",
  eth: "WETH",
  ether: "WETH",
  ethereum: "WETH",
  eur: "EURC",
  euro: "EURC",
  euros: "EURC",
} as const;
