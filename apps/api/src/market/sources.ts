// The market sources behind the asset registry, portfolio, token pages and Markets (plan/product/cards/trade.md,
// live checks 2026-10-02):
// - LI.FI `GET /v1/tokens?chains=5042`: Arc's listed tokens with USD prices and logos; `GET /v1/wallets/{a}/balances`:
//   a wallet's tokens on the other chains LI.FI covers (it does not cover Arc itself).
// - GeckoTerminal (`networks/arc`): token markets with their deepest pool, token info (description, holders,
//   score), trending and new pools, search, OHLCV. ~10 calls a minute on the free tier, so every call goes through
//   one budget and the shared cache.
// - DexScreener `tokens/v1/arc/{addresses}`: the live layer — a token's price from its deepest pair seconds after a
//   trade, 5 m / 1 h / 24 h change, liquidity, today's buys and sells, its image and links. 300 calls a minute, 30
//   tokens a call, so lists and token pages refresh every few seconds without touching GeckoTerminal's budget.
// - GoPlus `token_security/5042`: honeypot, taxes, mint, owner, holders.
// - exchangerate-api's open endpoint: the display currency per US dollar.
// Each is mainnet-only by nature; test networks get no market (R11), and callers say so.
import { getAddress } from "viem";

import {
  CHART_TTL_MS,
  DEXSCREENER_CALLS_PER_MINUTE,
  DEXSCREENER_TOKENS_MAX,
  FX_TTL_MS,
  GECKOTERMINAL_CALLS_PER_MINUTE,
  GECKOTERMINAL_COOLDOWN_MS,
  GECKOTERMINAL_MULTI_MAX,
  LIVE_TTL_MS,
  MARKET_TTL_MS,
  OTHER_CHAIN_BALANCES_TTL_MS,
  PRICE_TTL_MS,
  SAFETY_TTL_MS,
  SPARK_POINTS,
  SPARK_TTL_MS,
  TOKEN_LIST_TTL_MS,
} from "@kawase/config";
import type { Candle, ChartRange } from "@kawase/api-client";

import { alchemyIndex, type WalletIndex } from "./alchemy";
import { CallBudget, MarketCache, OutOfBudget, getJson, type Cached } from "./cache";

const LIFI = "https://li.quest/v1";
const GECKO = "https://api.geckoterminal.com/api/v2";
const GECKO_NETWORK = "arc";
const DEXSCREENER = "https://api.dexscreener.com";
const DEXSCREENER_CHAIN = "arc";
const GOPLUS = "https://api.gopluslabs.io/api/v1";
const FX = "https://open.er-api.com/v6/latest/USD";
/** Arc mainnet: the only Arc chain the market sources cover. */
const ARC_MAINNET_CHAIN_ID = 5042;

export type ListedToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number | null;
  logoUrl: string | null;
  coingeckoId: string | null;
};

export type PoolRef = { address: string; dex: string; createdAt: string | null; tokenIsBase: boolean };

export type TokenMarket = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string | null;
  coingeckoId: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  pool: PoolRef | null;
};

export type PoolSide = { address: string; symbol: string; name: string; decimals: number; logoUrl: string | null; coingeckoId: string | null };

export type PoolRow = {
  address: string;
  name: string;
  dex: string;
  createdAt: string | null;
  base: PoolSide;
  quote: PoolSide;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
};

export type TokenInfo = {
  description: string | null;
  websites: string[];
  twitter: string | null;
  telegram: string | null;
  holders: number | null;
  gtScore: number | null;
  gtVerified: boolean;
};

/** A token's live market from its deepest Arc pair on DexScreener (seconds old). */
export type LiveQuote = {
  pair: string;
  priceUsd: number | null;
  change5mPct: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  imageUrl: string | null;
  websites: string[];
  twitter: string | null;
  telegram: string | null;
};

export type SecurityFacts = {
  honeypot: boolean | null;
  buyTaxPct: number | null;
  sellTaxPct: number | null;
  mintable: boolean | null;
  ownerRenounced: boolean | null;
  openSource: boolean | null;
  pausable: boolean | null;
  blacklist: boolean | null;
  hiddenOwner: boolean | null;
  takeBackOwnership: boolean | null;
  cannotSellAll: boolean | null;
  holders: number | null;
};

