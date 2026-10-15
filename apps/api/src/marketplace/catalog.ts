// The marketplace read model (Stage 2): Circle's discovery list, collapsed into tools with counts, categories, price
// per call and "calls per $1", 1P/3P and the payment rail. Read only: nothing here pays, grants or tops up. The catalog
// is public data, so it answers guests; the list itself is cached by Discovery (10 minutes, one read at a time, paged
// at 200 with 429 backoff, the last good copy served when a refresh fails), and the grouping is built once per read.
import { X402_DISCOVERY_TTL_MS, type MarketplaceCategory } from "@kawase/config";
import type { CatalogToolDetail, CatalogToolView, CatalogView, ServiceListing } from "@kawase/api-client";
import { getExchangeIdentity, getProviderIdentity } from "@kawase/identity";
import { amount, formatPrice } from "@kawase/money";
import type { NetworkContext } from "@kawase/networks";
import { brandDomain } from "./brand-logos";
import { buildCatalog, filterCatalog, toolKeyOf, toolOf, type Catalog, type CatalogFilter, type CatalogTool, type Discovery, type Listing, type Party, type Rail } from "@kawase/integrations-x402";

export const CATALOG_PAGE_DEFAULT = 24;
export const CATALOG_PAGE_MAX = 50;
export const ENDPOINT_PAGE_DEFAULT = 50;
export const ENDPOINT_PAGE_MAX = 200;
const DISPLAY_LOCALE = "en";
/** The catalog counts as stale when its last read is older than this many refresh windows (a failed refresh keeps serving it). */
const STALE_AFTER_WINDOWS = 2;

export type CatalogQuery = {
  category?: MarketplaceCategory | undefined;
  q?: string | undefined;
  /** USDC base units. */
  maxPrice?: bigint | undefined;
  party?: Party | undefined;
  rail?: Rail | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

const clamp = (value: number | undefined, fallback: number, max: number) => Math.min(Math.max(Math.trunc(value ?? fallback), 1), max);

/** Domain labels whose brand goes by another name in the registry (Kawase's own demo seller lives on getkawase.xyz). */
const DOMAIN_ALIASES: Readonly<Record<string, string>> = { getkawase: "kawase" };

/** The registry entity for a word, when it holds a real mark (an entry with no mark file yet counts as none). */
function markOf(slug: string): string | null {
  const name = DOMAIN_ALIASES[slug] ?? slug;
  const entity = getProviderIdentity(name) ?? getExchangeIdentity(name);
  return entity && (entity.marks.color || entity.marks.mono) ? entity.id : null;
}

/** The brand's site icon, served by Kawase's api, for a tool the registry has no mark for. */
const logoPath = (name: string) => {
  const domain = brandDomain(name);
  return domain ? `/marketplace/logo/${encodeURIComponent(domain)}` : null;
};

export function toolView(tool: CatalogTool): CatalogToolView {
  const providerMark = markOf(tool.sellerSlug);
  return {
    key: tool.key,
    name: tool.name,
    provider: { name: tool.provider.name, website: tool.provider.website },
    // A seller's own API carries the seller's mark; a reseller's tool only its own (never the reseller's in its place).
    mark: markOf(tool.slug) ?? (tool.party === "first" ? providerMark : null),
    providerMark,
    logo: markOf(tool.slug) ? null : logoPath(tool.name),
    party: tool.party,
    category: tool.category,
    description: tool.description,
    endpoints: tool.endpoints,
    price: tool.minPrice.toString(),
    maxPrice: tool.maxPrice.toString(),
    callsPerDollar: tool.callsPerDollar,
    rails: tool.rails,
    gatewayOnly: tool.gatewayOnly,
    groups: tool.groups,
  };
}

function endpointView(listing: Listing): ServiceListing {
  return {
    tool: toolKeyOf(listing.url),
    url: listing.url,
    method: listing.method,
    description: listing.description,
    provider: { name: listing.provider.name, website: listing.provider.website, category: listing.provider.category },
    price: listing.price.toString(),
    priceDisplay: formatPrice(amount("USDC", listing.price), DISPLAY_LOCALE),
    rails: listing.rails,
    payTo: listing.payTo,
  };
}

export class CatalogService {
  /** The grouping built from one read; a new read (a new listings array) builds a new one. */
  private readonly built = new WeakMap<readonly Listing[], Catalog>();

  constructor(private readonly discovery: Discovery) {}

  private async catalog(network: NetworkContext): Promise<{ catalog: Catalog; readAt: string | null; stale: boolean }> {
    const listings = await this.discovery.all(network);
    let catalog = this.built.get(listings);
    if (!catalog) {
      catalog = buildCatalog(listings);
      this.built.set(listings, catalog);
    }
    const at = this.discovery.readAt(network);
    return { catalog, readAt: at ? new Date(at).toISOString() : null, stale: at !== undefined && Date.now() - at > X402_DISCOVERY_TTL_MS * STALE_AFTER_WINDOWS };
  }

  async list(network: NetworkContext, query: CatalogQuery): Promise<CatalogView> {
    const { catalog, readAt, stale } = await this.catalog(network);
    const filter: CatalogFilter = { category: query.category, query: query.q, maxPrice: query.maxPrice, party: query.party, rail: query.rail };
    const { tools, categories } = filterCatalog(catalog, filter);
    const limit = clamp(query.limit, CATALOG_PAGE_DEFAULT, CATALOG_PAGE_MAX);
    const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
    return {
      network: network.id,
      categories,
      tools: tools.slice(offset, offset + limit).map(toolView),
      page: { limit, offset, total: tools.length },
      totals: { tools: catalog.tools.length, endpoints: catalog.endpoints },
      readAt,
      stale,
    };
  }

  /** One tool: its summary and a page of its endpoints (a sub-group's, or those matching the words). */
  async tool(network: NetworkContext, key: string, query: { group?: string | undefined; q?: string | undefined; limit?: number | undefined; offset?: number | undefined }): Promise<CatalogToolDetail | undefined> {
    const { catalog, readAt, stale } = await this.catalog(network);
    const tool = catalog.tools.find((entry) => entry.key === key);
    if (!tool) return undefined;
    const words = (query.q ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const matching = (catalog.listings.get(key) ?? []).filter((listing) => {
      if (query.group && toolOf(listing).sub !== query.group) return false;
      if (words.length === 0) return true;
      const haystack = `${listing.url} ${listing.description}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
    const limit = clamp(query.limit, ENDPOINT_PAGE_DEFAULT, ENDPOINT_PAGE_MAX);
    const offset = Math.max(Math.trunc(query.offset ?? 0), 0);
    return { network: network.id, tool: toolView(tool), endpoints: matching.slice(offset, offset + limit).map(endpointView), page: { limit, offset, total: matching.length }, readAt, stale };
  }
}
