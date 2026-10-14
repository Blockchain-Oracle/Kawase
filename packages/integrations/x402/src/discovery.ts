// Circle's x402 catalog (cards/marketplace.md): every Arc listing, read once per network and cached, searched here.
// Only listings from the catalog can be bought (MASTER-PLAN §Security). On testnet the catalog is empty, so Kawase's
// own demo seller publishes its listings in the same shape at `{seller}/listings`. A listing whose URL could point the
// api inside its own network (not https, a template in the host, a private address) is left out (guard.ts).
import { getAddress, isAddress, type Address } from "viem";

import {
  X402_DISCOVERY_PAGE,
  X402_DISCOVERY_TTL_MS,
  X402_DISCOVERY_URL,
  X402_REQUEST_TIMEOUT_MS,
  marketplaceCategory,
  type MarketplaceCategory,
} from "@kawase/config";
import type { NetworkContext } from "@kawase/networks";

import { listingUrlProblem, originOf, sellerFetch } from "./guard";
import { isGatewayOption, type PaymentOption } from "./pay";

export type Rail = "gateway" | "eip3009";

export type Listing = {
  /** The resource exactly as listed (may hold `{param}` templates). */
  url: string;
  method: string;
  description: string;
  provider: { name: string; website: string | null; description: string | null; category: MarketplaceCategory; tags: string[] };
  /** The lowest price on this network, in USDC base units. */
  price: bigint;
  /** Who is paid on this network (a 402 must name the same address). */
  payTo: Address;
  rails: Rail[];
  mimeType: string | null;
};

type RawItem = {
  resource?: string;
  accepts?: PaymentOption[];
  metadata?: {
    provider?: { name?: string; website?: string; description?: string; category?: string; tags?: string[] };
    method?: string;
    description?: string;
    mimeType?: string;
  };
};

type RawPage = { items?: RawItem[]; pagination?: { total?: number } };

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
const PAGE_RETRIES = 2;
const RETRY_WAIT_BASE_MS = 500;
const RETRY_WAIT_MAX_MS = 5_000;
const MS_PER_SECOND = 1_000;
/** Each retry waits twice as long as the one before. */
const BACKOFF = 2;
const caip2 = (network: NetworkContext) => `eip155:${network.chainId}`;
const WORD = /[a-z0-9]+/g;
const MIN_TOKEN = 2;
/** A word in the description or path counts more than one in a tag. */
const SCORE = { description: 3, path: 2, provider: 2, tag: 1 } as const;

/**
 * One catalog item as a listing on this network, or undefined when it cannot be paid here or its URL is not one the
 * api may call (`trusted`: origins exempt from that, Kawase's own demo seller).
 */
export function toListing(item: RawItem, network: NetworkContext, trusted: readonly string[] = []): Listing | undefined {
  if (!item.resource || listingUrlProblem(item.resource, trusted)) return undefined;
  const usdc = network.addresses.usdc.toLowerCase();
  const here = (item.accepts ?? []).filter(
    (option) => option.scheme === "exact" && option.network === caip2(network) && option.asset.toLowerCase() === usdc && isAddress(option.payTo),
  );
  const [cheapest] = [...here].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? -1 : 1));
  if (!cheapest) return undefined;
  const provider = item.metadata?.provider ?? {};
  const rails = new Set<Rail>(here.map((option) => (isGatewayOption(option) ? "gateway" : "eip3009")));
  return {
    url: item.resource,
    method: (item.metadata?.method ?? "GET").toUpperCase(),
    description: item.metadata?.description ?? provider.description ?? "",
    provider: {
      name: provider.name ?? new URL(item.resource).hostname,
      website: provider.website ?? null,
      description: provider.description ?? null,
      category: marketplaceCategory(provider.category),
      tags: provider.tags ?? [],
    },
    price: BigInt(cheapest.amount),
    payTo: getAddress(cheapest.payTo),
    rails: [...rails],
    mimeType: item.metadata?.mimeType ?? null,
  };
}

const words = (text: string) => (text.toLowerCase().match(WORD) ?? []).filter((word) => word.length >= MIN_TOKEN);

/** How well a listing matches the words asked for (0 = not at all). */
function score(listing: Listing, query: string[]): number {
  if (query.length === 0) return 1;
  const description = new Set(words(listing.description));
  const path = new Set(words(new URL(listing.url.replace(/[{}]/g, "")).pathname));
  const provider = new Set(words(`${listing.provider.name} ${listing.provider.description ?? ""}`));
  const tags = new Set(listing.provider.tags.flatMap(words));
  let total = 0;
  for (const word of query) {
    if (description.has(word)) total += SCORE.description;
    if (path.has(word)) total += SCORE.path;
    if (provider.has(word)) total += SCORE.provider;
    if (tags.has(word)) total += SCORE.tag;
  }
  return total;
}

/** A listed resource with templates (`/prices/{coins}`) as a pattern that matches a filled-in URL. */
const templatePattern = (url: string) =>
  new RegExp(`^${url.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{[^}]+\\?\}/g, "[^/?#]+")}$`);

