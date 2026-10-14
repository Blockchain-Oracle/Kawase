// Engine 2: Coinbase's server Order API (docs pack buy-market §4, read against docs.cdp.coinbase.com on 2026-10-14).
// US only. Apple Pay / Google Pay guest checkout; Coinbase delivers USDC to the person's own address on Base, and the
// service then starts Kawase's Bring-to-Arc leg (CCTP) as the same order. We use the server REST API and our own
// WebView, not @coinbase/cdp-react-native (it needs a CDP end-user login Kawase does not have).
//
// - Auth: the project's Secret API Key signs a short-lived JWT per request (`generateJwt` from @coinbase/cdp-sdk/auth;
//   ES256 or Ed25519 keys). The keys live on the server only.
// - Verification (standard flow): the phone (US, not VoIP) and the email each get a six-digit code
//   (`POST /v2/onramp/verifications`, `.../{id}/submit`); the ids go with the order. Production needs Coinbase to
//   allowlist the project; the sandbox does not (any number starting +1000, any email ending @sandbox.test, code 000000).
// - Sandbox: there is no separate CDP sandbox. A `partnerUserRef` starting "sandbox-" always succeeds and nothing is charged
//   or delivered, so such an order can never settle on chain (service.ts says so instead of pretending).
// - Guest limits: $500 a week rolling, 10 a day, 15 for life. Prepaid cards are declined.
// The engine is gated on the keys being present: without CDP_API_KEY_ID and CDP_API_KEY_SECRET nothing is offered.
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { createPrivateKey } from "node:crypto";

import type { NetworkId } from "@kawase/networks";

import type { OnrampMethod, OnrampMintInput, OnrampQuote, OnrampSession, ProviderEngine, ProviderOrderState, VerificationChannel } from "./engine";

export const CDP_HOST = "api.cdp.coinbase.com";
const CDP_ROOT = "/platform";
/** The partner-user-ref prefix that makes an order a sandbox one. */
export const SANDBOX_PREFIX = "sandbox-";
/** Coinbase delivers here; Arc is not a network it lists. */
export const COINBASE_NETWORK = "base";
const WEEKLY_LIMIT_USD = 500;
/** The payment link is not given an expiry by the API; Kawase bounds how long it offers one. */
const PAYMENT_LINK_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const US_PHONE = /^\+1\d{10}$/;
const PAYMENT_METHOD = { apple_pay: "GUEST_CHECKOUT_APPLE_PAY", google_pay: "GUEST_CHECKOUT_GOOGLE_PAY" } as const;

/**
 * The SDK signs an EC key only as PKCS#8 ("BEGIN PRIVATE KEY"); the key CDP hands out is often SEC1 ("BEGIN EC PRIVATE KEY").
 * Converted here so either works; an Ed25519 secret (base64) passes through untouched.
 */
export function signableSecret(secret: string): string {
  if (!secret.includes("BEGIN EC PRIVATE KEY")) return secret;
  return createPrivateKey(secret).export({ type: "pkcs8", format: "pem" }).toString();
}

export type CdpKeys = { apiKeyId: string; apiKeySecret: string; projectId?: string | undefined };

/** The keys from the environment, or undefined while either is missing (the engine is then simply not offered). */
export function cdpKeysFromEnv(env: Record<string, string | undefined> = process.env): CdpKeys | undefined {
  const apiKeyId = env.CDP_API_KEY_ID?.trim();
  const secret = env.CDP_API_KEY_SECRET?.trim();
  if (!apiKeyId || !secret) return undefined;
  // An EC key is a PEM, often stored with literal "\n" in an env file.
  return { apiKeyId, apiKeySecret: secret.replace(/\\n/g, "\n"), projectId: env.CDP_PROJECT_ID?.trim() || undefined };
}

/** Coinbase's own error, with the `errorType` the API names (otp_verification_invalid, guest_transaction_limit, ...). */
export class CoinbaseError extends Error {
  constructor(
    readonly status: number,
    readonly errorType: string,
    message: string,
  ) {
    super(message);
    this.name = "CoinbaseError";
  }
}

type RawFee = { type: string; amount: string; currency: string };
type RawOrder = {
  orderId: string;
  paymentTotal: string;
  paymentSubtotal: string;
  paymentCurrency: string;
  purchaseAmount: string;
  purchaseCurrency: string;
  fees: RawFee[];
  exchangeRate: string;
  status: string;
  txHash?: string;
};
type RawCreated = { order: RawOrder; paymentLink?: { url: string; paymentLinkType: string }; userAuthToken?: string };

const STATE: Record<string, ProviderOrderState["state"]> = {
  ONRAMP_ORDER_STATUS_PENDING_AUTH: "pending",
  ONRAMP_ORDER_STATUS_PENDING_VERIFICATION: "pending",
  ONRAMP_ORDER_STATUS_PENDING_PAYMENT: "pending",
  ONRAMP_ORDER_STATUS_PROCESSING: "processing",
  ONRAMP_ORDER_STATUS_COMPLETED: "completed",
  ONRAMP_ORDER_STATUS_FAILED: "failed",
};

const money2 = (value: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  return `${whole}.${(fraction + "00").slice(0, 2)}`;
};

const quoteOf = (order: RawOrder): OnrampQuote => ({
  payTotal: order.paymentTotal,
  payCurrency: order.paymentCurrency,
  receive: order.purchaseAmount,
  asset: order.purchaseCurrency,
  fees: order.fees.map((fee) => ({ type: fee.type === "FEE_TYPE_NETWORK" ? "network" : "exchange", amount: fee.amount, currency: fee.currency })),
  rate: order.exchangeRate,
});

