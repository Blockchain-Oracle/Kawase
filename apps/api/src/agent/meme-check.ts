// The meme/copycat check before a buy (front door, inventory D "meme safety warning"): race_routes and
// get_token_safety ask it about the token being bought. Two kinds of signal, none of them a block by itself:
//   - the name: a token that is not Kawase's canonical one but calls itself by a known asset's name or symbol
//     ("USDC", "Pepe", "Bitcoin") is a copycat (Kawase's own rule; works on every network);
//   - the market, from GeckoTerminal's free pools endpoint (mainnet only; Arc testnet has no pools there): volume far
//     above what the pools hold, identical 24-hour volumes across pools, many trades from a handful of wallets
//     (wash trading), or so little liquidity that a sale would not fill.
// GeckoTerminal's free tier allows about 30 calls a minute for the whole api, so answers are cached per token for ten
// minutes, a failed read for one minute, and at most a few calls go out per minute; a read that cannot be made leaves
// the market signals out (never "ok" by guesswork: `checkedBy` stays null).
import type { TokenDetailView, TokenWarning, TokenWarningReason } from "@kawase/api-client";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

const GECKO = "https://api.geckoterminal.com/api/v2";
const GECKO_NETWORK = "arc";
const TIMEOUT_MS = 3_000;
const CACHE_MS = 10 * 60_000;
const FAILED_CACHE_MS = 60_000;
/** A share of GeckoTerminal's free 30 calls a minute (the market pages use the rest). */
const CALLS_PER_MINUTE = 6;
const MINUTE_MS = 60_000;
const CACHE_MAX = 500;

/** 24-hour volume this many times what the pools hold, on a small pool, reads as churn rather than trading. */
const WASH_TURNOVER = 10;
const WASH_POOL_CEILING_USD = 50_000;
/** Below this the pools cannot absorb a sale of any size. */
const THIN_LIQUIDITY_USD = 1_000;
/** Many trades from very few wallets. */
const FEW_TRADERS_MAX = 5;
const FEW_TRADERS_MIN_TRADES = 40;
/** Two pools' volumes equal to the cent (and not zero) are not two markets. */
const CENT = 100;

/**
 * Assets people know by name, whose name a copy borrows: stablecoins, majors and the memes copied most. A token that is
 * canonical in Kawase's registry is never flagged; anything else using these names is.
 */
const KNOWN: readonly { names: readonly string[]; label: string }[] = [
  { names: ["usdc", "usdcoin"], label: "USDC" },
  { names: ["eurc", "eurocoin"], label: "EURC" },
  { names: ["usdt", "tether"], label: "Tether" },
  { names: ["usyc"], label: "USYC" },
  { names: ["btc", "bitcoin", "wbtc", "cbbtc"], label: "Bitcoin" },
  { names: ["eth", "ether", "ethereum", "weth"], label: "Ether" },
  { names: ["sol", "solana"], label: "Solana" },
  { names: ["arc", "arcnetwork"], label: "Arc" },
  { names: ["circle"], label: "Circle" },
  { names: ["pepe"], label: "Pepe" },
  { names: ["doge", "dogecoin"], label: "Dogecoin" },
  { names: ["shib", "shibainu"], label: "Shiba Inu" },
  { names: ["bonk"], label: "Bonk" },
  { names: ["wif", "dogwifhat"], label: "dogwifhat" },
  { names: ["trump", "officialtrump"], label: "Official Trump" },
  { names: ["floki"], label: "Floki" },
];

const squash = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** The known asset a token's own name or symbol copies, if any (exact name, or the name with a suffix like "2.0"). */
export function copiedName(token: { symbol: string; name: string }): string | null {
  const symbol = squash(token.symbol);
  const name = squash(token.name);
  for (const known of KNOWN) {
    for (const candidate of known.names) {
      if (symbol === candidate || name === candidate) return known.label;
      // "PEPE2", "USDCoin Official", "Bitcoin Arc": the known name plus a little.
      if (candidate.length >= 4 && (symbol.startsWith(candidate) || name.startsWith(candidate))) return known.label;
    }
  }
  return null;
}

type Pool = { reserveUsd: number | null; volume24Usd: number | null; trades24: number | null; traders24: number | null };
type GtPool = {
  attributes?: {
    reserve_in_usd?: string | null;
    volume_usd?: { h24?: string | null };
    transactions?: { h24?: { buys?: number; sells?: number; buyers?: number; sellers?: number } };
  };
};

