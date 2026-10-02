// The rows of the availability matrix. Every capability in the registry (`CAPABILITIES`, packages/config) comes first
// in product order; then the areas of the approved product plan (2026-10-02: everything on Arc) that the registry
// does not list yet. An area missing from the registry is "coming" on both networks until its id is added to
// capabilities.ts and shipped there, so the docs never call anything shipped before the app and the agent do.
// Account features that are not agent capabilities (the agent never proposes them) carry their state here, each with
// the commit that shipped it.
import { CAPABILITIES, CAPABILITY_SCOPE, type CapabilityId, type CapabilityState } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";
import { CATALOGS, type CatalogLocale } from "@kawase/i18n";

import { getMessages } from "./messages";

/** Product areas the plan commits to that have no registry id yet. Rename here if capabilities.ts picks other ids. */
export const PLANNED_AREAS = ["withdraw"] as const;
/** Shipped account features outside the registry: Settings → Account → Export wallet (B2, commit ea8b10b). */
const ACCOUNT_AREAS = {
  export_wallet: { mainnet: "available", testnet: "available" },
} as const satisfies Record<string, Record<NetworkId, CapabilityState>>;
export type PlannedArea = (typeof PLANNED_AREAS)[number] | keyof typeof ACCOUNT_AREAS;
export type AreaId = CapabilityId | PlannedArea;

/** Reading order of the matrix; registry ids not listed here are appended, so a new capability is never hidden. */
const ORDER: readonly AreaId[] = [
  "send",
  "request",
  "payment_links",
  "contacts",
  "swap",
  "margin",
  "buy",
  "bridge",
  "withdraw",
  "yield",
  "lend",
  "automations",
  "marketplace",
  "voice",
  "memory",
  "faucet",
  "export_wallet",
];

export const NETWORK_ORDER: readonly NetworkId[] = ["mainnet", "testnet"];

const registry = { ...CAPABILITIES, ...ACCOUNT_AREAS } as Record<string, Record<NetworkId, CapabilityState> | undefined>;

export const isInRegistry = (id: string): id is CapabilityId => id in CAPABILITIES;

export const AREAS: readonly AreaId[] = [
  ...ORDER.filter((id) => registry[id] !== undefined || (PLANNED_AREAS as readonly string[]).includes(id)),
  ...(Object.keys(CAPABILITIES) as CapabilityId[]).filter((id) => !ORDER.includes(id)),
];

export function areaState(id: AreaId, network: NetworkId): CapabilityState {
  return registry[id]?.[network] ?? "coming";
}

export function areaLabel(id: AreaId, lang: string): string {
  // Registry capabilities use the app's own catalog label, so the docs and the app name them the same way.
  const catalog = CATALOGS[(lang in CATALOGS ? lang : "en") as CatalogLocale];
  const appLabel = (catalog.capability as Record<string, string | undefined>)[id];
  if (appLabel) return appLabel;
  return (getMessages(lang).areas as Record<string, string | undefined>)[id] ?? id;
}

export const scopeOf = (id: AreaId) => (isInRegistry(id) ? CAPABILITY_SCOPE[id] : undefined);