export type CoinbaseOptions = {
  keys: CdpKeys;
  fetch?: typeof fetch | undefined;
  /** Replaces the JWT signer (tests). */
  sign?: ((request: { method: string; host: string; path: string }) => Promise<string>) | undefined;
  now?: () => number;
};

export function coinbaseProvider(options: CoinbaseOptions): ProviderEngine {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sign =
    options.sign ??
    ((request: { method: string; host: string; path: string }) =>
      generateJwt({ apiKeyId: options.keys.apiKeyId, apiKeySecret: signableSecret(options.keys.apiKeySecret), requestMethod: request.method, requestHost: request.host, requestPath: request.path }));

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const full = `${CDP_ROOT}${path}`;
    const jwt = await sign({ method, host: CDP_HOST, path: full });
    const response = await fetchImpl(`https://${CDP_HOST}${full}`, {
      method,
      headers: { authorization: `Bearer ${jwt}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
    if (!response.ok) {
      const failure = parsed as { errorType?: string; errorMessage?: string };
      throw new CoinbaseError(response.status, failure.errorType ?? `http_${response.status}`, failure.errorMessage ?? `Coinbase answered ${response.status}`);
    }
    return parsed as T;
  }

  const sandbox = (network: NetworkId) => network !== "mainnet";
  const partnerRef = (network: NetworkId, appUserId: string) => `${sandbox(network) ? SANDBOX_PREFIX : ""}${appUserId}`;

  /** The fields every order or quote carries. */
  const base = (network: NetworkId, input: { amount: string; currency: string; asset: string; method: OnrampMethod; destinationAddress: string; appUserId: string }) => {
    if (input.asset.toUpperCase() !== "USDC") throw new CoinbaseError(400, "invalid_request", "Coinbase delivers USDC");
    const paymentMethod = PAYMENT_METHOD[input.method as keyof typeof PAYMENT_METHOD];
    if (!paymentMethod) throw new CoinbaseError(400, "invalid_request", `Coinbase takes Apple Pay or Google Pay, not ${input.method}`);
    return {
      paymentMethod,
      paymentCurrency: input.currency.toUpperCase(),
      paymentAmount: money2(input.amount),
      purchaseCurrency: "USDC",
      destinationNetwork: COINBASE_NETWORK,
      destinationAddress: input.destinationAddress,
      partnerUserRef: partnerRef(network, input.appUserId),
    };
  };

  const provider: ProviderEngine = {
    id: "coinbase",
    delivers: "base",
    weeklyLimitUsd: WEEKLY_LIMIT_USD,
    configured: () => true,
    sandbox,
    methods: () => ["apple_pay", "google_pay"],

    async mint(network, input: OnrampMintInput): Promise<OnrampSession> {
      if (!input.amount) throw new CoinbaseError(400, "invalid_request", "an amount is needed");
      if (!input.contact) throw new CoinbaseError(400, "otp_verification_required", "verify the phone and email first");
      const payload = {
        ...base(network, { amount: input.amount, currency: input.currency ?? "USD", asset: input.asset, method: input.method ?? "apple_pay", destinationAddress: input.destinationAddress, appUserId: input.appUserId }),
        phoneNumber: input.contact.phone,
        email: input.contact.email,
        smsVerificationId: input.contact.smsVerificationId,
        emailVerificationId: input.contact.emailVerificationId,
        agreementAcceptedAt: input.contact.agreementAcceptedAt,
        ...(input.orderId ? { partnerOrderRef: input.orderId } : {}),
        ...(input.clientIp ? { clientIp: input.clientIp } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        // `domain` is only for an iframe; an iOS WebView leaves it out.
      };
      const created = await call<RawCreated>("POST", "/v2/onramp/orders", payload);
      if (!created.paymentLink?.url) throw new CoinbaseError(502, "bad_gateway", "Coinbase returned no payment link");
      return {
        engine: "coinbase",
        widgetUrl: created.paymentLink.url,
        expiresAt: new Date(now() + PAYMENT_LINK_TTL_MS).toISOString(),
        traceId: created.order.orderId,
        providerOrderId: created.order.orderId,
        destinationChain: COINBASE_NETWORK,
        quote: quoteOf(created.order),
      };
    },

    async quote(network, input): Promise<OnrampQuote> {
      const created = await call<RawCreated>("POST", "/v2/onramp/orders", { ...base(network, input), isQuote: true });
      return quoteOf(created.order);
    },

    async orderState(_network, providerOrderId): Promise<ProviderOrderState> {
      const { order } = await call<{ order: RawOrder }>("GET", `/v2/onramp/orders/${encodeURIComponent(providerOrderId)}`);
      return { state: STATE[order.status] ?? "pending", txHash: order.txHash ?? null, raw: order.status, purchaseAmount: order.purchaseAmount };
    },

    verification: {
      async start(_network, input: { channel: VerificationChannel; destination: string }) {
        // US numbers only, as the provider serves nobody else (a refusal here is cheaper than a code sent in vain).
        if (input.channel === "sms" && !US_PHONE.test(input.destination)) throw new CoinbaseError(400, "guest_region_forbidden", "Coinbase sells to US phone numbers only");
        const started = await call<{ verificationId: string; otpExpiresAt: string }>("POST", "/v2/onramp/verifications", { channel: input.channel, destination: input.destination });
        return { verificationId: started.verificationId, expiresAt: started.otpExpiresAt };
      },
      async submit(_network, input) {
        const done = await call<{ verificationId: string; verificationExpiresAt: string }>("POST", `/v2/onramp/verifications/${encodeURIComponent(input.verificationId)}/submit`, { otpCode: input.otpCode });
        return { verificationId: done.verificationId, verifiedUntil: done.verificationExpiresAt };
      },
    },
  };
  return provider;
}