export type OtherChainBalance = {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Base units. */
  amount: string;
  priceUsd: number | null;
  logoUrl: string | null;
};

/** What the api needs from the market; tests pass a fake. */
export type MarketData = {
  listed(chainId: number): Promise<Map<string, ListedToken>>;
  markets(chainId: number, addresses: readonly string[]): Promise<{ markets: Map<string, TokenMarket>; at: number; stale: boolean }>;
  pools(kind: "trending" | "new"): Promise<Cached<PoolRow[]>>;
  search(query: string): Promise<PoolRow[]>;
  /** A pool's candles; throws when GeckoTerminal can't answer and nothing is held (the page offers a retry). */
  chart(chainId: number, pool: string, token: string, range: ChartRange): Promise<Candle[]>;
  /** Live quotes by lower-case address (DexScreener), with the time of the oldest one; empty where it has none. */
  live?(chainId: number, addresses: readonly string[]): Promise<{ quotes: Map<string, LiveQuote>; at: number }>;
  /**
   * A market row's sparkline: hourly closes over 24 h for a pool's token. `load: false` answers only from the cache
   * (a list never spends the budget on it); the warmer loads one at a time.
   */
  spark?(pool: string, token: string, load: boolean): Promise<number[] | null>;
  /** Whether a pool's sparkline is missing or older than its half hour (what the warmer loads next). */
  sparkDue?(pool: string, token: string): boolean;
  /** Whether a pool's chart for a range is missing or older than `ms` (the warmer keeps popular charts on hand). */
  chartDue?(pool: string, token: string, range: ChartRange, ms: number): boolean;
  info(chainId: number, address: string): Promise<TokenInfo | null>;
  security(chainId: number, address: string): Promise<SecurityFacts | null>;
  otherChains(wallet: string): Promise<OtherChainBalance[]>;
  /** EVM chains LI.FI routes, by id: their names and marks. */
  chains(): Promise<Map<number, { name: string; logoUrl: string | null }>>;
  /** Units of `currency` per US dollar; 1 for USD; null when unknown. */
  fx(currency: string): Promise<number | null>;
  /** A wallet's holdings across Arc and the bridge chains (Alchemy), when configured. */
  wallets?: WalletIndex | undefined;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const flag = (value: unknown): boolean | null => (value === "1" ? true : value === "0" ? false : null);
const lower = (address: string) => address.toLowerCase();
const PERCENT = 100;
const WEBSITES_MAX = 3;
const ZERO_UNITS = 0n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

// ── GeckoTerminal JSON:API shapes (only what Kawase reads) ─────────────────────────────────────────────────────
type GtRel = { data: { id: string; type: string } | null };
type GtTokenAttrs = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  image_url: string | null;
  coingecko_coin_id: string | null;
  price_usd?: string | null;
  volume_usd?: { h24?: string | null };
  total_reserve_in_usd?: string | null;
  market_cap_usd?: string | null;
  fdv_usd?: string | null;
};
type GtPoolAttrs = {
  address: string;
  name: string;
  pool_created_at: string | null;
  base_token_price_usd: string | null;
  quote_token_price_usd: string | null;
  price_change_percentage?: { h24?: string | null };
  volume_usd?: { h24?: string | null };
  reserve_in_usd?: string | null;
  market_cap_usd?: string | null;
  fdv_usd?: string | null;
};
type GtResource<A> = { id: string; type: string; attributes: A; relationships?: Record<string, GtRel> };
type GtDoc<A> = { data: GtResource<A> | GtResource<A>[]; included?: GtResource<Record<string, unknown>>[] };

/** "arc_0xabc…" → "0xabc…" */
const gtAddress = (id: string | undefined) => (id ? id.slice(id.indexOf("_") + 1) : "");
const missing = (url: string | null | undefined) => (url && !url.includes("missing.png") ? url : null);

