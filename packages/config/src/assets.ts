// The asset registry, discovery, portfolio and market data (A0, G5; plan/product/cards/trade.md). Every external
// source here is shared by all clients through the api's cache, never called per device.
import { MS_PER_SECOND, SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from "./units";

/** LI.FI's token list for Arc (symbols, logos, USD prices): refreshed this often. */
export const TOKEN_LIST_TTL_MS = 5 * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** Prices and 24 h change: one snapshot per minute serves everyone (GeckoTerminal allows ~10 calls a minute). */
export const PRICE_TTL_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
/** Market lists (trending, new) and a token's market page. */
export const MARKET_TTL_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
/** Charts change slowly at the ranges a phone shows. */
export const CHART_TTL_MS = 2 * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** Market rows' sparklines: 24 hourly closes, refreshed every half hour, one call per warm tick. */
export const SPARK_POINTS = 24;
export const SPARK_TTL_MS = 30 * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** GoPlus safety facts barely move; a day keeps the free tier quiet. */
export const SAFETY_TTL_MS = 6 * SECONDS_PER_HOUR * MS_PER_SECOND;
/** Balances on other chains (LI.FI) per wallet. */
export const OTHER_CHAIN_BALANCES_TTL_MS = 2 * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** Foreign-exchange rates for the display currency. */
export const FX_TTL_MS = SECONDS_PER_HOUR * MS_PER_SECOND;
/** A stale answer may be served this long when the source is down or the budget is spent. */
export const MARKET_STALE_MAX_MS = SECONDS_PER_DAY * MS_PER_SECOND;

/** The api refreshes the shared market cache (Markets lists, listed tokens' prices) this often. */
export const MARKET_WARM_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
/** GeckoTerminal's public API: calls per minute Kawase allows itself (their open limit is 30; charts are its main use). */
export const GECKOTERMINAL_CALLS_PER_MINUTE = 20;
/**
 * DexScreener's open API (live-checked 2026-10-14: Arc is "arc", prices move between calls seconds apart): a token's
 * live price, 5 m / 1 h / 24 h change, liquidity, trades, image and links. 300 calls a minute; up to 30 tokens a call.
 */
export const LIVE_TTL_MS = 5 * MS_PER_SECOND;
export const DEXSCREENER_CALLS_PER_MINUTE = 240;
export const DEXSCREENER_TOKENS_MAX = 30;
/** GeckoTerminal's tokens/multi endpoint takes at most this many addresses per call. */
export const GECKOTERMINAL_MULTI_MAX = 30;
/** An external call that takes longer than this is treated as down (the cache answers instead). */
export const MARKET_FETCH_TIMEOUT_MS = 8 * MS_PER_SECOND;

/**
 * Alchemy's Portfolio API (primary discovery on Arc + the six bridge chains, live-checked 2026-10-02: 0.8–6.4 s per
 * call): one wallet's holdings are cached this long, fetched in at most this many pages of 100.
 */
export const ALCHEMY_HOLDINGS_TTL_MS = 30 * MS_PER_SECOND;
export const ALCHEMY_MAX_PAGES = 5;
/** The API takes at most five networks per address (and two addresses) per request. */
export const ALCHEMY_NETWORKS_PER_ADDRESS = 5;
/** Alchemy's Prices API takes at most this many {network, address} pairs per request. */
export const ALCHEMY_PRICES_MAX = 25;
/**
 * Alchemy answers 429 at once on every API when the plan's monthly compute units are spent ("Monthly capacity limit
 * exceeded", seen 2026-10-03) and also when a second's throughput is exceeded (25 requests/s on the free plan,
 * alchemy.com/pricing). After a monthly-capacity answer Kawase stops asking for this long, and after a throughput
 * answer for the shorter time, so each read goes straight to its fallback instead of paying a doomed round trip.
 */
export const ALCHEMY_QUOTA_PAUSE_MS = 15 * SECONDS_PER_MINUTE * MS_PER_SECOND;
export const ALCHEMY_THROTTLE_PAUSE_MS = 10 * MS_PER_SECOND;

/** Below this many US dollars a holding of an unlisted token counts as dust and is hidden by default. */
export const DUST_USD = 0.01;
/** A holding of a listed token worth less than this is still shown (the person bought it), sorted last. */
export const HOLDING_MIN_DISPLAY_USD = 0;

/** Portfolio snapshots for the balance chart: at most one per person per network this often. */
export const PORTFOLIO_SNAPSHOT_EVERY_MS = 15 * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** The balance chart's longest range. */
export const PORTFOLIO_HISTORY_DAYS = 365;

/**
 * Discovery: the watcher reads every ERC-20 Transfer to a Kawase wallet (real time). Without Alchemy, each new
 * wallet is also read backwards from when it was registered, at most this far (with Alchemy, cold start is one
 * Portfolio call and there is no backfill).
 */
export const TOKEN_BACKFILL_MAX_S = 7 * SECONDS_PER_DAY;
/** Arc's RPCs answer `eth_getLogs` for at most 10,000 blocks per call (measured 2026-10-02: 10,000 → "range too large"). */
export const TOKEN_BACKFILL_WINDOW_BLOCKS = 9_999n;
/** Backfill windows read per watcher tick, so a long backfill never delays live payments. */
export const TOKEN_BACKFILL_WINDOWS_PER_TICK = 12;
/** Registration time → block: read back this much earlier than the estimate, for clock and block-time drift. */
export const TOKEN_BACKFILL_MARGIN_S = SECONDS_PER_HOUR;

/** Token search: results per query. */
export const TOKEN_SEARCH_LIMIT = 20;
/** Market list rows per segment. */
export const MARKET_LIST_LIMIT = 30;
