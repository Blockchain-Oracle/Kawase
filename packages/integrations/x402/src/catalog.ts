// The marketplace as a person browses it (Stage 2 read model): Circle's discovery lists endpoints, but a person shops
// for tools. 1,581 of the 2,195 listings on Arc are one reseller's (AIsa) wrappers around about twenty upstream tools
// (tikhub alone is 954 endpoints), so listings are collapsed into a tool: its endpoints are a count and sub-groups
// behind it, never 954 rows. Grouping is by what the URL shows, never by Circle's category label alone (AIsa files its
// Exa search under FINANCIAL_ANALYSIS), with a small override table below that is Kawase's own judgement.
import type { MarketplaceCategory } from "@kawase/config";

import type { Listing, Rail } from "./discovery";

/** Micro-USDC in a dollar: "calls per $1" = this / price. */
const USDC_PER_DOLLAR = 1_000_000n;
const WORD = /[a-z0-9]+/g;
const MIN_TOKEN = 2;
/** Weights for how well a tool matches a search (a word in its name beats one in a tag). */
const SCORE = { name: 6, provider: 3, sub: 3, description: 2, tag: 1 } as const;

/** Whose endpoint it is: the seller's own API, or a reseller's wrapper around someone else's tool. */
export type Party = "first" | "third";

/** How a host's paths split into tools. `skip` leading segments are fixed ("apis", "v2"); the next `depth` name the tool. */
type Collapse = { skip: readonly string[]; depth: 0 | 1; party: Party; subDepth: 0 | 1 | 2 };

/**
 * Hosts whose paths name a tool. Checked live 2026-10-14: api.aisa.one/apis/v2/<tool>/<sub>/..., np.orthogonal.com/<vendor>/...,
 * arc.blockrun.ai/api/v1/<tool>/..., and the RPC proxies, where the host is the tool and the first segment (a chain) is
 * the sub-group.
 */
const COLLAPSE: Record<string, Collapse> = {
  "api.aisa.one": { skip: ["apis", "v2"], depth: 1, party: "third", subDepth: 1 },
  "np.orthogonal.com": { skip: [], depth: 1, party: "third", subDepth: 1 },
  "arc.blockrun.ai": { skip: ["api", "v1"], depth: 1, party: "first", subDepth: 1 },
  "nano.blockrun.ai": { skip: ["api", "v1"], depth: 1, party: "first", subDepth: 1 },
  "x402.quicknode.com": { skip: [], depth: 0, party: "first", subDepth: 1 },
  "edge.goldsky.com": { skip: ["standard"], depth: 0, party: "first", subDepth: 2 },
};

/** Tools whose catalog category is wrong or too coarse (Kawase's own call, from what each one does). */
const TOOL_CATEGORY: Record<string, MarketplaceCategory> = {
  exa: "SEARCH",
  byteplus: "SEARCH",
  "anthropic-websearch": "SEARCH",
  "openai-websearch": "SEARCH",
  foreplay: "SOCIAL",
  waveinflu: "SOCIAL",
  edinet: "FINANCIAL",
  cnpja: "DATA",
  pm: "PREDICTION",
  defillama: "FINANCIAL",
  phone: "INFRASTRUCTURE",
  modal: "INFRASTRUCTURE",
  rpc: "INFRASTRUCTURE",
  audio: "CREATIVE",
  images: "CREATIVE",
  videos: "CREATIVE",
};

export type CatalogGroup = { key: string; name: string; endpoints: number };

export type CatalogTool = {
  /** URL-safe and stable: `host~segment` for a collapsed tool, the registrable domain for a seller's own. */
  key: string;
  name: string;
  /** The seller as listed (the reseller for a third-party tool). */
  provider: { name: string; website: string | null; description: string | null };
  /** First party: the seller's own API. Third: a reseller's wrapper (AIsa, Orthogonal). */
  party: Party;
  category: MarketplaceCategory;
  description: string;
  tags: string[];
  endpoints: number;
  /** USDC base units (6 decimals). */
  minPrice: bigint;
  maxPrice: bigint;
  /** How many calls $1 buys at the cheapest endpoint. */
  callsPerDollar: number;
  /** Every rail any endpoint takes; `gatewayOnly` is true when a plain EIP-3009 wallet could pay none of them. */
  rails: Rail[];
  gatewayOnly: boolean;
  groups: CatalogGroup[];
};

