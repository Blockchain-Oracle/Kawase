// What Kawase does, as the landing presents it: the product areas of the approved plan (2026-10-02, "everything on
// Arc"), each tied to a capability id. The state of each card comes from the registry the app and the agent read
// (`CAPABILITIES`, packages/config); an id the registry does not list yet is "coming" on both networks. So nothing
// unshipped is ever shown as shipped, and a card flips by itself when its id ships in capabilities.ts. Account features
// the agent never proposes (export) carry their state here, with the commit that shipped them.
import { CAPABILITIES, CAPABILITY_SCOPE, type CapabilityId, type CapabilityState } from "@kawase/config";
import { CHAIN_IDS, ENTITIES, arcIdentity, chainKey, providerKey, venueKey } from "@kawase/identity";
import type { NetworkId } from "@kawase/networks";

/** Areas of the plan without a registry id yet (rename here if capabilities.ts picks other ids). */
export const PLANNED_AREAS = ["withdraw"] as const;
/** Shipped account features outside the registry: Settings → Account → Export wallet (B2, commit ea8b10b). */
const ACCOUNT_AREAS = {
  export_wallet: { mainnet: "available", testnet: "available" },
} as const satisfies Record<string, Record<NetworkId, CapabilityState>>;
export type AreaId = CapabilityId | (typeof PLANNED_AREAS)[number] | keyof typeof ACCOUNT_AREAS;

export const NETWORKS: readonly NetworkId[] = ["mainnet", "testnet"];

const registry = { ...CAPABILITIES, ...ACCOUNT_AREAS } as Record<
  string,
  Record<NetworkId, CapabilityState> | undefined
>;

export function areaState(id: AreaId, network: NetworkId): CapabilityState {
  return registry[id]?.[network] ?? "coming";
}

/** Shipped somewhere = available on at least one network. */
export const isShipped = (id: AreaId) => NETWORKS.some((network) => areaState(id, network) === "available");

const scopeOf = (id: AreaId) => (id in CAPABILITIES ? CAPABILITY_SCOPE[id as CapabilityId] : undefined);

/** A line the registry says runs today (the first, or the one a card names), for shipped capabilities only. */
export function todayLine(id: AreaId, index = 0): string | undefined {
  return isShipped(id) ? scopeOf(id)?.supports[index] : undefined;
}

/** The first thing the registry says is not built yet, so a shipped card never reads broader than it is. */
export const nextLine = (id: AreaId): string | undefined => scopeOf(id)?.notYet[0];

export const STATE_LABEL: Record<CapabilityState, string> = {
  available: "Available",
  coming: "Coming",
  unavailable: "Not on this network",
};

const arc = arcIdentity("mainnet");
/** Arc mainnet tokens with marks, found by symbol (Aave V4's reserves). */
const arcToken = (symbol: string) =>
  ENTITIES.find((entity) => entity.kind === "token" && entity.symbol === symbol)?.id ?? symbol;
export const ENTITY = {
  usdc: arc.usdc,
  eurc: arc.eurc,
  arc: arc.chain,
  ethereum: chainKey(CHAIN_IDS.ethereum),
  base: chainKey(CHAIN_IDS.base),
  arbitrum: chainKey(CHAIN_IDS.arbitrum),
  optimism: chainKey(CHAIN_IDS.optimism),
  polygon: chainKey(CHAIN_IDS.polygon),
  avalanche: chainKey(CHAIN_IDS.avalanche),
  circle: providerKey("circle"),
  morpho: providerKey("morpho"),
  aave: providerKey("aave"),
  apple: providerKey("apple"),
  google: providerKey("google"),
  kawase: providerKey("kawase"),
  kyberswap: venueKey("kyberswap"),
  lifi: venueKey("lifi"),
  across: venueKey("across"),
  relay: venueKey("relay"),
  cirbtc: arcToken("cirBTC"),
  weth: arcToken("WETH"),
} as const;
export type EntityName = keyof typeof ENTITY;

export type Area = {
  id: AreaId;
  title: string;
  body: string;
  /** Real marks of what it works with (tokens, chains, providers); text names where no mark exists. */
  marks?: EntityName[];
  partners?: string[];
  wide?: boolean;
  /** Which of the registry's "runs today" lines the card quotes (default: the first). */
  today?: number;
  /** The registry says this part runs on mainnet only (other tokens, meme coins). */
  mainnetOnly?: boolean;
  /** Its page on the docs site. */
  docs: string;
};

