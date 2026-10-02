// Reads the api's public aggregate counts (`GET /public/stats`, apps/api/src/public). Server-side only; the result is
// cached for a minute like the api's own cache, and any failure becomes `null` so the page can say so honestly.
import { links } from "./links";

export type PublicActionKind = "send" | "swap" | "bridge" | "earn";
export type NetworkStats = {
  completed: Record<PublicActionKind, number>;
  automationRuns: number;
  activeAutomations: number;
};
export type PublicStats = {
  networks: { mainnet: NetworkStats; testnet: NetworkStats };
  accounts: number;
  guests: number;
  generatedAt: string;
};

/** Seconds Next keeps a fetched copy, matching the api's PUBLIC_STATS_CACHE_MS. */
export const STATS_REVALIDATE_S = 60;

const isStats = (value: unknown): value is PublicStats =>
  typeof value === "object" &&
  value !== null &&
  "networks" in value &&
  "accounts" in value &&
  typeof (value as PublicStats).generatedAt === "string";

export async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const response = await fetch(`${links.api}/public/stats`, { next: { revalidate: STATS_REVALIDATE_S } });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isStats(body) ? body : null;
  } catch {
    return null;
  }
}
