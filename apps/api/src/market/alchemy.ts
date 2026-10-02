// Alchemy's Portfolio and Prices APIs (approved by Abu 2026-10-02 after live checks): the primary discovery of what a
// wallet holds on Arc and on the six bridge chains, in one paged request — native USDC and every ERC-20, airdrops
// and memes included. It returns no prices, logos or spam flag for Arc tokens, so Kawase prices Arc tokens itself
// (GeckoTerminal, LI.FI, then Alchemy's Prices API for majors) and applies its own spam and copycat rules.
// Docs (2026-10-02): POST /data/v1/{key}/assets/tokens/by-address — at most 2 addresses × 5 networks per request,
// `pageKey` paging, `tokenBalance` hex; POST /prices/v1/{key}/tokens/by-address — up to 25 {network, address}.
import { ALCHEMY_HOLDINGS_TTL_MS, ALCHEMY_MAX_PAGES, ALCHEMY_NETWORKS_PER_ADDRESS, ALCHEMY_PRICES_MAX, PRICE_TTL_MS } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

import { getJson, type MarketCache } from "./cache";

const DATA_API = "https://api.g.alchemy.com/data/v1";
const PRICES_API = "https://api.g.alchemy.com/prices/v1";
const HEX_RADIX = 16;
const ZERO = 0n;

/** Alchemy network slugs per Kawase network: Arc first, then the bridge chains (identity CHAIN_IDS). */
export const ALCHEMY_NETWORKS: Record<NetworkId, readonly { slug: string; chainId: number; name: string }[]> = {
  mainnet: [
    { slug: "arc-mainnet", chainId: 5042, name: "Arc" },
    { slug: "eth-mainnet", chainId: 1, name: "Ethereum" },
    { slug: "base-mainnet", chainId: 8453, name: "Base" },
    { slug: "arb-mainnet", chainId: 42161, name: "Arbitrum" },
    { slug: "opt-mainnet", chainId: 10, name: "OP Mainnet" },
    { slug: "matic-mainnet", chainId: 137, name: "Polygon" },
    { slug: "avax-mainnet", chainId: 43114, name: "Avalanche" },
  ],
  testnet: [
    { slug: "arc-testnet", chainId: 5042002, name: "Arc Testnet" },
    { slug: "eth-sepolia", chainId: 11155111, name: "Sepolia" },
    { slug: "base-sepolia", chainId: 84532, name: "Base Sepolia" },
    { slug: "arb-sepolia", chainId: 421614, name: "Arbitrum Sepolia" },
    { slug: "opt-sepolia", chainId: 11155420, name: "OP Sepolia" },
    { slug: "polygon-amoy", chainId: 80002, name: "Polygon Amoy" },
    { slug: "avax-fuji", chainId: 43113, name: "Avalanche Fuji" },
  ],
};

export type WalletHolding = {
  chainId: number;
  chainName: string;
  /** Null for the chain's native coin. */
  tokenAddress: string | null;
  /** Base units. */
  balance: bigint;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  logoUrl: string | null;
  priceUsd: number | null;
};

type TokenRow = {
  network: string;
  tokenAddress: string | null;
  tokenBalance: string;
  tokenMetadata?: { decimals?: number | null; logo?: string | null; name?: string | null; symbol?: string | null };
  tokenPrices?: { currency: string; value: string }[];
  error?: string | null;
};

const usdOf = (prices: { currency: string; value: string }[] | undefined) => {
  const usd = prices?.find((price) => price.currency.toLowerCase() === "usd");
  const value = usd ? Number(usd.value) : NaN;
  return Number.isFinite(value) ? value : null;
};

/** What came back, and the chains whose answer failed (shown as stale, asked again on the next read). */
export type WalletHoldings = { holdings: WalletHolding[]; failedChains: number[] };

export type WalletIndex = {
  /** Everything the wallet holds on this network's Arc and its bridge chains; null when Alchemy cannot answer at all. */
  holdings(wallet: string, network: NetworkId): Promise<WalletHoldings | null>;
  /** USD prices by {chain, address} (majors; Arc USDC included). */
  prices(tokens: readonly { chainId: number; address: string }[]): Promise<Map<string, number>>;
};

export const priceKey = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

