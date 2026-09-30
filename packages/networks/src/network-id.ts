/** The two Arc networks Kawase supports (D2). There is intentionally no third value. */
export const NETWORK_IDS = ["mainnet", "testnet"] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

/** New users, and any missing or corrupt setting, default to testnet (fail toward safety). */
export const DEFAULT_NETWORK_ID: NetworkId = "testnet";

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && (NETWORK_IDS as readonly string[]).includes(value);
}
