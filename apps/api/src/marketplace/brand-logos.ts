// The brands behind the catalog's tools, for the ones the identity registry has no mark for yet: most of the catalog is
// resold (Orthogonal, AIsa) under the brand's own name ("Tavily", "Apollo"), and the reseller's page carries only its
// own logo. Each brand's site was checked by its homepage title on 2026-10-15 (bytemine.io is a trading tool, so
// Bytemine is bytemine.ai; fundable.com is a fundraising site, so Fundable's data API is tryfundable.ai). The logo is
// the brand's own site icon, fetched by Kawase's api and served from it (logo-routes.ts), never by the app from a third
// party, and only for a domain in this map, so the route is no open proxy.
const BRAND_DOMAINS: Readonly<Record<string, string>> = {
  tikhub: "tikhub.io",
  dataforseo: "dataforseo.com",
  lonestaroracle: "lonestaroracle.xyz",
  apollo: "apollo.io",
  agentmail: "agentmail.to",
  "context.dev": "context.dev",
  "brand.dev": "context.dev",
  aviato: "aviato.co",
  coresignal: "coresignal.com",
  tomba: "tomba.io",
  coingecko: "coingecko.com",
  bytemine: "bytemine.ai",
  precip: "precip.ai",
  predictleads: "predictleads.com",
  instagram: "instagram.com",
  serper: "serper.dev",
  icypeas: "icypeas.com",
  "open-meteo": "open-meteo.com",
  findymail: "findymail.com",
  notte: "notte.cc",
  "captain data": "captaindata.com",
  contactout: "contactout.com",
  "people data labs": "peopledatalabs.com",
  scrapegraphai: "scrapegraphai.com",
  olostep: "olostep.com",
  tavily: "tavily.com",
  companyenrich: "companyenrich.com",
  reddit: "reddit.com",
  rocketreach: "rocketreach.co",
  "ocean.io": "ocean.io",
  openmart: "openmart.ai",
  tako: "trytako.com",
  foreplay: "foreplay.co",
  pinterest: "pinterest.com",
  twitter: "x.com",
  agentphone: "agentphone.to",
  waveinflu: "waveinflu.com",
  riveter: "riveter.ai",
  "influencers club": "influencers.club",
  didit: "didit.me",
  fundable: "tryfundable.ai",
  ahrefs: "ahrefs.com",
  byteplus: "byteplus.com",
  edinet: "disclosure2.edinet-fsa.go.jp",
  crustdata: "crustdata.com",
  "fantastic.jobs": "fantastic.jobs",
  baseten: "baseten.co",
  voygr: "voygr.tech",
  seltz: "seltz.ai",
  andi: "andisearch.com",
  linkup: "linkup.so",
  fiber: "fiber.ai",
  scrapecreators: "scrapecreators.com",
  edges: "edges.io",
  nyne: "nyne.ai",
  anthropic: "anthropic.com",
  "cnpjá": "cnpja.com",
  openai: "openai.com",
  openfunnel: "openfunnel.dev",
  sixtyfour: "sixtyfour.ai",
  happenstance: "happenstance.ai",
};

const KNOWN = new Set(Object.values(BRAND_DOMAINS));
/** Longest names first, so "People Data Labs" wins over a shorter brand that starts the same. */
const NAMES = Object.keys(BRAND_DOMAINS).sort((a, b) => b.length - a.length);

/** The brand's domain for a tool's name ("Serper Scrape" → serper.dev, "OpenAI Web Search" → openai.com), if known. */
export function brandDomain(toolName: string): string | null {
  const name = toolName.trim().toLowerCase();
  const hit = NAMES.find((brand) => name === brand || name.startsWith(`${brand} `));
  return hit ? BRAND_DOMAINS[hit]! : null;
}

/** Only these domains are fetched (the logo route is no open proxy). */
export const isBrandDomain = (domain: string) => KNOWN.has(domain);

/** Google's site-icon service returns a site's best icon at the size asked (its own large icon when the site has one). */
const ICON_SOURCE = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
const ICON_TTL_MS = 86_400_000;
const ICON_TIMEOUT_MS = 6_000;
const icons = new Map<string, { body: ArrayBuffer; type: string; at: number }>();

/** A brand's icon, read once a day per domain and kept in memory (a few dozen small PNGs). */
export async function brandIcon(domain: string, now = Date.now()): Promise<{ body: ArrayBuffer; type: string } | null> {
  if (!isBrandDomain(domain)) return null;
  const kept = icons.get(domain);
  if (kept && now - kept.at < ICON_TTL_MS) return kept;
  try {
    const response = await fetch(ICON_SOURCE(domain), { signal: AbortSignal.timeout(ICON_TIMEOUT_MS) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return kept ?? null;
    const fresh = { body: await response.arrayBuffer(), type, at: now };
    icons.set(domain, fresh);
    return fresh;
  } catch {
    return kept ?? null;
  }
}