export type CatalogCategory = { id: MarketplaceCategory; tools: number; endpoints: number };

export type Catalog = {
  tools: CatalogTool[];
  /** Listings per tool key, cheapest first. */
  listings: Map<string, Listing[]>;
  categories: CatalogCategory[];
  endpoints: number;
};

const words = (text: string) => (text.toLowerCase().match(WORD) ?? []).filter((word) => word.length >= MIN_TOKEN);

/** `lonestaroracle.xyz` from `aero.lonestaroracle.xyz` (the last two labels; enough for this catalog). */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split(".");
  return labels.slice(-2).join(".");
}

const hostOf = (url: string) => {
  try {
    return new URL(url.replace(/[{}]/g, "")).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const segments = (url: string) => {
  try {
    return new URL(url.replace(/[{}]/g, "")).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
};

const titled = (slug: string) => {
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

type ToolRef = { key: string; slug: string; name: string; party: Party; sub: string | null };

/** Which tool a listing belongs to, and which sub-group inside it. */
export function toolOf(listing: Listing): ToolRef {
  const host = hostOf(listing.url);
  const path = segments(listing.url);
  const rule = COLLAPSE[host];
  if (rule) {
    const rest = rule.skip.every((part, index) => path[index] === part) ? path.slice(rule.skip.length) : path;
    const slug = rule.depth === 1 ? (rest[0] ?? host) : host;
    const subs = rest.slice(rule.depth, rule.depth + rule.subDepth);
    return {
      key: rule.depth === 1 ? `${host}~${slug}` : host,
      slug,
      name: rule.depth === 1 ? titled(slug) : listing.provider.name,
      party: rule.party,
      sub: subs.length > 0 ? subs.join("/") : null,
    };
  }
  // A seller's own API: one tool per registrable domain, its sub-services (a subdomain or the first path segment) inside.
  const domain = registrableDomain(host) || host;
  const subdomain = host.length > domain.length ? host.slice(0, host.length - domain.length - 1) : "";
  const website = listing.provider.website ? hostOf(listing.provider.website) : "";
  const own = !website || registrableDomain(website) === domain;
  return { key: domain, slug: domain, name: listing.provider.name, party: own ? "first" : "third", sub: subdomain || path[0] || null };
}

const cheapest = (a: Listing, b: Listing) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0);

/** Majority vote of the endpoints' categories (ties go to the first seen), unless the tool has an override. */
function categoryOf(slug: string, listings: Listing[]): MarketplaceCategory {
  const override = TOOL_CATEGORY[slug];
  if (override) return override;
  const votes = new Map<MarketplaceCategory, number>();
  for (const listing of listings) votes.set(listing.provider.category, (votes.get(listing.provider.category) ?? 0) + 1);
  let best: MarketplaceCategory = "OTHER";
  let top = 0;
  for (const [category, count] of votes) {
    if (count > top) {
      best = category;
      top = count;
    }
  }
  return best;
}

export const callsPerDollar = (price: bigint): number => (price > 0n ? Number(USDC_PER_DOLLAR / price) : 0);

/** The catalog from every listing payable on the network: tools with counts, categories with tool and endpoint counts. */
export function buildCatalog(all: readonly Listing[]): Catalog {
  const buckets = new Map<string, { ref: ToolRef; listings: Listing[] }>();
  for (const listing of all) {
    const ref = toolOf(listing);
    const bucket = buckets.get(ref.key);
    if (bucket) bucket.listings.push(listing);
    else buckets.set(ref.key, { ref, listings: [listing] });
  }
  const tools: CatalogTool[] = [];
  const listings = new Map<string, Listing[]>();
  for (const [key, { ref, listings: members }] of buckets) {
    members.sort(cheapest);
    listings.set(key, members);
    const subs = new Map<string, number>();
    for (const member of members) {
      const sub = toolOf(member).sub;
      if (sub) subs.set(sub, (subs.get(sub) ?? 0) + 1);
    }
    const rails = new Set<Rail>(members.flatMap((member) => member.rails));
    const first = members[0]!;
    const minPrice = first.price;
    tools.push({
      key,
      name: ref.name,
      provider: { name: first.provider.name, website: first.provider.website, description: first.provider.description },
      party: ref.party,
      category: categoryOf(ref.slug, members),
      description: ref.party === "third" && members.length > 0 ? (first.description || first.provider.description || "") : (first.provider.description ?? first.description),
      tags: [...new Set(members.flatMap((member) => member.provider.tags))].slice(0, 8),
      endpoints: members.length,
      minPrice,
      maxPrice: members[members.length - 1]!.price,
      callsPerDollar: callsPerDollar(minPrice),
      rails: [...rails],
      gatewayOnly: !rails.has("eip3009"),
      groups: [...subs].map(([name, endpoints]) => ({ key: name, name, endpoints })).sort((a, b) => b.endpoints - a.endpoints || a.name.localeCompare(b.name)),
    });
  }
  const byCategory = new Map<MarketplaceCategory, CatalogCategory>();
  for (const tool of tools) {
    const entry = byCategory.get(tool.category) ?? { id: tool.category, tools: 0, endpoints: 0 };
    entry.tools += 1;
    entry.endpoints += tool.endpoints;
    byCategory.set(tool.category, entry);
  }
  return { tools, listings, categories: [...byCategory.values()].sort((a, b) => b.tools - a.tools), endpoints: all.length };
}

export type CatalogFilter = {
  category?: MarketplaceCategory | undefined;
  query?: string | undefined;
  /** USDC base units: only tools with an endpoint at or under this. */
  maxPrice?: bigint | undefined;
  party?: Party | undefined;
  /** "gateway": reachable with a Gateway balance; "eip3009": plain wallets can pay (a stricter subset). */
  rail?: Rail | undefined;
};

function relevance(tool: CatalogTool, query: string[]): number {
  if (query.length === 0) return 1;
  const name = new Set(words(tool.name));
  const provider = new Set(words(tool.provider.name));
  const sub = new Set(tool.groups.flatMap((group) => words(group.name)));
  const description = new Set(words(tool.description));
  const tags = new Set(tool.tags.flatMap(words));
  let total = 0;
  for (const word of query) {
    if (name.has(word)) total += SCORE.name;
    if (provider.has(word)) total += SCORE.provider;
    if (sub.has(word)) total += SCORE.sub;
    if (description.has(word)) total += SCORE.description;
    if (tags.has(word)) total += SCORE.tag;
  }
  return total;
}

/**
 * Tools that pass the filters. Categories are counted over the other filters (not the chosen category), so the chips
 * keep showing what each one would give. With a search the best match leads; without, the tools with the most
 * endpoints do (the closest thing the catalog has to "popular"), cheaper first among equals.
 */
export function filterCatalog(catalog: Catalog, filter: CatalogFilter): { tools: CatalogTool[]; categories: CatalogCategory[] } {
  const query = words(filter.query ?? "");
  const base = catalog.tools
    .filter((tool) => !filter.party || tool.party === filter.party)
    .filter((tool) => !filter.maxPrice || tool.minPrice <= filter.maxPrice)
    .filter((tool) => !filter.rail || tool.rails.includes(filter.rail));
  const scored = base.map((tool) => ({ tool, score: relevance(tool, query) })).filter((entry) => entry.score > 0);
  const counted = new Map<MarketplaceCategory, CatalogCategory>();
  for (const { tool } of scored) {
    const entry = counted.get(tool.category) ?? { id: tool.category, tools: 0, endpoints: 0 };
    entry.tools += 1;
    entry.endpoints += tool.endpoints;
    counted.set(tool.category, entry);
  }
  const tools = scored
    .filter(({ tool }) => !filter.category || tool.category === filter.category)
    .sort((a, b) => b.score - a.score || b.tool.endpoints - a.tool.endpoints || (a.tool.minPrice < b.tool.minPrice ? -1 : a.tool.minPrice > b.tool.minPrice ? 1 : 0) || a.tool.name.localeCompare(b.tool.name))
    .map((entry) => entry.tool);
  return { tools, categories: [...counted.values()].sort((a, b) => b.tools - a.tools) };
}
