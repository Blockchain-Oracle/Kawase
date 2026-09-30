import type { NetworkId } from "@kawase/networks";

/**
 * What Kawase can do on each network, as shipped. A capability can be switched off at runtime per network
 * (`capability_overrides`) without a deploy; the agent reads the merged view before it proposes anything (D15).
 * "coming" is shown to the user as not yet available, "unavailable" is hidden.
 */
export type CapabilityState = "available" | "coming" | "unavailable";

export type CapabilityId =
  | "send"
  | "request"
  | "contacts"
  | "swap"
  | "bridge"
  | "yield"
  | "automations"
  | "marketplace"
  | "voice"
  | "faucet"
  | "payment_links";

export const CAPABILITIES: Record<CapabilityId, Record<NetworkId, CapabilityState>> = {
  send: { mainnet: "available", testnet: "available" },
  request: { mainnet: "available", testnet: "available" },
  contacts: { mainnet: "available", testnet: "available" },
  swap: { mainnet: "available", testnet: "available" },
  bridge: { mainnet: "available", testnet: "available" },
  yield: { mainnet: "coming", testnet: "coming" },
  automations: { mainnet: "available", testnet: "available" },
  // Circle's x402 catalog has mainnet listings only (D14 research).
  marketplace: { mainnet: "available", testnet: "unavailable" },
  voice: { mainnet: "available", testnet: "available" },
  // Test money is a testnet thing by definition.
  faucet: { mainnet: "unavailable", testnet: "available" },
  payment_links: { mainnet: "available", testnet: "available" },
};