export function alchemyIndex(apiKey: string, cache: MarketCache): WalletIndex {
  const slugOf = new Map(Object.values(ALCHEMY_NETWORKS).flat().map((entry) => [entry.chainId, entry.slug]));
  const chainOf = new Map(Object.values(ALCHEMY_NETWORKS).flat().map((entry) => [entry.slug, entry]));

  /** One paged read of these networks; a partial failure (HTTP 200 with an `error` naming networks) keeps the rest. */
  const read = async (wallet: string, slugs: readonly string[]) => {
    // At most five networks per address: the same address twice covers all seven in one request.
    const addresses = [];
    for (let start = 0; start < slugs.length; start += ALCHEMY_NETWORKS_PER_ADDRESS) addresses.push({ address: wallet, networks: slugs.slice(start, start + ALCHEMY_NETWORKS_PER_ADDRESS) });
    const rows: TokenRow[] = [];
    const failed = new Set<string>();
    let pageKey: string | undefined;
    for (let page = 0; page < ALCHEMY_MAX_PAGES; page++) {
      const body = await getJson<{ data?: { tokens?: TokenRow[]; pageKey?: string | null }; error?: unknown }>(`${DATA_API}/${apiKey}/assets/tokens/by-address`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addresses, withMetadata: true, withPrices: true, includeNativeTokens: true, includeErc20Tokens: true, ...(pageKey ? { pageKey } : {}) }),
      });
      rows.push(...(body.data?.tokens ?? []));
      // The error object's shape is not fixed in the docs: any network it names failed.
      if (body.error) {
        const text = JSON.stringify(body.error);
        for (const slug of slugs) if (text.includes(slug)) failed.add(slug);
        if (!body.data?.tokens?.length && failed.size === 0) for (const slug of slugs) failed.add(slug);
      }
      pageKey = body.data?.pageKey ?? undefined;
      if (!pageKey) break;
    }
    return { rows, failed };
  };

  const fetchHoldings = async (wallet: string, network: NetworkId): Promise<WalletHoldings> => {
    const slugs = ALCHEMY_NETWORKS[network].map((entry) => entry.slug);
    const first = await read(wallet, slugs);
    const rows = [...first.rows];
    let failed = first.failed;
    // Failed networks are asked once more on their own; what still fails is reported, never the whole answer lost.
    if (failed.size > 0) {
      const again = await read(wallet, [...failed]).catch(() => ({ rows: [] as TokenRow[], failed }));
      rows.push(...again.rows.filter((row) => failed.has(row.network)));
      failed = again.failed;
    }
    const out: WalletHolding[] = [];
    for (const row of rows) {
      const chain = chainOf.get(row.network);
      if (!chain || row.error) continue;
      const balance = row.tokenBalance?.startsWith("0x") ? BigInt(row.tokenBalance) : BigInt(parseInt(row.tokenBalance || "0", HEX_RADIX) || 0);
      if (balance <= ZERO) continue;
      out.push({
        chainId: chain.chainId,
        chainName: chain.name,
        tokenAddress: row.tokenAddress ? row.tokenAddress.toLowerCase() : null,
        balance,
        symbol: row.tokenMetadata?.symbol ?? null,
        name: row.tokenMetadata?.name ?? null,
        decimals: row.tokenMetadata?.decimals ?? null,
        logoUrl: row.tokenMetadata?.logo || null,
        priceUsd: usdOf(row.tokenPrices),
      });
    }
    return { holdings: out, failedChains: [...failed].map((slug) => chainOf.get(slug)!.chainId) };
  };

  return {
    holdings: async (wallet, network) => {
      const key = `alchemy:holdings:${network}:${wallet.toLowerCase()}`;
      const held = cache.peek<WalletHoldings>(key);
      if (held && Date.now() - held.at < ALCHEMY_HOLDINGS_TTL_MS) return held.value;
      try {
        const fresh = await fetchHoldings(wallet, network);
        // A partial answer is shown but not kept: the next read asks the failed networks again.
        if (fresh.failedChains.length === 0) cache.set(key, fresh);
        else if (held) {
          // Fill the failed chains from the last complete answer, so they show (stale) rather than vanish.
          const failed = new Set(fresh.failedChains);
          return { holdings: [...fresh.holdings, ...held.value.holdings.filter((entry) => failed.has(entry.chainId))], failedChains: fresh.failedChains };
        }
        return fresh;
      } catch {
        return held?.value ?? null;
      }
    },
    prices: async (tokens) => {
      const out = new Map<string, number>();
      const due = tokens.filter((token) => {
        const held = cache.peek<number | null>(`alchemy:price:${priceKey(token.chainId, token.address)}`);
        if (held && Date.now() - held.at < PRICE_TTL_MS) {
          if (held.value !== null) out.set(priceKey(token.chainId, token.address), held.value);
          return false;
        }
        return slugOf.has(token.chainId);
      });
      for (let start = 0; start < due.length; start += ALCHEMY_PRICES_MAX) {
        const batch = due.slice(start, start + ALCHEMY_PRICES_MAX);
        const body = await getJson<{ data: { network: string; address: string; prices?: { currency: string; value: string }[] }[] }>(`${PRICES_API}/${apiKey}/tokens/by-address`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ addresses: batch.map((token) => ({ network: slugOf.get(token.chainId), address: token.address })) }),
        }).catch(() => undefined);
        for (const entry of body?.data ?? []) {
          const chain = chainOf.get(entry.network);
          if (!chain) continue;
          const value = usdOf(entry.prices);
          cache.set(`alchemy:price:${priceKey(chain.chainId, entry.address)}`, value);
          if (value !== null) out.set(priceKey(chain.chainId, entry.address), value);
        }
      }
      return out;
    },
  };
}