const CHART_SHAPE: Record<ChartRange, { timeframe: "minute" | "hour" | "day"; aggregate: number; limit: number }> = {
  "1H": { timeframe: "minute", aggregate: 1, limit: 60 },
  "1D": { timeframe: "minute", aggregate: 15, limit: 96 },
  "1W": { timeframe: "hour", aggregate: 4, limit: 42 },
  "1M": { timeframe: "hour", aggregate: 12, limit: 60 },
  "1Y": { timeframe: "day", aggregate: 1, limit: 365 },
  ALL: { timeframe: "day", aggregate: 1, limit: 1000 },
};

// ── DexScreener's pair shape (only what Kawase reads) ───────────────────────────────────────────────────────
type DsWindow = { m5?: number; h1?: number; h6?: number; h24?: number };
type DsPair = {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  priceUsd?: string;
  priceChange?: DsWindow;
  volume?: DsWindow;
  txns?: { h24?: { buys?: number; sells?: number } };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string; websites?: { url: string; label?: string }[]; socials?: { url: string; type: string }[] };
};

function liveQuote(pair: DsPair): LiveQuote {
  const social = (type: string) => pair.info?.socials?.find((entry) => entry.type === type)?.url ?? null;
  return {
    pair: pair.pairAddress,
    priceUsd: num(pair.priceUsd),
    change5mPct: num(pair.priceChange?.m5),
    change1hPct: num(pair.priceChange?.h1),
    change24hPct: num(pair.priceChange?.h24),
    volume24hUsd: num(pair.volume?.h24),
    liquidityUsd: num(pair.liquidity?.usd),
    marketCapUsd: num(pair.marketCap),
    fdvUsd: num(pair.fdv),
    buys24h: num(pair.txns?.h24?.buys),
    sells24h: num(pair.txns?.h24?.sells),
    imageUrl: pair.info?.imageUrl ?? null,
    websites: (pair.info?.websites ?? []).map((site) => site.url).filter((url) => url.startsWith("https://")).slice(0, WEBSITES_MAX),
    twitter: social("twitter"),
    telegram: social("telegram"),
  };
}

