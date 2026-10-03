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
  /**
   * A batch's legs move the same thin pools one after another (a WETH short's four legs needed ~200 bps on 10-02);
   * when the simulation shows a leg short of its minimum, the order is planned again at this (once) and shown first.
   */
  maxSlippageBps: 400,
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

/**
 * Earn and borrow on Aave V4 directly (earn-borrow.md): supply through the Main Spoke by reserve id (not the shallow
 * ERC-4626 wrapper, G22), and borrow against any reserve that counts as collateral. Health in basis points of 1.0.
 */
/**
 * Margin protection (trade.md "Long / short" → take-profit, stop-loss, alerts): closes Kawase runs for the person
 * under grants signed once, through Uniswap v3 on Arc (its router's recipient can be pinned to the wallet; addresses
 * from Uniswap's sdk-core ARC_ADDRESSES, pools read live 10-02: cirBTC/USDC 0.01% deep, EURC/USDC 0.05%, WETH/USDC
 * 0.3% thin), and the account-health alerts both margin and borrowing share.
 */
export const MARGIN_PROTECTION = {
  uniswap: {
    factory: "0xf0db7b58379503491d857db50ac9ece64c653918",
    router: "0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77",
    quoter: "0x7dfd4f31be6814d2906bde155c3e1b146eac1468",
  },
  feeTiers: [100, 500, 3000, 10000],
  /** A take-profit closes only when the executable price is within this of the oracle (and still past the target). */
  takeProfitSlippageBps: 100,
  /** A stop-loss accepts more, since waiting costs more; worse than this and Kawase alerts instead of selling. */
  stopLossSlippageBps: 300,
  /**
   * How long a position's grants live once signed: the horizon brokers give a good-'til-cancelled order. After it the
   * position page asks again (they are dead on chain by then).
   */
  grantDays: 90,
  /**
   * The grants let a close move at most this share of the position as signed (collateral to the router, debt to the
   * Spoke): room for interest and the repay buffer, not for a bigger position (adding to it asks again).
   */
  capHeadroomBps: 12_500,
  tickMs: 30_000,
  healthTickMs: 60_000,
  /** Account health below these is told: a warning, then danger (liquidation starts at 1). */
  warnHealthBps: 15_000,
  dangerHealthBps: 12_000,
  /** Targets offered on the position page, as steps from the price now: a take-profit past it, a stop-loss before it. */
  takeProfitSteps: [0.1, 0.25],
  stopLossSteps: [0.05, 0.1],
} as const;

/** Cross-chain moves of any asset (routes.md): slippage asked of aggregators, and room kept for gas on another chain. */
export const CROSSCHAIN = {
  /** USDC and other stables. */
  stableSlippageBps: 50,
  /** Anything with a swap in it (WETH, cirBTC, a meme). */
  volatileSlippageBps: 100,
  /** A move in that starts with a transaction on another chain keeps this share over the quoted gas. */
  sourceGasHeadroomPercent: 150,
  /** Gas a source-chain bridge transaction is assumed to take when the chain will not estimate it. */
  sourceGasFallback: 300_000n,
  /** Gas the Arc batch is drafted at, per provider (an aggregator swaps inside its call), and what a swap first adds. */
  batchGas: { cctp: 400_000n, across: 400_000n, relay: 400_000n, lifi: 1_000_000n, debridge: 800_000n },
  convertGas: 700_000n,
} as const;

export const LEND = {
  /** A borrow that would leave the account below this is refused; between it and `warnHealthBps` it warns. */
  minBorrowHealthBps: 12_500,
  warnHealthBps: 15_000,
  /** A full repay approves this much over the debt read (interest accrues until the block). */
  repayBufferBps: 20,
  gasEstimate: 600_000n,
  /** Yield options list at most this many sources; LP opportunities are shown as advanced, read-only. */
  maxOptions: 6,
  merklApi: "https://api.merkl.xyz/v4/opportunities",
} as const;

/**
 * Buy with Apple Pay / Google Pay / debit through Circle's Onramp (money-in.md). The widget runs top level in the
 * system browser sheet (Apple Pay is restricted in WebViews; the kit says omit `referrerDomain` then). Mainnet uses
 * production with the LIVE key; testnet uses Circle's Onramp sandbox with the TEST key (docs.arc.io "Onramp hosting
 * requirements": onramp-sandbox.arc.io + api-test.circle.com; a sandbox session minted live 2026-10-02).
 */
export const ONRAMP = {
  sandbox: { apiBaseUrl: "https://api-test.circle.com", widgetBaseUrl: "https://onramp-sandbox.arc.io" },
  /** What the provider delivers on Arc (a protocol fact); any other token is bought with what arrives. */
  deliverable: ["USDC", "EURC"],
  chain: "arc",
  /** Circle's sessions live 30 minutes; an order waits this long for its money before it closes as not completed. */
  orderTtlMs: 2 * 60 * 60 * 1000,
  /** A delivery matches an order when it is at least this share of the fiat asked for (fees) and at most the max. */
  matchShareMinBps: 8_000,
  matchShareMaxBps: 10_500,
  /** How often open orders are matched against what the watcher saw arrive. */
  reconcileMs: 10_000,
  /** The amount suggested when the person did not say one. */
  defaultAmount: "20",
} as const;
