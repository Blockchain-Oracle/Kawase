// The engines behind buying inside Kawase (D42). Two providers run the card/ID step the law leaves to a licensed
// party; everything around it is ours:
//   circle   Circle's Onramp Kit (Transak + Socure underneath): Arc USDC/EURC delivered directly. The widget is mounted
//            on Kawase's own buy page. Mainnet mints with the LIVE key against production, testnet with the TEST key
//            against the sandbox.
//   coinbase Coinbase's server Order API (guest checkout, Apple Pay / Google Pay): USDC delivered to Base, then
//            Kawase's Bring-to-Arc leg (CCTP) carries it on, as one order.
// An engine never settles an order: the money seen arriving on chain does (service.ts). The router below is what the
// api holds (`deps.onramp`): it lists the engines, picks one per purchase and forwards the provider-specific calls.
// The keys never leave the server. Tests get `noOnramp`.
import type { ApiEnv } from "@kawase/env";
import type { NetworkId } from "@kawase/networks";

import { circleProvider } from "./circle";
import { cdpKeysFromEnv, coinbaseProvider, type CdpKeys } from "./coinbase";

export type OnrampEngineId = "circle" | "coinbase";
export type OnrampMethod = "apple_pay" | "google_pay" | "card" | "bank";

/** What a provider asks of the person before it sells (Coinbase): both contacts verified and the terms accepted. */
export type OnrampContact = {
  phone: string;
  email: string;
  smsVerificationId: string;
  emailVerificationId: string;
  agreementAcceptedAt: string;
};

export type OnrampMintInput = {
  appUserId: string;
  destinationAddress: string;
  asset: string;
  amount?: string | undefined;
  currency?: string | undefined;
  email?: string | undefined;
  metadata: Record<string, unknown>;
  method?: OnrampMethod | undefined;
  /** Circle: where the widget runs. "page" = an iframe on Kawase's buy page (referrerDomain set); "browser" = top level. */
  frame?: "page" | "browser" | undefined;
  /** Coinbase: the verified contact, the person's IP and language. */
  contact?: OnrampContact | undefined;
  clientIp?: string | undefined;
  locale?: string | undefined;
  /** Our order id (partner order reference). */
  orderId?: string | undefined;
};

export type OnrampQuote = {
  payTotal: string;
  payCurrency: string;
  receive: string;
  asset: string;
  fees: { type: "network" | "exchange"; amount: string; currency: string }[];
  rate: string;
};

export type OnrampSession = {
  engine: OnrampEngineId;
  /** Circle: the widget URL (a short-lived session token inside). Coinbase: the Apple Pay / Google Pay payment link. */
  widgetUrl: string;
  expiresAt: string;
  traceId: string;
  /** The provider's own id for the purchase (Coinbase's order id), when it has one at this point. */
  providerOrderId: string | null;
  /** The chain the session was minted to deliver to, as sent to the provider (Circle: "Arc"; Coinbase: "base"). */
  destinationChain: string;
  quote?: OnrampQuote | undefined;
};

/** The provider's own word on a purchase, reduced to what the order needs. */
export type ProviderOrderState = { state: "pending" | "processing" | "completed" | "failed"; txHash: string | null; raw: string; purchaseAmount: string | null };

export type VerificationChannel = "sms" | "email";

/** What one provider can do. Optional parts are the ones only some providers have. */
export type ProviderEngine = {
  readonly id: OnrampEngineId;
  /** Where it delivers. "base": the Bring-to-Arc leg follows. */
  readonly delivers: "arc" | "base";
  /** A guest limit the provider enforces, whole dollars a week. */
  readonly weeklyLimitUsd: number | null;
  configured(network: NetworkId): boolean;
  /** A sandbox delivers nothing real: an order made there can end as a test, never as money on chain. */
  sandbox(network: NetworkId): boolean;
  methods(network: NetworkId): OnrampMethod[];
  mint(network: NetworkId, input: OnrampMintInput): Promise<OnrampSession>;
  quote?(network: NetworkId, input: { amount: string; currency: string; asset: string; method: OnrampMethod; destinationAddress: string; appUserId: string }): Promise<OnrampQuote>;
  /** The provider's state for an order it created (polled; Circle's is the webhook and the chain instead). */
  orderState?(network: NetworkId, providerOrderId: string): Promise<ProviderOrderState>;
  verification?: {
    start(network: NetworkId, input: { channel: VerificationChannel; destination: string }): Promise<{ verificationId: string; expiresAt: string }>;
    submit(network: NetworkId, input: { verificationId: string; otpCode: string }): Promise<{ verificationId: string; verifiedUntil: string }>;
  };
};

export type OnrampEngineInfo = {
  id: OnrampEngineId;
  methods: OnrampMethod[];
  delivers: "arc" | "base";
  weeklyLimitUsd: number | null;
};

/** What the api holds: the engines configured on each network and the one to ask for each job. */
export type OnrampEngine = {
  /** Whether any engine can sell on this network. */
  configured(network: NetworkId): boolean;
  /** The engines that can sell here, Circle first. */
  engines(network: NetworkId): OnrampEngineInfo[];
  /** The engine a purchase uses: the one asked for when it is configured here, else the first (Circle). */
  pick(network: NetworkId, wanted?: OnrampEngineId | undefined): ProviderEngine | undefined;
  provider(id: OnrampEngineId): ProviderEngine | undefined;
  mint(network: NetworkId, input: OnrampMintInput & { engine?: OnrampEngineId | undefined }): Promise<OnrampSession>;
};

/** Builds the router over the providers given, in order of preference. */
export function onrampRouter(providers: ProviderEngine[]): OnrampEngine {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const here = (network: NetworkId) => providers.filter((provider) => provider.configured(network));
  const pick = (network: NetworkId, wanted?: OnrampEngineId) => {
    const open = here(network);
    return (wanted ? open.find((provider) => provider.id === wanted) : undefined) ?? open[0];
  };
  return {
    configured: (network) => here(network).length > 0,
    engines: (network) => here(network).map((provider) => ({ id: provider.id, methods: provider.methods(network), delivers: provider.delivers, weeklyLimitUsd: provider.weeklyLimitUsd })),
    pick,
    provider: (id) => byId.get(id),
    mint: async (network, input) => {
      const provider = pick(network, input.engine);
      if (!provider) throw new Error(`onramp is not configured on ${network}`);
      return provider.mint(network, input);
    },
  };
}

/** Circle only (the engine the api ran with before the second one). */
export function circleOnramp(env: ApiEnv): OnrampEngine {
  return onrampRouter([circleProvider(env)]);
}

/** Circle, and Coinbase when its CDP keys are present (CDP_API_KEY_ID + CDP_API_KEY_SECRET); without them there is no Coinbase. */
export function onrampEngines(env: ApiEnv, options: { cdp?: CdpKeys | undefined; fetch?: typeof fetch | undefined } = {}): OnrampEngine {
  const cdp = options.cdp ?? cdpKeysFromEnv();
  return onrampRouter([circleProvider(env), ...(cdp ? [coinbaseProvider({ keys: cdp, ...(options.fetch ? { fetch: options.fetch } : {}) })] : [])]);
}

export const noOnramp: OnrampEngine = onrampRouter([]);
