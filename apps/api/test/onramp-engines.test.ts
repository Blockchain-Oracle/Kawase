// The onramp engines. Circle is minted live against its sandbox (TEST key), showing the destination the session was
// made for; Coinbase runs against the documented request and response shapes with a stand-in fetch and a real JWT signer
// (no CDP keys are needed or used: gated on the keys being present, nothing is offered without them).
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { test } from "node:test";
import { config } from "dotenv";

import { loadApiEnv } from "@kawase/env";

import { circleProvider, CIRCLE_DESTINATION_CHAIN } from "../src/onramp/circle";
import { cdpKeysFromEnv, CDP_HOST, CoinbaseError, coinbaseProvider } from "../src/onramp/coinbase";
import { circleOnramp, noOnramp, onrampEngines, onrampRouter } from "../src/onramp/engine";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString()) as Record<string, unknown>;
const WALLET = "0x000000000000000000000000000000000000dEaD";

test("circle: a sandbox session is minted for Arc, the widget scoped to the Arc pair, the page kit sealed to our host", { skip: !process.env.CIRCLE_TEST_API_KEY, timeout: 60_000 }, async () => {
  const env = { ...loadApiEnv(), ONRAMP_REFERRER_DOMAIN: "app.getkawase.xyz" };
  const circle = circleProvider(env);
  assert.deepEqual([circle.configured("testnet"), circle.delivers, circle.sandbox("testnet")], [true, "arc", true]);
  const input = { appUserId: "engine-test-user", destinationAddress: WALLET, asset: "USDC", amount: "20", currency: "USD", metadata: { orderId: "engine-test" } };

  const page = await circle.mint("testnet", { ...input, frame: "page" });
  const url = new URL(page.widgetUrl);
  assert.equal(url.origin, "https://onramp-sandbox.arc.io");
  assert.equal(url.searchParams.get("pairs"), "USDC:arc");
  assert.equal(page.destinationChain, CIRCLE_DESTINATION_CHAIN);
  assert.equal(page.destinationChain, "Arc");
  const pageClaims = claims(url.searchParams.get("sessionToken")!);
  assert.equal(pageClaims.referrerDomain, "app.getkawase.xyz", "the iframe page's session carries our host for Transak's frame-ancestors");
  assert.equal(pageClaims.walletAddress, WALLET);

  const browser = await circle.mint("testnet", { ...input, frame: "browser" });
  assert.equal(claims(new URL(browser.widgetUrl).searchParams.get("sessionToken")!).referrerDomain, undefined, "the top-level session leaves it out");

  console.log(`circle sandbox session: destinationChain=${page.destinationChain} (sent to Circle), widget ${url.origin}/?pairs=${url.searchParams.get("pairs")}, session wallet ${String(pageClaims.walletAddress)}, appUserId ${String(pageClaims.appUserId)}, referrerDomain ${String(pageClaims.referrerDomain)}, expires ${page.expiresAt}`);
});

test("engines: Coinbase is offered only with its keys, Circle first; the router picks what was asked when it exists", () => {
  assert.equal(cdpKeysFromEnv({ CDP_PROJECT_ID: "p" }), undefined);
  assert.equal(cdpKeysFromEnv({ CDP_API_KEY_ID: "id" }), undefined);
  const keys = cdpKeysFromEnv({ CDP_API_KEY_ID: "id", CDP_API_KEY_SECRET: "line1\\nline2" })!;
  assert.equal(keys.apiKeySecret, "line1\nline2");

  assert.equal(noOnramp.configured("mainnet"), false);
  const env = { ...loadApiEnv(), CIRCLE_LIVE_API_KEY: "live-key-for-routing-test" };
  const without = onrampEngines(env, { cdp: undefined });
  const ids = (engine: typeof without) => engine.engines("testnet").map((entry) => entry.id);
  // process.env may carry CDP keys on a machine that has them; the test passes none explicitly and checks both cases.
  const withKeys = onrampEngines(env, { cdp: { apiKeyId: "id", apiKeySecret: "secret" } });
  assert.deepEqual(ids(withKeys), ["circle", "coinbase"]);
  assert.equal(withKeys.pick("testnet", "coinbase")?.id, "coinbase");
  assert.equal(withKeys.pick("testnet", undefined)?.id, "circle");
  assert.equal(circleOnramp(env).provider("coinbase"), undefined);
  assert.ok(ids(without).includes("circle"));
  assert.equal(onrampRouter([]).pick("mainnet", "coinbase"), undefined);
});

type Seen = { method: string; url: string; auth: string; body: Record<string, unknown> | undefined };

