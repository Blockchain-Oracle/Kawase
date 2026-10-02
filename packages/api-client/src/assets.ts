// The asset registry, portfolio, token pages and markets (A0, R1, R2, R13). Every token is described the same
// way, wherever it lives; amounts are base units of their own token, values are US dollars (the app converts to
// the display currency with `fx`).
import type { NetworkId } from "./types";

/** What kind of asset it is (packages/networks TokenKind). */
export type TokenKind = "dollar" | "fiat" | "bitcoin" | "ether" | "rwa" | "permissioned" | "position" | "token";

/**
 * How far Kawase trusts that this is the token it says it is:
 * - canonical: on Kawase's verified list;
 * - listed: on a market list Kawase reads (LI.FI's Arc list, CoinGecko);
 * - unverified: found on chain or in a pool, on no list;
 * - lookalike: shares a listed token's symbol at another address;
 * - impersonator: uses a stablecoin's symbol at an address that is not that stablecoin's (hard-blocked).
 */
export type TokenStatus = "canonical" | "listed" | "unverified" | "lookalike" | "impersonator";

export type TokenView = {
  chainId: number;
  /** Checksummed. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** The token's own image from a first-party list (LI.FI, CoinGecko/GeckoTerminal); null = draw the labelled disc. */
  logoUrl: string | null;
  kind: TokenKind;
  status: TokenStatus;
  /** Test money on Arc Testnet. */
  isTest: boolean;
};

export type HiddenReason = "spam" | "lookalike" | "impersonator" | "dust" | "chosen";

export type HoldingView = {
  token: TokenView;
  /** Base units. */
  balance: string;
  /** Decimal string of the balance in whole tokens. */
  amount: string;
  priceUsd: number | null;
  valueUsd: number | null;
  /** Percent over 24 hours, e.g. -3.2. */
  change24hPct: number | null;
  /** The chain's name for holdings on other chains; the Arc network otherwise. */
  chainName: string;
  hidden: boolean;
  hiddenReason: HiddenReason | null;
};

export type PositionKind = "earn" | "borrow" | "perp" | "lp";

export type PositionSummary = {
  kind: PositionKind;
  /** A stable id the app routes on (a vault address, a market id). */
  id: string;
  title: string;
  /** Who runs it (Morpho, Aave, …), for its mark. */
  provider: string;
  valueUsd: number | null;
  /** Earn: yearly yield in percent. */
  apyPct?: number | null;
  /** The token the position is in. */
  token: TokenView | null;
};

export type PortfolioPoint = { t: string; usd: number };

export type PortfolioView = {
  network: NetworkId;
  isTest: boolean;
  /** Every asset on Arc, on other chains and in positions, in US dollars. */
  totalUsd: number;
  /** The same 24 hours ago at today's holdings (null when no price moved or none is known). */
  change24hUsd: number | null;
  change24hPct: number | null;
  /** Visible holdings on Arc, by value. */
  assets: HoldingView[];
  /** Holdings on other chains (mainnet only), by value; "Bring to Arc" applies. */
  otherChains: HoldingView[];
  /** Spam, dust, lookalikes and anything the person hid. */
  hidden: HoldingView[];
  positions: PositionSummary[];
  breakdown: { availableUsd: number; positionsUsd: number; otherChainsUsd: number };
  /** The balance chart: snapshots of the total over time, oldest first, ending now. */
  history: PortfolioPoint[];
  /** The person's display currency and how many of it one US dollar buys. */
  fx: { currency: string; perUsd: number };
  /** When prices were read, and whether a source answered from its last snapshot. */
  pricedAt: string;
  stale: boolean;
};

export type SafetyCheck = {
  /** honeypot, sell_tax, buy_tax, mintable, owner, open_source, pausable, blacklist, hidden_owner, holders. */
  id: string;
  state: "ok" | "warn" | "danger" | "unknown";
  /** A number to show next to it (tax percent, holder count), when there is one. */
  value?: string | null;
};

export type SafetyVerdict = {
  /** block: Kawase refuses to buy it; caution: shown with a warning; ok: nothing found. */
  level: "ok" | "caution" | "block";
  /** Why, as reason codes the app and the agent both phrase (R2): impersonator, honeypot, lookalike, unverified, high_tax, … */
  reasons: string[];
  checks: SafetyCheck[];
  /** Other tokens using the same symbol, when this one is a lookalike or has lookalikes. */
  lookalikes: { address: string; name: string; liquidityUsd: number | null }[];
  /** "GoPlus" etc.; null when no checker covers this chain. */
  checkedBy: string | null;
};

export type ChartRange = "1H" | "1D" | "1W" | "1M" | "1Y" | "ALL";
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type TokenAction = "buy" | "sell" | "send" | "receive" | "withdraw" | "bridge" | "earn" | "long_short";

/** One action on a token page: available, or unavailable with its reason (R2). */
export type TokenActionView = { id: TokenAction; available: boolean; reason: string | null };

export type TokenDetailView = {
  token: TokenView;
  network: NetworkId;
  market: {
    priceUsd: number | null;
    change24hPct: number | null;
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
    /** The deepest pool, where the chart comes from. */
    pool: { address: string; dex: string; createdAt: string | null } | null;
  };
  about: { description: string | null; websites: string[]; twitter: string | null; telegram: string | null };
  safety: SafetyVerdict;
  /** The signed-in person's holding of this token, if any. */
  holding: HoldingView | null;
  actions: TokenActionView[];
  pricedAt: string;
  stale: boolean;
};

export type MarketSegment = "trending" | "new" | "meme";

export type MarketRow = {
  token: TokenView;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  pool: { address: string; dex: string; createdAt: string | null };
  /** A short price series for the row's sparkline (hourly closes over 24 h), when the cache has one. */
  spark: number[] | null;
};

export type MarketListView = { segment: MarketSegment; network: NetworkId; rows: MarketRow[]; pricedAt: string; stale: boolean; available: boolean };

export type TokenSearchResult = { token: TokenView; priceUsd: number | null; liquidityUsd: number | null; held: boolean };