const num = (value: string | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The market signals from a token's pools. */
export function marketSignals(pools: readonly Pool[]): { reasons: TokenWarningReason[]; volume24hUsd: number | null; liquidityUsd: number | null } {
  if (pools.length === 0) return { reasons: ["thin_liquidity"], volume24hUsd: 0, liquidityUsd: 0 };
  const sum = (pick: (pool: Pool) => number | null) => pools.reduce((total, pool) => total + (pick(pool) ?? 0), 0);
  const liquidity = sum((pool) => pool.reserveUsd);
  const volume = sum((pool) => pool.volume24Usd);
  const reasons: TokenWarningReason[] = [];
  if (liquidity < THIN_LIQUIDITY_USD) reasons.push("thin_liquidity");
  if (liquidity < WASH_POOL_CEILING_USD && volume > liquidity * WASH_TURNOVER && volume > 0) reasons.push("wash_volume");
  const volumes = pools.map((pool) => Math.round((pool.volume24Usd ?? 0) * CENT)).filter((cents) => cents > 0);
  if (new Set(volumes).size < volumes.length) reasons.push("identical_volumes");
  const trades = sum((pool) => pool.trades24);
  const traders = sum((pool) => pool.traders24);
  if (trades >= FEW_TRADERS_MIN_TRADES && traders > 0 && traders <= FEW_TRADERS_MAX) reasons.push("few_traders");
  return { reasons, volume24hUsd: volume, liquidityUsd: liquidity };
}

export type MemeCheck = { check(network: NetworkId, detail: Pick<TokenDetailView, "token" | "market">): Promise<TokenWarning | null> };

/** One instance per api: the cache and the call budget are shared by every person's turns. */
export function createMemeCheck(log: Logger, fetchImpl: typeof fetch = fetch): MemeCheck {
  const cache = new Map<string, { at: number; ttl: number; pools: Pool[] | null }>();
  let window = { start: 0, calls: 0 };

  const pools = async (address: string): Promise<Pool[] | null> => {
    const key = address.toLowerCase();
    const hit = cache.get(key);
    const now = Date.now();
    if (hit && now - hit.at < hit.ttl) return hit.pools;
    if (now - window.start >= MINUTE_MS) window = { start: now, calls: 0 };
    if (window.calls >= CALLS_PER_MINUTE) return null;
    window.calls += 1;
    try {
      const response = await fetchImpl(`${GECKO}/networks/${GECKO_NETWORK}/tokens/${key}/pools?page=1`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // A token GeckoTerminal has never seen has no pools: a real answer (nothing to trade against).
      const read: Pool[] | null =
        response.status === 404
          ? []
          : response.ok
            ? (((await response.json()) as { data?: GtPool[] }).data ?? []).map((pool) => {
                const tx = pool.attributes?.transactions?.h24;
                return {
                  reserveUsd: num(pool.attributes?.reserve_in_usd),
                  volume24Usd: num(pool.attributes?.volume_usd?.h24),
                  trades24: tx ? (tx.buys ?? 0) + (tx.sells ?? 0) : null,
                  traders24: tx && (tx.buyers !== undefined || tx.sellers !== undefined) ? (tx.buyers ?? 0) + (tx.sellers ?? 0) : null,
                };
              })
            : null;
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now, ttl: read ? CACHE_MS : FAILED_CACHE_MS, pools: read });
      return read;
    } catch (error) {
      log.warn({ err: error, token: key }, "meme check: GeckoTerminal unavailable");
      cache.set(key, { at: now, ttl: FAILED_CACHE_MS, pools: null });
      return null;
    }
  };

  return {
    async check(network, { token, market }) {
      if (token.status === "canonical") return null;
      const reasons: TokenWarningReason[] = [];
      if (token.status === "impersonator") reasons.push("impersonator");
      // A token on the market lists (a bridged WETH, say) is the asset it names; only an unlisted one is a copy.
      const copies = token.status === "listed" ? null : copiedName(token);
      if (copies) reasons.push("copies_name");
      // Arc testnet has no GeckoTerminal pools: only the name rule runs there.
      const read = network === "mainnet" ? await pools(token.address) : null;
      const signals = read ? marketSignals(read) : null;
      if (signals) reasons.push(...signals.reasons);
      if (reasons.length === 0) return null;
      const danger = reasons.includes("impersonator") || reasons.includes("wash_volume") || reasons.includes("identical_volumes") || (reasons.includes("copies_name") && reasons.length > 1);
      return {
        level: danger ? "danger" : "caution",
        reasons,
        token: { symbol: token.symbol, name: token.name, address: token.address },
        copies,
        volume24hUsd: signals?.volume24hUsd ?? market.volume24hUsd,
        liquidityUsd: signals?.liquidityUsd ?? market.liquidityUsd,
        checkedBy: signals ? "GeckoTerminal" : null,
        checkedAt: new Date().toISOString(),
      };
    },
  };
}
