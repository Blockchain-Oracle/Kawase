// Engine 1: Circle's Onramp Kit server SDK (@circle-fin/onramp-kit/server). Arc USDC / EURC arrive directly.
//
// Facts this file depends on (docs pack buy-market §2, checked against the installed 1.0.3 types):
// - `destinationChain` is a free string that Circle defaults to "Ethereum" when it is left out, so it is always sent.
//   Circle's sandbox accepts "Arc" and "arc" alike at mint (probed 2026-10-14); "Arc" is the display label, sent here.
//   The asset scoping (`assets.pairs`) keeps the widget to the Arc pair.
// - `referrerDomain` belongs to the kit, not the session: the bare host that serves the page the iframe sits on, sealed
//   into the session token. The kit says leave it out for a top-level window, so two kits are kept per network: one with
//   it for Kawase's buy page, one without for the system-browser sheet.
// - Card, Apple Pay and Google Pay in production need the domain in the entity's KYB `web_url`; the sandbox does not
//   enforce it. Sessions live 30 minutes.
import { createOnrampServerKit } from "@circle-fin/onramp-kit/server";

import { ONRAMP } from "@kawase/config";
import type { ApiEnv } from "@kawase/env";
import type { NetworkId } from "@kawase/networks";

import type { OnrampMethod, OnrampMintInput, OnrampSession, ProviderEngine } from "./engine";

/** What Circle is told the money is for: Arc, never its own default (Ethereum). */
export const CIRCLE_DESTINATION_CHAIN = "Arc";
const METHODS: OnrampMethod[] = ["apple_pay", "google_pay", "card", "bank"];

type Kit = ReturnType<typeof createOnrampServerKit>;
type Kits = { page: Kit; browser: Kit };

export function circleProvider(env: ApiEnv): ProviderEngine {
  const kits = new Map<NetworkId, Kits>();
  const make = (options: Parameters<typeof createOnrampServerKit>[0]): Kits => ({
    // The buy page iframes the widget: the kit's referrerDomain (our page's host) lets the nested frame be allowed.
    page: createOnrampServerKit({ ...options, ...(env.ONRAMP_REFERRER_DOMAIN ? { referrerDomain: env.ONRAMP_REFERRER_DOMAIN } : {}) }),
    browser: createOnrampServerKit(options),
  });
  if (env.CIRCLE_LIVE_API_KEY) kits.set("mainnet", make({ apiKey: env.CIRCLE_LIVE_API_KEY }));
  if (env.CIRCLE_TEST_API_KEY) kits.set("testnet", make({ apiKey: env.CIRCLE_TEST_API_KEY, baseUrl: ONRAMP.sandbox.apiBaseUrl, widgetBaseUrl: ONRAMP.sandbox.widgetBaseUrl }));
  return {
    id: "circle",
    delivers: "arc",
    weeklyLimitUsd: null,
    configured: (network) => kits.has(network),
    sandbox: (network) => network !== "mainnet",
    methods: () => METHODS,
    mint: async (network: NetworkId, input: OnrampMintInput): Promise<OnrampSession> => {
      const set = kits.get(network);
      if (!set) throw new Error(`onramp is not configured on ${network}`);
      const kit = input.frame === "browser" ? set.browser : set.page;
      const session = await kit.createSession({
        appUserId: input.appUserId,
        destinationAddress: input.destinationAddress,
        destinationChain: CIRCLE_DESTINATION_CHAIN,
        assets: { pairs: [{ token: input.asset, chain: ONRAMP.chain }] },
        metadata: input.metadata,
        ...(input.amount ? { amount: input.amount } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
        ...(input.email ? { email: input.email } : {}),
      });
      return { engine: "circle", widgetUrl: session.widgetUrl, expiresAt: session.expiresAt, traceId: session.traceId, providerOrderId: null, destinationChain: CIRCLE_DESTINATION_CHAIN };
    },
  };
}
