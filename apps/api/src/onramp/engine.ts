// Where Onramp sessions come from: Circle's Onramp Kit server SDK (@circle-fin/onramp-kit/server). Mainnet mints with
// the LIVE key against production; testnet with the TEST key against Circle's Onramp sandbox. The keys never leave
// the server; the app receives only the widget URL (a short-lived session token inside it). Tests get `noOnramp`.
import { createOnrampServerKit } from "@circle-fin/onramp-kit/server";

import { ONRAMP } from "@kawase/config";
import type { ApiEnv } from "@kawase/env";
import type { NetworkId } from "@kawase/networks";

export type OnrampMintInput = {
  appUserId: string;
  destinationAddress: string;
  asset: string;
  amount?: string | undefined;
  currency?: string | undefined;
  email?: string | undefined;
  metadata: Record<string, unknown>;
};

export type OnrampEngine = {
  configured(network: NetworkId): boolean;
  mint(network: NetworkId, input: OnrampMintInput): Promise<{ widgetUrl: string; expiresAt: string; traceId: string }>;
};

type Kit = ReturnType<typeof createOnrampServerKit>;

export function circleOnramp(env: ApiEnv): OnrampEngine {
  const kits = new Map<NetworkId, Kit>();
  // Only for an iframe on our own page; the app opens the widget top level, where the kit says to leave it out.
  const referrer = env.ONRAMP_REFERRER_DOMAIN ? { referrerDomain: env.ONRAMP_REFERRER_DOMAIN } : {};
  if (env.CIRCLE_LIVE_API_KEY) kits.set("mainnet", createOnrampServerKit({ apiKey: env.CIRCLE_LIVE_API_KEY, ...referrer }));
  if (env.CIRCLE_TEST_API_KEY)
    kits.set("testnet", createOnrampServerKit({ apiKey: env.CIRCLE_TEST_API_KEY, baseUrl: ONRAMP.sandbox.apiBaseUrl, widgetBaseUrl: ONRAMP.sandbox.widgetBaseUrl, ...referrer }));
  return {
    configured: (network) => kits.has(network),
    mint: async (network, input) => {
      const kit = kits.get(network);
      if (!kit) throw new Error(`onramp is not configured on ${network}`);
      const session = await kit.createSession({
        appUserId: input.appUserId,
        destinationAddress: input.destinationAddress,
        destinationChain: ONRAMP.chain,
        assets: { pairs: [{ token: input.asset, chain: ONRAMP.chain }] },
        metadata: input.metadata,
        ...(input.amount ? { amount: input.amount } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.email ? { email: input.email } : {}),
      });
      return { widgetUrl: session.widgetUrl, expiresAt: session.expiresAt, traceId: session.traceId };
    },
  };
}

export const noOnramp: OnrampEngine = {
  configured: () => false,
  mint: () => Promise.reject(new Error("onramp is not configured")),
};
