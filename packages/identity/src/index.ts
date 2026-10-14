import { NETWORK_ADDRESSES, SHARED_ADDRESSES } from "@kawase/networks";

import { CHAIN_IDS, ENTITIES, chainKey, exchangeKey, payKey, providerKey, tokenKey, venueKey, walletKey, type Entity, type EntityKind, type MarkVariant } from "./registry";

export { ENTITIES, CHAIN_IDS, chainKey, exchangeKey, payKey, providerKey, tokenKey, venueKey, walletKey } from "./registry";
export type { Entity, EntityKind, MarkVariant } from "./registry";

const byId = new Map(ENTITIES.map((entity) => [entity.id, entity]));

export const getEntity = (id: string): Entity | undefined => byId.get(id);
export const getChainIdentity = (chainId: number): Entity | undefined => byId.get(chainKey(chainId));
export const getTokenIdentity = (chainId: number, address: string): Entity | undefined => byId.get(tokenKey(chainId, address));
export const getProviderIdentity = (slug: string): Entity | undefined => byId.get(providerKey(slug));
export const getVenueIdentity = (slug: string): Entity | undefined => byId.get(venueKey(slug));
export const getExchangeIdentity = (slug: string): Entity | undefined => byId.get(exchangeKey(slug));
export const getWalletIdentity = (slug: string): Entity | undefined => byId.get(walletKey(slug));
export const getPayIdentity = (slug: string): Entity | undefined => byId.get(payKey(slug));
export const entitiesOfKind = (kind: EntityKind): Entity[] => ENTITIES.filter((entity) => entity.kind === kind);

/** The home network's ids per environment: the chain and its two stablecoins (balance card, receipts, receive). */
export const arcIdentity = (environment: "mainnet" | "testnet") => {
  const chainId = environment === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet;
  return {
    chain: chainKey(chainId),
    usdc: tokenKey(chainId, SHARED_ADDRESSES.usdc),
    eurc: tokenKey(chainId, NETWORK_ADDRESSES[environment].eurc),
  };
};

/** The file stem for a variant, falling back to colour, or undefined when nothing has been delivered. */
export const markFile = (entity: Entity, variant: MarkVariant): string | undefined => entity.marks[variant] ?? entity.marks.color;

const INITIALS_MAX = 2;
/** What the neutral fallback disc shows: the symbol, or the first letters of the name. */
export const fallbackLabel = (entity: Pick<Entity, "name" | "symbol">): string =>
  entity.symbol ?? entity.name.split(/\s+/).map((word) => word[0] ?? "").join("").slice(0, INITIALS_MAX).toUpperCase();

const SHORT_LABEL = 2;
const LABEL_RATIO_SHORT = 0.34;
const LABEL_RATIO_LONG = 0.22;
/** Font size for the fallback label so a symbol like USDC still fits the disc. */
export const fallbackFontSize = (label: string, size: number): number =>
  Math.round(size * (label.length <= SHORT_LABEL ? LABEL_RATIO_SHORT : LABEL_RATIO_LONG));