export function liveMarketData(options: { alchemyApiKey?: string | undefined } = {}): MarketData {
  const cache = new MarketCache();
  const gecko = new CallBudget("GeckoTerminal", GECKOTERMINAL_CALLS_PER_MINUTE);
  const dex = new CallBudget("DexScreener", DEXSCREENER_CALLS_PER_MINUTE);

  const geckoGet = <T>(path: string): Promise<T> => {
    if (!gecko.take()) return Promise.reject(new OutOfBudget(gecko.source));
    return getJson<T>(`${GECKO}${path}`).catch((error: unknown) => {
      // A 429 means the window is full on their side: stop asking for a minute instead of burning more refusals.
      if (error instanceof Error && error.message.endsWith(" 429")) gecko.cooldown(GECKOTERMINAL_COOLDOWN_MS);
      throw error;
    });
  };

  const listed = async (chainId: number) => {
    if (chainId !== ARC_MAINNET_CHAIN_ID) return new Map<string, ListedToken>();
    return cache.value(
      `lifi:tokens:${chainId}`,
      TOKEN_LIST_TTL_MS,
      async () => {
        const body = await getJson<{ tokens: Record<string, { address: string; symbol: string; name: string; decimals: number; priceUSD?: string; logoURI?: string; coinKey?: string }[]> }>(
          `${LIFI}/tokens?chains=${chainId}`,
        );
        return new Map(
          (body.tokens[String(chainId)] ?? []).map((token) => [
            lower(token.address),
            {
              address: getAddress(token.address),
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              priceUsd: num(token.priceUSD),
              logoUrl: token.logoURI || null,
              coingeckoId: null,
            } satisfies ListedToken,
          ]),
        );
      },
      new Map<string, ListedToken>(),
    );
  };

  const poolRef = (pool: GtResource<GtPoolAttrs> | undefined, token: string): PoolRef | null => {
    if (!pool) return null;
    return {
      address: pool.attributes.address,
      dex: pool.relationships?.dex?.data?.id ?? "",
      createdAt: pool.attributes.pool_created_at,
      tokenIsBase: lower(gtAddress(pool.relationships?.base_token?.data?.id)) === lower(token),
    };
  };

  /** One tokens/multi call for up to 30 addresses, each answer cached on its own key. */
  const fetchMarkets = async (addresses: string[]) => {
    const doc = await geckoGet<GtDoc<GtTokenAttrs>>(`/networks/${GECKO_NETWORK}/tokens/multi/${addresses.join(",")}?include=top_pools`);
    const pools = new Map((doc.included ?? []).filter((item) => item.type === "pool").map((item) => [item.id, item as unknown as GtResource<GtPoolAttrs>]));
    const found = new Set<string>();
    for (const token of Array.isArray(doc.data) ? doc.data : [doc.data]) {
      const attrs = token.attributes;
      const top = (token.relationships?.top_pools?.data as unknown as { id: string }[] | undefined) ?? [];
      const pool = top.map((ref) => pools.get(ref.id)).find(Boolean);
      const ref = poolRef(pool, attrs.address);
      const market: TokenMarket = {
        address: getAddress(attrs.address),
        symbol: attrs.symbol,
        name: attrs.name,
        decimals: attrs.decimals,
        logoUrl: missing(attrs.image_url),
        coingeckoId: attrs.coingecko_coin_id,
        priceUsd: num(attrs.price_usd),
        // GeckoTerminal reports a pool's change for its base token only.
        change24hPct: ref?.tokenIsBase ? num(pool?.attributes.price_change_percentage?.h24) : null,
        volume24hUsd: num(attrs.volume_usd?.h24),
        liquidityUsd: num(attrs.total_reserve_in_usd),
        marketCapUsd: num(attrs.market_cap_usd),
        fdvUsd: num(attrs.fdv_usd),
        pool: ref,
      };
      found.add(lower(attrs.address));
      cache.set(`gt:market:${lower(attrs.address)}`, market);
    }
    // Tokens GeckoTerminal does not know are remembered as unknown, so they are not asked again every minute.
    for (const address of addresses) if (!found.has(lower(address))) cache.set(`gt:market:${lower(address)}`, null);
  };

  const markets: MarketData["markets"] = async (chainId, addresses) => {
    const result = new Map<string, TokenMarket>();
    if (chainId !== ARC_MAINNET_CHAIN_ID || addresses.length === 0) return { markets: result, at: Date.now(), stale: false };
    const unique = [...new Set(addresses.map(lower))];
    const due = unique.filter((address) => {
      const held = cache.peek<TokenMarket | null>(`gt:market:${address}`);
      return !held || Date.now() - held.at >= PRICE_TTL_MS;
    });
    let stale = false;
    for (let start = 0; start < due.length; start += GECKOTERMINAL_MULTI_MAX) {
      await fetchMarkets(due.slice(start, start + GECKOTERMINAL_MULTI_MAX)).catch(() => {
        stale = true;
      });
    }
    let oldest = Date.now();
    for (const address of unique) {
      const held = cache.peek<TokenMarket | null>(`gt:market:${address}`);
      if (!held) continue;
      if (held.at < oldest) oldest = held.at;
      if (held.value) result.set(address, held.value);
    }
    return { markets: result, at: oldest, stale };
  };

  const side = (resource: GtResource<Record<string, unknown>> | undefined): PoolSide => {
    const attrs = (resource?.attributes ?? {}) as Partial<GtTokenAttrs>;
    return {
      address: attrs.address ? getAddress(attrs.address) : "",
      symbol: attrs.symbol ?? "",
      name: attrs.name ?? "",
      decimals: attrs.decimals ?? 0,
      logoUrl: missing(attrs.image_url),
      coingeckoId: attrs.coingecko_coin_id ?? null,
    };
  };

  const poolRows = (doc: GtDoc<GtPoolAttrs>): PoolRow[] => {
    const included = new Map((doc.included ?? []).map((item) => [item.id, item]));
    return (Array.isArray(doc.data) ? doc.data : [doc.data]).map((pool) => {
      const attrs = pool.attributes;
      return {
        address: attrs.address,
        name: attrs.name,
        dex: pool.relationships?.dex?.data?.id ?? "",
        createdAt: attrs.pool_created_at,
        base: side(included.get(pool.relationships?.base_token?.data?.id ?? "")),
        quote: side(included.get(pool.relationships?.quote_token?.data?.id ?? "")),
        priceUsd: num(attrs.base_token_price_usd),
        change24hPct: num(attrs.price_change_percentage?.h24),
        volume24hUsd: num(attrs.volume_usd?.h24),
        liquidityUsd: num(attrs.reserve_in_usd),
        marketCapUsd: num(attrs.market_cap_usd) ?? num(attrs.fdv_usd),
      };
    });
  };

  /**
   * A pool list already carries its base token's price, change, volume and depth: those become that token's market
   * when the cache has nothing fresher, so a trending token's page and price cost no extra call.
   */
  const seed = (rows: PoolRow[]) => {
    for (const row of rows) {
      if (!row.base.address) continue;
      const key = `gt:market:${lower(row.base.address)}`;
      const held = cache.peek<TokenMarket | null>(key);
      if (held?.value && Date.now() - held.at < PRICE_TTL_MS) continue;
      cache.set(key, {
        address: row.base.address,
        symbol: row.base.symbol,
        name: row.base.name,
        decimals: row.base.decimals,
        logoUrl: row.base.logoUrl,
        coingeckoId: row.base.coingeckoId,
        priceUsd: row.priceUsd,
        change24hPct: row.change24hPct,
        volume24hUsd: row.volume24hUsd,
        liquidityUsd: row.liquidityUsd,
        marketCapUsd: row.marketCapUsd,
        fdvUsd: null,
        pool: { address: row.address, dex: row.dex, createdAt: row.createdAt, tokenIsBase: true },
      } satisfies TokenMarket);
    }
    return rows;
  };

  return {
    ...(options.alchemyApiKey ? { wallets: alchemyIndex(options.alchemyApiKey, cache) } : {}),
    listed,
    markets,
    pools: (kind) =>
      cache.get(`gt:pools:${kind}`, MARKET_TTL_MS, async () =>
        seed(poolRows(await geckoGet<GtDoc<GtPoolAttrs>>(`/networks/${GECKO_NETWORK}/${kind === "trending" ? "trending_pools" : "new_pools"}?include=base_token,quote_token,dex&page=1`))),
      ),
    search: (query) =>
      cache.value(
        `gt:search:${query.toLowerCase()}`,
        MARKET_TTL_MS,
        async () => poolRows(await geckoGet<GtDoc<GtPoolAttrs>>(`/search/pools?query=${encodeURIComponent(query)}&network=${GECKO_NETWORK}&include=base_token,quote_token,dex`)),
        [],
      ),
    chart: async (chainId, pool, token, range) => {
      if (chainId !== ARC_MAINNET_CHAIN_ID) return [];
      const shape = CHART_SHAPE[range];
      // The last good candles when GeckoTerminal is busy; a failure with nothing held is an error, never "no history".
      const held = await cache.get(`gt:chart:${pool}:${lower(token)}:${range}`, CHART_TTL_MS, async () => {
        const body = await geckoGet<{ data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } } }>(
          `/networks/${GECKO_NETWORK}/pools/${pool}/ohlcv/${shape.timeframe}?aggregate=${shape.aggregate}&limit=${shape.limit}&currency=usd&token=${token}`,
        );
        return body.data.attributes.ohlcv_list.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })).sort((a, b) => a.t - b.t);
      });
      return held.value;
    },
    live: async (chainId, addresses) => {
      if (chainId !== ARC_MAINNET_CHAIN_ID) return { quotes: new Map<string, LiveQuote>(), at: Date.now() };
      const wanted = [...new Set(addresses.map(lower))];
      const due = wanted.filter((address) => {
        const held = cache.peek<LiveQuote | null>(`ds:live:${address}`);
        return !held || Date.now() - held.at >= LIVE_TTL_MS;
      });
      const batches: string[][] = [];
      for (let i = 0; i < due.length; i += DEXSCREENER_TOKENS_MAX) batches.push(due.slice(i, i + DEXSCREENER_TOKENS_MAX));
      await Promise.allSettled(
        batches.map((batch) =>
          cache.get(`ds:batch:${batch.join(",")}`, LIVE_TTL_MS, async () => {
            if (!dex.take()) throw new OutOfBudget(dex.source);
            const pairs = await getJson<DsPair[]>(`${DEXSCREENER}/tokens/v1/${DEXSCREENER_CHAIN}/${batch.join(",")}`);
            // Each token's deepest pair where it is the base (the pair's price is the base's).
            const best = new Map<string, DsPair>();
            for (const pair of Array.isArray(pairs) ? pairs : []) {
              if (pair.chainId !== DEXSCREENER_CHAIN) continue;
              const base = lower(pair.baseToken.address);
              const known = best.get(base);
              if (!known || (pair.liquidity?.usd ?? 0) > (known.liquidity?.usd ?? 0)) best.set(base, pair);
            }
            // A token DexScreener doesn't know is remembered as such, so it isn't asked for again every few seconds.
            for (const address of batch) cache.set(`ds:live:${address}`, best.has(address) ? liveQuote(best.get(address)!) : null);
            return true;
          }),
        ),
      );
      const quotes = new Map<string, LiveQuote>();
      let at = Date.now();
      for (const address of wanted) {
        const held = cache.peek<LiveQuote | null>(`ds:live:${address}`);
        if (!held?.value) continue;
        quotes.set(address, held.value);
        at = Math.min(at, held.at);
      }
      return { quotes, at };
    },
    chartDue: (pool, token, range, ms) => {
      const held = cache.peek<Candle[]>(`gt:chart:${pool}:${lower(token)}:${range}`);
      return !held || held.value.length === 0 || Date.now() - held.at >= ms;
    },
    sparkDue: (pool, token) => {
      const held = cache.peek<number[]>(`gt:spark:${lower(pool)}:${lower(token)}`);
      return !held || Date.now() - held.at >= SPARK_TTL_MS;
    },
    spark: async (pool, token, load) => {
      const key = `gt:spark:${lower(pool)}:${lower(token)}`;
      const held = cache.peek<number[]>(key);
      if (!load || (held && Date.now() - held.at < SPARK_TTL_MS)) return held?.value ?? null;
      return cache.value(
        key,
        SPARK_TTL_MS,
        async () => {
          const body = await geckoGet<{ data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } } }>(
            `/networks/${GECKO_NETWORK}/pools/${pool}/ohlcv/hour?aggregate=1&limit=${SPARK_POINTS}&currency=usd&token=${token}`,
          );
          return [...body.data.attributes.ohlcv_list].sort((a, b) => a[0] - b[0]).map((candle) => candle[4]);
        },
        held?.value ?? [],
      ).then((values) => (values.length > 1 ? values : null));
    },
    info: async (chainId, address) => {
      if (chainId !== ARC_MAINNET_CHAIN_ID) return null;
      return cache.value(
        `gt:info:${lower(address)}`,
        SAFETY_TTL_MS,
        async () => {
          const body = await geckoGet<{ data: { attributes: Record<string, unknown> } }>(`/networks/${GECKO_NETWORK}/tokens/${lower(address)}/info`);
          const attrs = body.data.attributes;
          const holders = attrs.holders as { count?: number } | null | undefined;
          return {
            description: (attrs.description as string | null) || null,
            websites: ((attrs.websites as string[] | null) ?? []).slice(0, WEBSITES_MAX),
            twitter: (attrs.twitter_handle as string | null) ?? null,
            telegram: (attrs.telegram_handle as string | null) ?? null,
            holders: holders?.count ?? null,
            gtScore: num(attrs.gt_score),
            gtVerified: attrs.gt_verified === true,
          } satisfies TokenInfo;
        },
        null,
      );
    },
    security: async (chainId, address) => {
      if (chainId !== ARC_MAINNET_CHAIN_ID) return null;
      return cache.value(
        `goplus:${chainId}:${lower(address)}`,
        SAFETY_TTL_MS,
        async () => {
          const body = await getJson<{ code: number; result: Record<string, Record<string, unknown>> }>(
            `${GOPLUS}/token_security/${chainId}?contract_addresses=${lower(address)}`,
          );
          const facts = body.result?.[lower(address)];
          if (!facts) return null;
          const owner = typeof facts.owner_address === "string" ? lower(facts.owner_address) : null;
          const tax = (value: unknown) => {
            const parsed = num(value);
            return parsed === null ? null : parsed * PERCENT;
          };
          return {
            honeypot: flag(facts.is_honeypot),
            buyTaxPct: tax(facts.buy_tax),
            sellTaxPct: tax(facts.sell_tax),
            mintable: flag(facts.is_mintable),
            ownerRenounced: owner === null ? null : owner === "" || owner === ZERO_ADDRESS || owner === DEAD_ADDRESS,
            openSource: flag(facts.is_open_source),
            pausable: flag(facts.transfer_pausable),
            blacklist: flag(facts.is_blacklisted),
            hiddenOwner: flag(facts.hidden_owner),
            takeBackOwnership: flag(facts.can_take_back_ownership),
            cannotSellAll: flag(facts.cannot_sell_all),
            holders: num(facts.holder_count),
          } satisfies SecurityFacts;
        },
        null,
      );
    },
    otherChains: (wallet) =>
      cache.value(
        `lifi:balances:${lower(wallet)}`,
        OTHER_CHAIN_BALANCES_TTL_MS,
        async () => {
          const body = await getJson<{ balances: Record<string, { chainId: number; address: string; symbol: string; name: string; decimals: number; amount: string; priceUSD?: string; logoURI?: string }[]> }>(
            `${LIFI}/wallets/${getAddress(wallet)}/balances?extended=true`,
          );
          return Object.values(body.balances ?? {})
            .flat()
            .filter((entry) => entry.chainId !== ARC_MAINNET_CHAIN_ID && BigInt(entry.amount || "0") > ZERO_UNITS)
            .map((entry) => ({
              chainId: entry.chainId,
              address: entry.address,
              symbol: entry.symbol,
              name: entry.name,
              decimals: entry.decimals,
              amount: entry.amount,
              priceUsd: num(entry.priceUSD),
              logoUrl: entry.logoURI || null,
            }));
        },
        [],
      ),
    chains: () =>
      cache.value(
        "lifi:chains",
        SAFETY_TTL_MS,
        async () => {
          const body = await getJson<{ chains: { id: number; name: string; logoURI?: string }[] }>(`${LIFI}/chains?chainTypes=EVM`);
          return new Map(body.chains.map((chain) => [chain.id, { name: chain.name, logoUrl: chain.logoURI || null }]));
        },
        new Map<number, { name: string; logoUrl: string | null }>(),
      ),
    fx: async (currency) => {
      const code = currency.toUpperCase();
      if (code === "USD") return 1;
      const rates = await cache.value(`fx:usd`, FX_TTL_MS, async () => (await getJson<{ rates: Record<string, number> }>(FX)).rates, {} as Record<string, number>);
      return rates[code] ?? null;
    },
  };
}

/** No market at all (tests, or a deployment without outbound access). */
export const noMarketData: MarketData = {
  listed: () => Promise.resolve(new Map()),
  markets: () => Promise.resolve({ markets: new Map(), at: Date.now(), stale: false }),
  pools: () => Promise.resolve({ value: [], at: Date.now(), stale: false }),
  search: () => Promise.resolve([]),
  chart: () => Promise.resolve([]),
  info: () => Promise.resolve(null),
  security: () => Promise.resolve(null),
  otherChains: () => Promise.resolve([]),
  chains: () => Promise.resolve(new Map()),
  fx: (currency) => Promise.resolve(currency.toUpperCase() === "USD" ? 1 : null),
};
