// What Kawase does, as the landing presents it: the product areas of the approved plan (2026-10-02, "everything on
// Arc"), each tied to a capability id. The state of each card comes from the registry the app and the agent read
// (`CAPABILITIES`, packages/config); an id the registry does not list yet is "coming" on both networks. So nothing
// unshipped is ever shown as shipped, and a card flips by itself when its id ships in capabilities.ts.
import { CAPABILITIES, CAPABILITY_SCOPE, type CapabilityId, type CapabilityState } from "@kawase/config";
import { CHAIN_IDS, arcIdentity, chainKey, providerKey } from "@kawase/identity";
import type { NetworkId } from "@kawase/networks";

/** Areas of the plan without a registry id yet (rename here if capabilities.ts picks other ids). */
export const PLANNED_AREAS = ["tokens", "meme_coins", "perps", "buy", "borrow", "withdraw", "export_wallet"] as const;
export type AreaId = CapabilityId | (typeof PLANNED_AREAS)[number];

export const NETWORKS: readonly NetworkId[] = ["mainnet", "testnet"];

const registry = CAPABILITIES as Record<string, Record<NetworkId, CapabilityState> | undefined>;

export function areaState(id: AreaId, network: NetworkId): CapabilityState {
  return registry[id]?.[network] ?? "coming";
}

/** Shipped somewhere = available on at least one network. */
export const isShipped = (id: AreaId) => NETWORKS.some((network) => areaState(id, network) === "available");

/** The first thing the registry says runs today, for shipped capabilities only. */
export function todayLine(id: AreaId): string | undefined {
  if (!(id in CAPABILITIES) || !isShipped(id)) return undefined;
  return CAPABILITY_SCOPE[id as CapabilityId]?.supports[0];
}

export const STATE_LABEL: Record<CapabilityState, string> = {
  available: "Available",
  coming: "Coming",
  unavailable: "Not on this network",
};

const arc = arcIdentity("mainnet");
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
  apple: providerKey("apple"),
  google: providerKey("google"),
  kawase: providerKey("kawase"),
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
};

/** Ordered so the three-column bento tiles without gaps (wide = two columns). */
export const AREAS: readonly Area[] = [
  {
    id: "send",
    title: "Send, receive, request",
    body: "Pay a saved contact, an @handle or any address in dollars or euros, and share a link to get paid.",
    marks: ["usdc", "eurc"],
    wide: true,
  },
  {
    id: "swap",
    title: "Swap",
    body: "Trade between USDC and EURC at a quoted minimum, approved with one Face ID.",
    marks: ["usdc", "eurc"],
  },
  {
    id: "meme_coins",
    title: "Meme coins",
    body: "Trending and new tokens on Arc, with copycat and safety checks and caps you set.",
  },
  {
    id: "perps",
    title: "Long and short",
    body: "Open a long or short position with take-profit and stop-loss, funded straight from your wallet.",
    partners: ["Hibachi", "edgeX"],
    wide: true,
  },
  {
    id: "buy",
    title: "Buy with Apple Pay or card",
    body: "Circle's Onramp Kit: a debit card, Apple Pay or Google Pay, straight into USDC on Arc.",
    marks: ["apple", "google", "circle"],
  },
  {
    id: "tokens",
    title: "Any token on Arc",
    body: "Every token your address holds, with its real mark, its value and the same actions as dollars.",
    marks: ["arc"],
  },
  {
    id: "withdraw",
    title: "Withdraw anywhere",
    body: "To your own address on another chain, an exchange that takes Arc deposits, or a friend.",
  },
  {
    id: "bridge",
    title: "Bridges, compared",
    body: "Move money between Arc and six chains; routes are ranked by the amount that actually arrives.",
    marks: ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"],
    partners: ["CCTP", "Across", "Relay"],
    wide: true,
  },
  {
    id: "yield",
    title: "Earn",
    body: "Put idle dollars to work in vaults on Arc, compared by what you can withdraw today.",
    marks: ["morpho"],
    partners: ["Aave V4"],
  },
  {
    id: "borrow",
    title: "Borrow",
    body: "Borrow dollars against cirBTC, WETH or EURC, with a health gauge and liquidation alerts.",
    partners: ["Aave V4", "Morpho"],
  },
  {
    id: "automations",
    title: "Automations",
    body: "Scheduled sends, Auto-save and rules that act on their own, each one bounded on chain.",
    wide: true,
  },
  {
    id: "marketplace",
    title: "x402 marketplace",
    body: "Pay AI services per call over x402, inside a budget you set.",
  },
  {
    id: "contacts",
    title: "Contacts and @handles",
    body: "Names instead of addresses, a hold when an address changes, and look-alike warnings.",
  },
  {
    id: "voice",
    title: "Voice",
    body: "Speak in your language; Kawase answers aloud and shows the same cards as chat.",
  },
];
