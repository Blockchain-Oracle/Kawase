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

const scopeOf = (id: AreaId) => (id in CAPABILITIES ? CAPABILITY_SCOPE[id as CapabilityId] : undefined);

/** The first thing the registry says runs today, for shipped capabilities only. */
export function todayLine(id: AreaId): string | undefined {
  return isShipped(id) ? scopeOf(id)?.supports[0] : undefined;
}

/** The first thing the registry says is not built yet, so a shipped card never reads broader than it is. */
export const nextLine = (id: AreaId): string | undefined => scopeOf(id)?.notYet[0];

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
  /** Its page on the docs site. */
  docs: string;
};

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
    title: "Swap",
    body: "Trade at a quoted minimum you see before you approve, with one Face ID.",
    marks: ["usdc", "eurc"],
  },
  {
    id: "meme_coins",
    docs: "/docs/features/swap-and-trade",
    title: "Meme coins",
    body: "Trending and new tokens on Arc, with copycat and safety checks and caps you set.",
  },
  {
    id: "perps",
    docs: "/docs/features/swap-and-trade",
    title: "Long and short",
    body: "Open a long or short position with take-profit and stop-loss, funded straight from your wallet.",
    partners: ["Hibachi", "edgeX"],
    wide: true,
  },
  {
    id: "buy",
    docs: "/docs/features/buy",
    title: "Buy with Apple Pay or card",
    body: "Circle's Onramp Kit: a debit card, Apple Pay or Google Pay, straight into USDC on Arc.",
    marks: ["apple", "google", "circle"],
  },
  {
    id: "tokens",
    docs: "/docs/features/swap-and-trade",
    title: "Any token on Arc",
    body: "Every token your address holds, with its real mark, its value and the same actions as dollars.",
    marks: ["arc"],
  },
  {
    id: "withdraw",
    docs: "/docs/features/bridge-and-withdraw",
    title: "Withdraw anywhere",
    body: "To your own address on another chain, an exchange that takes Arc deposits, or a friend.",
  },
  {
    id: "bridge",
    docs: "/docs/features/bridge-and-withdraw",
    title: "Bridges, compared",
    body: "Move money between Arc and other chains, with the bridges quoted side by side by what actually arrives.",
    marks: ["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"],
    partners: ["CCTP", "Across", "Relay"],
    wide: true,
  },
  {
    id: "yield",
    docs: "/docs/features/earn-and-borrow",
    title: "Earn",
    body: "Put idle dollars to work across Arc protocols, compared by yield and by what you can withdraw today.",
    marks: ["morpho"],
    partners: ["Aave V4"],
  },
  {
    id: "borrow",
    docs: "/docs/features/earn-and-borrow",
    title: "Borrow",
    body: "Borrow dollars against cirBTC, WETH or EURC, with a health gauge and liquidation alerts.",
    partners: ["Aave V4", "Morpho"],
  },
  {
    id: "automations",
    docs: "/docs/features/automations",
    title: "Automations",
    body: "Scheduled sends, Auto-save and rules that act on their own, each one bounded on chain.",
    wide: true,
  },
  {
    id: "marketplace",
    docs: "/docs/features/marketplace",
    title: "x402 marketplace",
    body: "Pay AI services per call over x402, inside a budget you set.",
  },
  {
    id: "contacts",
    docs: "/docs/features/contacts-and-handles",
    title: "Contacts and @handles",
    body: "Names instead of addresses, a hold when an address changes, and look-alike warnings.",
  },
  {
    id: "export_wallet",
    docs: "/docs/withdraw-without-kawase",
    title: "Your money without Kawase",
    body: "Export your wallet with Face ID and use it in any other wallet, so your money never depends on the app.",
  },
];
