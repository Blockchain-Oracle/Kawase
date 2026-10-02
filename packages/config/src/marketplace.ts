// The x402 marketplace (cards/marketplace.md, decision X29): a per-user agent wallet (a Circle developer-controlled
// EOA per network) funded by a capped marketplace grant, paying services over x402 on both rails (Circle Gateway
// nanopayments and plain EIP-3009). Every number the policy, the agent and the screens use lives here.
import type { NetworkId } from "@kawase/networks";

import { usdc } from "./units";

export type MarketplaceDefaults = {
  /** The most the agent may spend on services in one day (the person can change it on the Agent wallet page). */
  dailyBudget: bigint;
  /** Above this one call needs the person's yes on a consent card. */
  perCallCap: bigint;
  /** The most the marketplace grant lets Kawase move into the agent wallet per day (on chain). */
  grantPerDay: bigint;
  /** Presets on the "Top up your agent wallet" card and page. */
  topUpPresets: readonly bigint[];
};

/** Sources: the x402 fact sheet (median listing $0.10, useful money data $0.002–0.0085); judgment calls, not benchmarks. */
export const MARKETPLACE_DEFAULTS: Record<NetworkId, MarketplaceDefaults> = {
  mainnet: {
    dailyBudget: usdc("1"),
    perCallCap: usdc("0.05"),
    grantPerDay: usdc("5"),
    topUpPresets: [usdc("1"), usdc("2"), usdc("5")],
  },
  testnet: {
    dailyBudget: usdc("5"),
    perCallCap: usdc("0.5"),
    grantPerDay: usdc("20"),
    topUpPresets: [usdc("1"), usdc("2"), usdc("5")],
  },
};

/** The person can never set a budget above these without the grant itself being raised (the chain's own cap). */
export const MARKETPLACE_MAX_DAILY_BUDGET = usdc("50");
export const MARKETPLACE_MAX_PER_CALL = usdc("5");

/**
 * USDC kept on hand in the agent wallet for its own gas (Arc's gas token is USDC): an approve, a deposit, a mint and
 * a transfer cost well under a cent each on Arc.
 */
export const AGENT_WALLET_GAS_RESERVE = usdc("0.02");
/**
 * Arc's Gateway burn fee is $0.0035 (gateway.md §Fees; measured on a testnet withdrawal 2026-10-02: value + 0.0035 left
 * the balance); same-chain withdrawals carry no transfer fee. A withdrawal first tries to leave exactly the fee, then
 * falls back to leaving the cap.
 */
export const GATEWAY_BURN_FEE = usdc("0.0035");
export const GATEWAY_WITHDRAW_MAX_FEE = usdc("0.01");
/** The gas one USDC transfer from the agent wallet costs on Arc, kept back when it returns what is on hand. */
export const AGENT_WALLET_RETURN_GAS = usdc("0.005");
/** Smallest Gateway deposit worth making (anything below stays on hand for gas). */
export const GATEWAY_MIN_DEPOSIT = usdc("0.05");

/** Circle's x402 catalog (no key). `limit` ≤ 200; `query` searches server-side (checked 2026-10-02). */
export const X402_DISCOVERY_URL = "https://api.circle.com/v2/x402/discovery/resources";
export const X402_DISCOVERY_PAGE = 200;
/** The catalog changes slowly; one read per network serves every person for this long. */
export const X402_DISCOVERY_TTL_MS = 10 * 60 * 1000;
/** Search results the agent sees at once. */
export const X402_SEARCH_LIMIT = 8;

/** A seller's answer is untrusted data: only this much is kept, and only text or JSON. */
export const X402_RESPONSE_MAX_BYTES = 64 * 1024;
/** What the model reads of it (quarantined). */
export const X402_RESPONSE_PREVIEW_CHARS = 6_000;
/** A seller that does not answer in this long is given up on. */
export const X402_REQUEST_TIMEOUT_MS = 20_000;
/** Gateway nanopayment authorizations must stay valid at least 7 days (live `/v1/x402/supported`). */
export const X402_GATEWAY_MIN_VALIDITY_S = 604_800;

/** Categories in the catalog (provider metadata), as the person sees and filters them. */
export const MARKETPLACE_CATEGORIES = [
  "SOCIAL",
  "SEARCH",
  "FINANCIAL",
  "DATA",
  "INFRASTRUCTURE",
  "PREDICTION",
  "CREATIVE",
  "OTHER",
] as const;
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

/** Catalog category strings → the categories above. */
export function marketplaceCategory(raw: string | undefined): MarketplaceCategory {
  const value = (raw ?? "").toUpperCase();
  if (value.includes("SOCIAL")) return "SOCIAL";
  if (value.includes("SEARCH") || value.includes("RESEARCH")) return "SEARCH";
  if (value.includes("FINANC") || value.includes("DEFI") || value.includes("MARKET_DATA")) return "FINANCIAL";
  if (value.includes("PREDICTION")) return "PREDICTION";
  if (value.includes("ENRICH") || value.includes("DATA")) return "DATA";
  if (value.includes("INFRA")) return "INFRASTRUCTURE";
  if (value.includes("CREATIVE") || value.includes("MEDIA") || value.includes("IMAGE")) return "CREATIVE";
  return "OTHER";
}
