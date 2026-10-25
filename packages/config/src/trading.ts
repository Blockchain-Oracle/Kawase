// Swaps (Stage 6). Gas numbers come from the first one-transaction swap on Arc testnet (approve + swap batched
// through the wallet's EIP-7702 code, 2026-10-01): 551,419 gas used; App Kit's own gasLimit hint was 630,000.

/** Gas for an approve + swap batch when an estimate is not possible yet (the calls are only built at approval). */
export const SWAP_BATCH_GAS_ESTIMATE = 700_000n;
/** A swap quote older than this is fetched again before it is shown as current. */
export const SWAP_QUOTE_TTL_S = 30;
/** A token page's quick buys, in US dollars of USDC: one tap to the race and the slide (Abu 10-25, FOMO-style buying). */
export const QUICK_BUY_USD = [1, 5, 10, 25] as const;
/** Who quotes and routes swaps today (shown on the confirm card). */
export const SWAP_PROVIDER_LABEL = "Circle App Kit";

/**
 * The swap route is built with the slippage floor divided by this the person was shown ("at least X"). The other
 * half absorbs the price moving between the quote and the signature, so a small tick does not force a new version;
 * a bigger move does, because the calls' own minimum then falls below what was shown.
 */
export const SWAP_ROUTE_SLIPPAGE_DIVISOR = 2;

/** Gas for an approve + burn batch when an estimate is not possible yet (measured 180,015 on Arc testnet, 2026-10-01). */
export const BRIDGE_BATCH_GAS_ESTIMATE = 400_000n;
/** Who moves bridged USDC today (shown on the confirm card). */
export const BRIDGE_PROVIDER_LABEL = "Circle CCTP · App Kit";
/**
 * The fee cap a bridge shows and enforces is the route's quoted fee plus this much headroom: Circle's forwarder fee
 * drifts by a few millionths between quotes (0.054614 → 0.054639 USDC within an hour, 2026-10-01), which must not
 * turn every approval into a new version. What arrives is still the amount less the actual fee.
 */
export const BRIDGE_FEE_HEADROOM_PERCENT = 120n;

/** Gas for an approve + vault deposit or withdrawal batch when an estimate is not possible (measured 424,936 on Arc testnet). */
export const EARN_BATCH_GAS_ESTIMATE = 600_000n;
/** A deposit must return, and a withdrawal must pay, at least this share of the vault's own preview (App Kit builds at 99.5%). */
export const EARN_FLOOR_BPS = 9_900n;
/** A withdrawal may burn at most this share of the vault's preview in shares. */
export const EARN_SHARES_CEILING_BPS = 10_100n;

/** Auto-save moves nothing smaller than this (USDC base units, 1 USDC): a smaller move is not worth its transaction. */
export const AUTO_SAVE_MIN_MOVE = 1_000_000n;
/** What Auto-save keeps ready in the wallet when the person did not say (USDC base units, 10 USDC); the card shows it. */
export const AUTO_SAVE_DEFAULT_KEEP = 10_000_000n;
/** An Auto-save move's gas, for the run's fee note (the ops wallet pays it). */
export const AUTO_SAVE_GAS_ESTIMATE = 450_000n;

// ── Any-pair swaps (the swap ticket; plan/product/cards/trade.md) ───────────────────────────────────────────────

/** The venues every swap asks for a fresh executable quote (R3), and the names shown on the card. */
export const SWAP_VENUE_LABELS = { kyberswap: "KyberSwap", app_kit: "Circle App Kit", lifi: "LI.FI" } as const;
export type SwapVenueId = keyof typeof SWAP_VENUE_LABELS;
/** LI.FI's diamond on Arc mainnet: the only target and spender a LI.FI swap may name (live quote, 2026-10-02). */
export const LIFI_DIAMOND_ARC = "0xA4072583658Fae592A3506A42431cb6316a8d40b";
/** A venue that has not answered by then is listed as "no answer" and the others decide. */
export const SWAP_VENUE_TIMEOUT_MS = 7_000;
/** Circle App Kit retries "no route yet" itself (up to four tries, 2026-10-01), so it gets longer. */
export const APP_KIT_QUOTE_TIMEOUT_MS = 30_000;
/** In a route race App Kit's row keeps checking this long (production quotes took over 4 s on testnet, 2026-10-14). */
export const APP_KIT_RACE_TIMEOUT_MS = 12_000;
/** Gas for an approve + aggregator swap batch when an estimate is not possible yet. */
export const AGGREGATOR_BATCH_GAS_ESTIMATE = 900_000n;

/**
 * Token rules (D12 defaults): what any buy of a token Kawase does not vouch for (unverified or lookalike) may be,
 * from a screen, chat, voice or an automation. Impersonators and honeypots are never bought.
 */
export const TOKEN_RULES = {
  unverifiedPerTradeUsd: 50,
  unverifiedPerDayUsd: 200,
  /** Price impact (vs. the market price) above which a swap of a non-stable token is refused. */
  maxPriceImpactBps: 500,
  /** Above this it carries a warning. */
  warnPriceImpactBps: 200,
} as const;

/** The token rules screen's steps (D12): what each rule can be set to. Defaults are TOKEN_RULES. */
export const TOKEN_RULE_CHOICES = {
  unverifiedPerTradeUsd: [0, 25, 50, 100, 250, 500],
  unverifiedPerDayUsd: [0, 100, 200, 500, 1_000, 2_500],
  maxPriceImpactBps: [100, 300, 500, 1_000, 1_500],
} as const;

/** A loosening of the token rules waits this long for the wallet's signature (seconds). */
export const TOKEN_RULES_CHANGE_TTL_S = 600;