/** A card's state on one network, with its mainnet-only parts marked off testnet. */
export const cardState = (area: Area, network: NetworkId): CapabilityState =>
  area.mainnetOnly && network !== "mainnet" ? "unavailable" : areaState(area.id, network);

/** Ordered so the three-column bento tiles without gaps (wide = two columns). */
export const AREAS: readonly Area[] = [
  {
    id: "send",
    docs: "/docs/features/send-receive-request",
    title: "Send, receive, request",
    body: "Pay a saved contact, an @handle or any address in dollars or euros, and share a link to get paid.",
    marks: ["usdc", "eurc"],
    wide: true,
  },
  {
    id: "swap",
    docs: "/docs/features/swap-and-trade",
    title: "Trade any token",
    body: "Any pair at the best of three venues, the others shown, confirmed with one slide.",
    marks: ["kyberswap", "circle", "lifi"],
  },
  {
    id: "margin",
    docs: "/docs/features/long-short",
    title: "Long and short",
    body: "Kawase Margin: a leveraged long or short through your own Aave V4 account, opened as one transaction, with the liquidation price shown first.",
    marks: ["aave", "cirbtc", "weth"],
    wide: true,
  },
  {
    id: "swap",
    docs: "/docs/features/swap-and-trade",
    title: "Meme coins",
    body: "Trending and new tokens on Arc, with copycat and GoPlus checks and caps you set.",
    today: 2,
    mainnetOnly: true,
  },
  {
    id: "swap",
    docs: "/docs/features/swap-and-trade",
    title: "Markets and every token",
    body: "A page for any token on Arc, and every token your address holds on seven chains, impostors hidden.",
    marks: ["arc"],
    today: 3,
    mainnetOnly: true,
  },
  {
    id: "buy",
    docs: "/docs/features/buy",
    title: "Buy with a card",
    body: "Circle's Onramp, straight into USDC or EURC on Arc; Apple Pay and Google Pay where Circle offers them.",
    marks: ["apple", "google", "circle"],
  },
  {
    id: "withdraw",
    docs: "/docs/features/bridge-and-withdraw",
    title: "Withdraw anywhere",
    body: "One screen for every asset and destination: your own address on another chain, an exchange, or a friend.",
  },
  {
    id: "bridge",
    docs: "/docs/features/bridge-and-withdraw",
    title: "Bridges, compared",
    body: "USDC to anyone on six chains over the route that delivers most, and Bring to Arc with no gas on the other side.",
    marks: ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"],
    partners: ["CCTP", "Across", "Relay"],
    wide: true,
  },
  {
    id: "yield",
    docs: "/docs/features/earn-and-borrow",
    title: "Earn",
    body: "Yield options across Aave V4, Morpho vaults and Aero, ranked among those that could pay you back now.",
    marks: ["aave", "morpho"],
  },
  {
    id: "lend",
    docs: "/docs/features/earn-and-borrow",
    title: "Borrow",
    body: "Borrow against USDC, cirBTC or WETH on Aave V4, with a live health gauge and the liquidation price shown first.",
    marks: ["aave"],
  },
  {
    id: "request",
    docs: "/docs/features/business",
    title: "Business",
    body: "Invoices with an on-chain reference that marks them paid, batch payouts signed once, payroll bounded per person.",
    today: 1,
  },
  {
    id: "marketplace",
    docs: "/docs/features/marketplace",
    title: "Agent wallet (x402)",
    body: "Kawase buys answers per call from its own wallet, inside a daily budget and a per-call cap you set.",
  },
  {
    id: "automations",
    docs: "/docs/features/automations",
    title: "Automations",
    body: "Scheduled payments, Auto-save, payroll, DCA and rules, each bounded on chain, with practice runs first and Needs you for the rest.",
    wide: true,
  },
  {
    id: "memory",
    docs: "/docs/features/memory-and-search",
    title: "Memory and search",
    body: "It remembers what you ask it to, searches every conversation, and answers questions about Arc with sources.",
  },
  {
    id: "contacts",
    docs: "/docs/features/contacts-and-handles",
    title: "Contacts and @handles",
    body: "Names instead of addresses, a hold when an address changes, and look-alike warnings.",
  },
  {
    id: "voice",
    docs: "/docs/features/voice",
    title: "Voice",
    body: "Talk to it on iPhone, Android or the web in your language; a payment by voice still waits for your tap.",
  },
  {
    id: "export_wallet",
    docs: "/docs/withdraw-without-kawase",
    title: "Your money without Kawase",
    body: "Export your recovery phrase with Face ID and use the same account in any wallet, so your money never depends on the app.",
  },
];