export type DiscoveryOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  /** Testnet: the demo seller's base URL; its `/listings` stand in for the catalog. */
  demoSellerUrl?: string | undefined;
};

export class Discovery {
  private readonly cache = new Map<string, { at: number; listings: Listing[] }>();
  private readonly inFlight = new Map<string, Promise<Listing[]>>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: DiscoveryOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** Origins called as they are: Kawase's own testnet demo seller, when one is configured. */
  get trustedOrigins(): string[] {
    const demo = originOf(this.options.demoSellerUrl);
    return demo ? [demo] : [];
  }

  /** The fetch sellers are called with (guard.ts); `base` answers in memory in tests, the URL rules still apply. */
  sellerFetch(base?: typeof fetch): typeof fetch {
    return sellerFetch({ trusted: this.trustedOrigins, base });
  }

  /** Every listing payable on this network (cached; one read at a time per network). */
  async all(network: NetworkContext): Promise<Listing[]> {
    const cached = this.cache.get(network.id);
    if (cached && this.now() - cached.at < X402_DISCOVERY_TTL_MS) return cached.listings;
    const running = this.inFlight.get(network.id);
    if (running) return running;
    const read = this.read(network)
      .then((listings) => {
        this.cache.set(network.id, { at: this.now(), listings });
        return listings;
      })
      .catch((error: unknown) => {
        // A failed refresh keeps serving the last good catalog.
        if (cached) return cached.listings;
        throw error;
      })
      .finally(() => this.inFlight.delete(network.id));
    this.inFlight.set(network.id, read);
    return read;
  }

  /** When the catalog for this network was last read (ms), or undefined before the first read. */
  readAt(network: NetworkContext): number | undefined {
    return this.cache.get(network.id)?.at;
  }

  /** One page; a 429 or a 5xx is retried a couple of times (Retry-After honoured, capped) before the read fails. */
  private async page(url: string): Promise<RawPage> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(X402_REQUEST_TIMEOUT_MS) });
      if (response.ok) return (await response.json()) as RawPage;
      const retryable = response.status === TOO_MANY_REQUESTS || response.status >= SERVER_ERROR;
      if (!retryable || attempt >= PAGE_RETRIES) throw new Error(`discovery answered ${response.status}`);
      const asked = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(asked) && asked > 0 ? Math.min(asked * MS_PER_SECOND, RETRY_WAIT_MAX_MS) : RETRY_WAIT_BASE_MS * BACKOFF ** attempt;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  private async read(network: NetworkContext): Promise<Listing[]> {
    const items: RawItem[] = [];
    if (!network.isRealMoney) {
      if (!this.options.demoSellerUrl) return [];
      items.push(...((await this.page(`${this.options.demoSellerUrl.replace(/\/$/, "")}/listings`)).items ?? []));
    } else {
      for (let offset = 0; ; offset += X402_DISCOVERY_PAGE) {
        const page = await this.page(`${X402_DISCOVERY_URL}?network=${caip2(network)}&limit=${X402_DISCOVERY_PAGE}&offset=${offset}`);
        items.push(...(page.items ?? []));
        const total = page.pagination?.total ?? 0;
        if ((page.items?.length ?? 0) < X402_DISCOVERY_PAGE || offset + X402_DISCOVERY_PAGE >= total) break;
      }
    }
    const seen = new Set<string>();
    const listings: Listing[] = [];
    for (const item of items) {
      const listing = toListing(item, network, this.trustedOrigins);
      if (!listing || seen.has(`${listing.method} ${listing.url}`)) continue;
      seen.add(`${listing.method} ${listing.url}`);
      listings.push(listing);
    }
    return listings;
  }

  /** Listings that match the words, best first (cheaper first among equals). */
  async search(
    network: NetworkContext,
    input: { query: string; categories?: readonly MarketplaceCategory[] | undefined; limit: number },
  ): Promise<{ listings: Listing[]; total: number }> {
    const query = words(input.query);
    const allowed = input.categories && input.categories.length > 0 ? new Set(input.categories) : undefined;
    const ranked = (await this.all(network))
      .filter((listing) => !allowed || allowed.has(listing.provider.category))
      .map((listing) => ({ listing, score: score(listing, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || (a.listing.price < b.listing.price ? -1 : a.listing.price > b.listing.price ? 1 : 0));
    return { listings: ranked.slice(0, input.limit).map((entry) => entry.listing), total: ranked.length };
  }

  /** The listing a URL belongs to: the same resource, or a template it fills in. */
  async find(network: NetworkContext, url: string, method = "GET"): Promise<Listing | undefined> {
    const listings = (await this.all(network)).filter((listing) => listing.method === method.toUpperCase());
    const bare = url.split("?")[0]!;
    return listings.find((listing) => listing.url === bare) ?? listings.find((listing) => listing.url.includes("{") && templatePattern(listing.url).test(bare));
  }
}
