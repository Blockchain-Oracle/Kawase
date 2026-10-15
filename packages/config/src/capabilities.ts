import type { NetworkId } from "@kawase/networks";

/**
 * What Kawase can do on each network, as shipped (`CAPABILITIES` below is the target gated by what has shipped). A capability can be switched off at runtime per network
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
  | "payment_links"
  | "margin"
  | "buy"
  | "memory"
  | "lend";

/** Where each capability will exist once its stage has shipped (the product plan, not the current build). */
const TARGET: Record<CapabilityId, Record<NetworkId, CapabilityState>> = {
  send: { mainnet: "available", testnet: "available" },
  request: { mainnet: "available", testnet: "available" },
  contacts: { mainnet: "available", testnet: "available" },
  swap: { mainnet: "available", testnet: "available" },
  bridge: { mainnet: "available", testnet: "available" },
  // App Kit Earn lists Morpho vaults on Arc and mock Morpho vaults on Arc Testnet (checked 2026-10-01).
  yield: { mainnet: "available", testnet: "available" },
  automations: { mainnet: "available", testnet: "available" },
  // Circle's x402 catalog has mainnet listings only (D14 research); testnet pays Kawase's own demo seller (apps/x402-seller).
  marketplace: { mainnet: "available", testnet: "available" },
  voice: { mainnet: "available", testnet: "available" },
  // Test money is a testnet thing by definition.
  faucet: { mainnet: "unavailable", testnet: "available" },
  payment_links: { mainnet: "available", testnet: "available" },
  // Kawase Margin needs Aave V4, which is on Arc mainnet only (no testnet deployment, 2026-10-02).
  margin: { mainnet: "available", testnet: "unavailable" },
  // Circle Onramp Kit: production on mainnet, Circle's sandbox (test cards) on testnet (docs.arc.io onramp hosting requirements).
  buy: { mainnet: "available", testnet: "available" },
  // Memory, conversation search, For you, Arc knowledge and the insight cards (A5): no chain needed.
  memory: { mainnet: "available", testnet: "available" },
  // Earning and borrowing directly on Aave V4, which is on Arc mainnet only.
  lend: { mainnet: "available", testnet: "unavailable" },
};

/**
 * The capabilities whose stage has actually shipped. Add an id in the commit that ships it (send in Stage 5,
 * swap and bridge in Stage 6, …). Until then it reports "coming" wherever the target says "available", so
 * neither the app nor the agent is ever told that something unbuilt can be done.
 */
export const SHIPPED_CAPABILITIES: ReadonlySet<CapabilityId> = new Set<CapabilityId>(["faucet", "send", "contacts", "request", "payment_links", "swap", "bridge", "yield", "automations", "voice", "marketplace", "margin", "buy", "memory", "lend"]);

const shippedState = (id: CapabilityId, state: CapabilityState): CapabilityState =>
  state === "available" && !SHIPPED_CAPABILITIES.has(id) ? "coming" : state;

export const CAPABILITIES = Object.fromEntries(
  (Object.entries(TARGET) as [CapabilityId, Record<NetworkId, CapabilityState>][]).map(([id, byNetwork]) => [
    id,
    { mainnet: shippedState(id, byNetwork.mainnet), testnet: shippedState(id, byNetwork.testnet) },
  ]),
) as Record<CapabilityId, Record<NetworkId, CapabilityState>>;