test("coinbase: signed requests, the documented order body, quote, state mapping, verification, errors", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "sec1", format: "pem" }).toString();
  const seen: Seen[] = [];
  const order = (status: string, extra: Record<string, unknown> = {}) => ({
    orderId: "11111111-2222-3333-4444-555555555555",
    paymentTotal: "50.00",
    paymentSubtotal: "47.50",
    paymentCurrency: "USD",
    paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
    purchaseAmount: "47.20",
    purchaseCurrency: "USDC",
    fees: [
      { type: "FEE_TYPE_EXCHANGE", amount: "2.50", currency: "USD" },
      { type: "FEE_TYPE_NETWORK", amount: "0.01", currency: "USD" },
    ],
    exchangeRate: "0.9999",
    destinationAddress: WALLET,
    destinationNetwork: "base",
    status,
    createdAt: "2026-10-14T10:00:00Z",
    updatedAt: "2026-10-14T10:00:00Z",
    ...extra,
  });
  let respond: (url: string, body: Record<string, unknown> | undefined) => { status: number; json: unknown } = () => ({ status: 200, json: {} });
  const fetchStub = (async (url: string, init: RequestInit) => {
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    seen.push({ method: String(init.method), url, auth: String((init.headers as Record<string, string>).authorization), body });
    const answer = respond(url, body);
    return new Response(JSON.stringify(answer.json), { status: answer.status });
  }) as unknown as typeof fetch;
  const coinbase = coinbaseProvider({ keys: { apiKeyId: "kid-1", apiKeySecret: pem }, fetch: fetchStub });
  assert.deepEqual([coinbase.delivers, coinbase.weeklyLimitUsd, coinbase.methods("mainnet"), coinbase.sandbox("testnet"), coinbase.sandbox("mainnet")], ["base", 500, ["apple_pay", "google_pay"], true, false]);

  const contact = { phone: "+15555550123", email: "buyer@example.test", smsVerificationId: "onramp_verification_sms", emailVerificationId: "onramp_verification_mail", agreementAcceptedAt: "2026-10-14T10:00:00Z" };
  respond = () => ({ status: 201, json: { order: order("ONRAMP_ORDER_STATUS_PENDING_PAYMENT"), paymentLink: { url: "https://pay.coinbase.com/apple-pay/abc", paymentLinkType: "PAYMENT_LINK_TYPE_APPLE_PAY_BUTTON" } } });
  const session = await coinbase.mint("mainnet", { appUserId: "user-1", destinationAddress: WALLET, asset: "USDC", amount: "50", currency: "USD", metadata: {}, method: "apple_pay", contact, clientIp: "203.0.113.7", locale: "en", orderId: "kawase-order-1" });
  assert.deepEqual([session.engine, session.widgetUrl, session.providerOrderId, session.destinationChain], ["coinbase", "https://pay.coinbase.com/apple-pay/abc", "11111111-2222-3333-4444-555555555555", "base"]);
  assert.deepEqual(session.quote, { payTotal: "50.00", payCurrency: "USD", receive: "47.20", asset: "USDC", fees: [{ type: "exchange", amount: "2.50", currency: "USD" }, { type: "network", amount: "0.01", currency: "USD" }], rate: "0.9999" });

  const sent = seen[0]!;
  assert.equal(sent.url, `https://${CDP_HOST}/platform/v2/onramp/orders`);
  assert.deepEqual(sent.body, {
    paymentMethod: "GUEST_CHECKOUT_APPLE_PAY",
    paymentCurrency: "USD",
    paymentAmount: "50.00",
    purchaseCurrency: "USDC",
    destinationNetwork: "base",
    destinationAddress: WALLET,
    partnerUserRef: "user-1",
    phoneNumber: "+15555550123",
    email: "buyer@example.test",
    smsVerificationId: "onramp_verification_sms",
    emailVerificationId: "onramp_verification_mail",
    agreementAcceptedAt: "2026-10-14T10:00:00Z",
    partnerOrderRef: "kawase-order-1",
    clientIp: "203.0.113.7",
    locale: "en",
  });
  assert.equal("domain" in sent.body!, false, "domain is only for an iframe; the iOS WebView leaves it out");

  // The bearer is a real ES256 JWT for exactly this request, valid for two minutes.
  const jwt = sent.auth.replace("Bearer ", "");
  const [header, payload, signature] = jwt.split(".") as [string, string, string];
  assert.equal(JSON.parse(Buffer.from(header, "base64url").toString()).alg, "ES256");
  assert.ok(verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")), "signature verifies with the key's public half");
  const jwtClaims = claims(jwt) as { sub: string; iss: string; uris: string[]; exp: number; nbf: number };
  assert.deepEqual([jwtClaims.sub, jwtClaims.iss, jwtClaims.uris], ["kid-1", "cdp", [`POST ${CDP_HOST}/platform/v2/onramp/orders`]]);
  assert.equal(jwtClaims.exp - jwtClaims.nbf, 120);

  // A testnet order is a sandbox one: the reference carries the prefix, so Coinbase never charges or delivers.
  await coinbase.mint("testnet", { appUserId: "user-1", destinationAddress: WALLET, asset: "USDC", amount: "10", metadata: {}, contact });
  assert.equal(seen[1]!.body!.partnerUserRef, "sandbox-user-1");

  // Quote: the same call with isQuote, nothing else added.
  respond = () => ({ status: 201, json: { order: order("ONRAMP_ORDER_STATUS_PENDING_PAYMENT") } });
  const quote = await coinbase.quote!("mainnet", { amount: "50", currency: "usd", asset: "USDC", method: "google_pay", destinationAddress: WALLET, appUserId: "user-1" });
  assert.equal(quote.receive, "47.20");
  assert.equal(seen[2]!.body!.isQuote, true);
  assert.equal(seen[2]!.body!.paymentMethod, "GUEST_CHECKOUT_GOOGLE_PAY");

  // State mapping and the delivery hash.
  const states: [string, string][] = [
    ["ONRAMP_ORDER_STATUS_PENDING_AUTH", "pending"],
    ["ONRAMP_ORDER_STATUS_PENDING_PAYMENT", "pending"],
    ["ONRAMP_ORDER_STATUS_PROCESSING", "processing"],
    ["ONRAMP_ORDER_STATUS_COMPLETED", "completed"],
    ["ONRAMP_ORDER_STATUS_FAILED", "failed"],
  ];
  for (const [raw, state] of states) {
    respond = () => ({ status: 200, json: { order: order(raw, raw.endsWith("COMPLETED") ? { txHash: "0xabc" } : {}) } });
    const got = await coinbase.orderState!("mainnet", "11111111-2222-3333-4444-555555555555");
    assert.equal(got.state, state);
    assert.equal(got.txHash, raw.endsWith("COMPLETED") ? "0xabc" : null);
  }
  assert.equal(seen.at(-1)!.method, "GET");

  // Verification: US numbers only, then the documented calls.
  await assert.rejects(coinbase.verification!.start("mainnet", { channel: "sms", destination: "+447700900123" }), (error: unknown) => error instanceof CoinbaseError && error.errorType === "guest_region_forbidden");
  respond = () => ({ status: 200, json: { verificationId: "onramp_verification_1", otpExpiresAt: "2026-10-14T10:10:00Z" } });
  assert.deepEqual(await coinbase.verification!.start("mainnet", { channel: "sms", destination: "+15555550123" }), { verificationId: "onramp_verification_1", expiresAt: "2026-10-14T10:10:00Z" });
  respond = () => ({ status: 200, json: { verificationId: "onramp_verification_1", verificationExpiresAt: "2026-12-13T10:00:00Z" } });
  assert.deepEqual(await coinbase.verification!.submit("mainnet", { verificationId: "onramp_verification_1", otpCode: "123456" }), { verificationId: "onramp_verification_1", verifiedUntil: "2026-12-13T10:00:00Z" });
  assert.equal(seen.at(-1)!.url, `https://${CDP_HOST}/platform/v2/onramp/verifications/onramp_verification_1/submit`);
  assert.deepEqual(seen.at(-1)!.body, { otpCode: "123456" });

  // Errors keep Coinbase's own type, so the app can say what to fix.
  respond = () => ({ status: 429, json: { errorType: "guest_transaction_limit", errorMessage: "weekly limit reached" } });
  await assert.rejects(coinbase.mint("mainnet", { appUserId: "u", destinationAddress: WALLET, asset: "USDC", amount: "50", metadata: {}, contact }), (error: unknown) => error instanceof CoinbaseError && error.errorType === "guest_transaction_limit" && error.status === 429);
  await assert.rejects(coinbase.mint("mainnet", { appUserId: "u", destinationAddress: WALLET, asset: "EURC", amount: "50", metadata: {}, contact }), /delivers USDC/);
  await assert.rejects(coinbase.mint("mainnet", { appUserId: "u", destinationAddress: WALLET, asset: "USDC", amount: "50", metadata: {} }), (error: unknown) => error instanceof CoinbaseError && error.errorType === "otp_verification_required");
  assert.equal(seen.filter((entry) => entry.url.includes("/orders") && entry.method === "POST").length, 4, "refused inputs never reach Coinbase");
});
