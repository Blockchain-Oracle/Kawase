# Docs pack: buy + marketplace lane (2026-10-14)

Tags: VERIFIED = read in a primary source or the installed package today. UNVERIFIED = not confirmed; test first. Doc pages carry "Agent Instructions" blocks; ignored. Context7 had no Circle Onramp Kit entry, so those parts come from the npm tarball (`@circle-fin/onramp-kit@1.0.3`, unpacked in scratchpad; `node_modules` is not installed in this checkout) and docs.arc.io.

## 1. Versions
- `@circle-fin/onramp-kit` 1.0.3 pinned (server already uses it; client entry is `@circle-fin/onramp-kit`, server `/server`, types `/protocol`). Circle's docs now teach `@circle-fin/app-kit` 1.16.0 (`new AppKit({onramp})`, `kit.onramp.mountIframe`); same shapes. Stay on 1.0.3.
- `react-native-webview`: `npx expo install react-native-webview` gives **13.16.1** (Expo SDK 57 bundledNativeModules); npm latest is 14.0.1. Use the Expo one. No config plugin; it needs a dev/EAS build. It has **no web support**: split `buy-frame.tsx` / `buy-frame.web.tsx` (iframe).
- Coinbase: no new package needed for our path (server REST + WebView). `@coinbase/cdp-sdk` 1.58.0 server-side only for `generateJwt` (`@coinbase/cdp-sdk/auth`). Skip `@coinbase/cdp-react-native` 0.0.127 (see 4).

## 2. Circle Onramp Kit
**Mint (server, engine.ts).** `createOnrampServerKit({apiKey, baseUrl?, widgetBaseUrl?, referrerDomain?})`; `createSession({appUserId, destinationAddress, destinationChain?, amount?, currency?, email?, assets?, metadata?})` returns `{widgetUrl, expiresAt, traceId, sessionId, sessionToken}`. `destinationChain` is a free string that **defaults to "Ethereum"** inside Circle's API, so always pass it; the engine passes `ONRAMP.chain = "arc"`. Casing: the kit's own examples use lowercase `'arc'` for `assets.chains/pairs`, and `chains` "accepts a chain id or display label"; no doc spells `destinationChain` itself, and sandbox minted with "arc" on 10-02. Whether "Arc" is also accepted: UNVERIFIED. Keep `assets.pairs: [{token, chain:"arc"}]` (display-only scoping, VERIFIED).
- `referrerDomain` is a **server kit option, not per session**: bare hostname only (`app.getkawase.xyz`; no scheme, port, path, wildcard), the exact host serving the page. It is sealed in the session JWT and passed to Transak for the nested iframe's `frame-ancestors`. The kit says omit it for top-level/popup. engine.ts sets it on every mint when `ONRAMP_REFERRER_DOMAIN` is set; IDEA: keep one engine without it for the system-browser sheet and one with it for the `/buy/:id` iframe page.
- Prod card/Apple/Google Pay: 403 unless the domain is in the KYB `web_url`. Sandbox: not enforced. Sessions live 30 min.

**Mount (client, our `/buy/:orderId` page, web).**
```ts
import { createOnrampKit, fetchOnrampSession } from "@circle-fin/onramp-kit";
const onramp = createOnrampKit({ widgetBaseUrl: sandbox ? "https://onramp-sandbox.arc.io" : undefined });
const widget = onramp.mountIframe({            // no user gesture needed; call from useEffect
  session, container: ref.current!,            // container attached + explicit height (720px)
  title: "Kawase payment", loadTimeout: 10_000, // 0 disables; default 10 s -> PAGE_NOT_LOADED
  onSessionExpired: () => remint(),            // SESSION_TIMEOUT or INVALID_SESSION_TOKEN: mint new, remount
});
const off = widget.on("*", (e) => post(`/onramp/orders/${id}/events`, e)); // {event, code, payload}
widget.state; // 'mounting'|'ready'|'submitted'|'settled'|'closed'|'failed'
return () => { off(); widget.close(); };
```
Events: `INITIALIZATION_SUCCESS`; `INITIALIZATION_ERROR` (`PAGE_NOT_LOADED`, `INVALID_SESSION_TOKEN`, payload `errorMessage`, `canRetry`); `DEPOSIT_SUBMITTED` / `DEPOSIT_SETTLED` payload `{amount, tokenSymbol, paymentMethod: ApplePay|BankTransfer|Debit|GooglePay, settlementExpected, orderId, transactionHash}` (all optional); `DEPOSIT_NOT_COMPLETED` codes `SESSION_TIMEOUT, CANCELED_BY_CUSTOMER, NO_PAYMENT_OPTIONS, CUSTOMER_PENDING_REVIEW, CUSTOMER_REJECTED, PAYMENT_PROVIDER_ERROR`. No "ID check started" event.
- **Sandbox:** only `DEPOSIT_SUBMITTED` (`settlementExpected:false`); never `DEPOSIT_SETTLED`; Any six-digit OTP except 000000; any photo with a face passes KYC; Apple/Google Pay charge nothing. Settled state must come from our chain watcher/webhook.
- **Client `widgetBaseUrl` must equal the server's**, else mount throws (app-kit: `INPUT_WIDGET_URL_ORIGIN_MISMATCH` 1910; the 1.0.3 client origin-pins the same way, UNVERIFIED code).
- **iframe attributes set by the kit:** `allow="camera; microphone; clipboard-read; clipboard-write; payment"`, `referrerpolicy="strict-origin"`, `loading="eager"`, **no `sandbox`** (deliberate: payment/3DS need scripts, forms, same-origin, popups). Don't add one.
- **CSP** (our web app): prod `frame-src https://onramp.arc.io; connect-src https://onramp.arc.io https://api.circle.com;` sandbox `https://onramp-sandbox.arc.io` + `https://api-test.circle.com`. Wrong CSP = silent empty container, no event (except our 10 s `PAGE_NOT_LOADED`).
- iOS Safari ITP can break KYC/session storage inside an iframe: use `openWindow` there (must run synchronously in the tap; returns `{status:'blocked', reason: popup_blocked|in_app_browser|pwa_standalone}`). Browser events are best-effort; webhooks are truth.

## 3. react-native-webview (Circle path, phone)
```tsx
<WebView
  source={{ uri: `${APP_URL}/buy/${orderId}` }}  // our page, which mounts the iframe
  enableApplePay                                    // iOS, default false
  paymentRequestEnabled                             // Android, default false (Google Pay)
  originWhitelist={["https://*", "apple-pay://*"]}
  onMessage={(e) => handle(JSON.parse(e.nativeEvent.data))}
  startInLoadingState
/>
```
- `enableApplePay` disables `injectJavaScript`, `injectedJavaScript(BeforeContentLoaded)`, `sharedCookiesEnabled`, html5 history. Page -> app only via `window.webkit.messageHandlers.ReactNativeWebView.postMessage(JSON.stringify(evt))` (not `window.ReactNativeWebView`, which needs injection). On our page: `(window.webkit?.messageHandlers?.ReactNativeWebView ?? window.ReactNativeWebView)?.postMessage(...)`.
- Android Google Pay in WebView: WebView 137+, Play Services 25.18.30, `androidx.webkit:webkit:1.14.0`, manifest `<queries>`, `paymentRequestEnabled` (Google blog, research report 11). Expo manifest edit route: UNVERIFIED.
- Whether Circle's widget (Transak nested) takes Apple Pay inside a WKWebView: **UNVERIFIED**; test on a real iPhone. Fallback: `expo-web-browser` sheet on our `/buy/:id` page (current behaviour, with the URL ours).
- Keep default User-Agent; no `userAgent` prop (Transak docs warn Apple Pay breaks).

## 4. Coinbase CDP Onramp (US, iOS Apple Pay / Android Google Pay, Base USDC)
**Use the server Order API + our WebView, not `@coinbase/cdp-react-native`.** That package's `ApplePayProvider/useApplePay/ApplePayButton` needs a CDP end-user login (`user_not_authenticated` otherwise; `useEvmAddress` from cdp-hooks) plus peers `cdp-core`, `cdp-api-client`, `cdp-app-attest`, `expo-apple-authentication`. Kawase uses its own auth. Its button is just a `WebView` (13.13.5 tested) on `paymentLink.url` with injected JS and `originWhitelist ["https://*","apple-pay://*"]`; no `enableApplePay`. That is the reference for our WebView.

**Auth:** project Secret API Key -> per-request JWT, expires 120 s default:
```ts
import { generateJwt } from "@coinbase/cdp-sdk/auth";
const jwt = await generateJwt({ apiKeyId, apiKeySecret, requestMethod: "POST",
  requestHost: "api.cdp.coinbase.com", requestPath: "/platform/v2/onramp/orders" });
const r = await fetch("https://api.cdp.coinbase.com/platform/v2/onramp/orders", { method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ paymentMethod: "GUEST_CHECKOUT_APPLE_PAY", paymentCurrency: "USD",
    paymentAmount: "50.00", purchaseCurrency: "USDC", destinationNetwork: "base",
    destinationAddress, partnerUserRef: `sandbox-${userId}`,  // "sandbox-" prefix = sandbox
    phoneNumber, email, phoneNumberVerifiedAt, agreementAcceptedAt, // or smsVerificationId + emailVerificationId
    clientIp, locale: "en" }) });   // -> 201 { order, paymentLink: { url }, userAuthToken? }
```
Required fields: `paymentCurrency, purchaseCurrency, paymentMethod, destinationAddress, destinationNetwork, partnerUserRef`; amount via `paymentAmount` (fee-inclusive) or `purchaseAmount`. `isQuote:true` returns pricing only. `domain` only for iframes (omit for iOS WebView). Env names (IDEA): `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`.
**Verification (standard flow):** email and US mobile phone (no VoIP) must be verified: `POST /v2/onramp/verifications {channel:"sms"|"email", destination}` -> `verificationId`, 6-digit code valid 10 min; `.../{id}/submit {otpCode}`; verified 60 days. Needs Coinbase allowlisting except in sandbox. Embedded orders (omit phone/email) need account enablement.
**Render:** load `paymentLink.url` in WebView. Subscribe to messages before loading. Events `{eventName, data:{errorCode,errorMessage}}`: `onramp_api.load_pending|load_success|load_error`, `validate_merchant_error`, `commit_success|commit_error`, `cancel`, `polling_start|polling_success|polling_error`. Keep the WebView alive after `commit_success` and it polls and emits `polling_success`. The button must be physically tapped.
**Sandbox:** use the production CDP key (no CDP sandbox); `partnerUserRef` starting `sandbox-` always succeeds, card never charged; iframe on `http://localhost` also needs `&useApplePaySandbox=true` (or `useGooglePaySandbox`) on the link. Native flow is a dev build; Apple Pay prod access needs contact/approval; Android Google Pay prod needs Google approval.
**Limits (guest):** $500/week rolling, 15 lifetime transactions, 10/day; limits upgrade (`POST /v2/onramp/limits`, SSN last 4 + DOB) lifts lifetime cap, weekly up to $2,500. US only. Prepaid cards declined. Users must accept Coinbase Guest Checkout ToS, User Agreement, Privacy Policy (pass `agreementAcceptedAt`). Orders stuck in Processing if abandoned: add our own timeout; reconcile via Get onramp transactions.
**Delivery:** Arc is not listed; deliver USDC to **Base**, then Kawase `/move` (CCTP) to Arc. Free to developers; user pays about 2.5% plus spread (docs FAQ).
Mobile reference: github.com/coinbase/onramp-v2-mobile-demo (Expo).

## 5. x402 marketplace UI data
**Circle discovery** `GET https://api.circle.com/v2/x402/discovery/resources` (public, no key, gzip; send a normal curl-style User-Agent, Python urllib got 403). Params: `query` (fuzzy), `type` http|mcp, `category`, `network` (CAIP-2 `eip155:5042`; Arc testnet `eip155:5042002`), `asset`, `scheme`, `payTo`, `maxUsdPrice`, `supportsVanillax402`, `supportsCircleGateway`, `siwx` (false for automation), `fields` (e.g. `resource,metadata.provider.name`), `limit` (default 50, max 200), `offset`. Response `{x402Version, items[], pagination:{limit,offset,total}}`. Live today: 2,195 items on Arc. **`network=` returns items that also accept other chains; filter `accepts` to Arc** (`toListing` does). Item: `resource, accepts[{scheme,network,asset,payTo,amount,extra}], metadata{provider{name,website,docsUrl,description,category,tags}, path, method, description, mimeType, input, output, siwx, supportsVanillax402, supportsCircleGateway}`. Categories seen: SOCIAL_INTELLIGENCE 1009, WEB_SEARCH_RESEARCH 591, INFRASTRUCTURE 226, DATA_ENRICHMENT 169, FINANCIAL_ANALYSIS 125, PREDICTION_MARKETS 62, CREATIVE 13 (docs omit DATA_ENRICHMENT; `marketplaceCategory()` maps it via "ENRICH").
**Kawase today:** `Discovery` (packages/integrations/x402/src/discovery.ts) pages 200 at a time, 10 min cache (`X402_DISCOVERY_TTL_MS`), keeps `exact` + Arc USDC options, ranks by word score; `GET /services?q&category` (routes.ts) returns max 8 (`X402_SEARCH_LIMIT`) `ServiceListing{url, method, description, provider{name,website,category}, price, priceDisplay, rails, payTo}`; `inspect()` probes the live 402. Gaps for a screen: no provider list, no paging, no grouping, no price/rail filter, no icon.
**Grouping AIsa (provider name is "AIsa API", 1,581 listings, all `api.aisa.one/apis/v2/<tool>/...`, all $0.10, all Gateway-only, 0 vanilla):** group key = first path segment after `/apis/v2/`; sub-group = the next segment. tikhub 954 (22 platforms: douyin 298, tiktok 150, bilibili 83, instagram 70, weibo 56, xiaohongshu 44, zhihu 41, kuaishou 36, reddit 28, youtube 28, twitter 25), dataforseo 443 (serp 154, keywords_data 48, business_data 42, ai_optimization 37, dataforseo_labs 37, merchant 30, app_data 29, on_page 23, backlinks 21), apollo 54, agentmail 51, coingecko 20, instagram 15, openmeteo 12, plus small ones (reddit, twitter, pinterest, exa, ahrefs...). Do the same for Orthogonal (`np.orthogonal.com/<vendor>/...`, 289, 0 vanilla) and Quicknode (`x402.quicknode.com/<chain>/`, 132, all vanilla). IDEA: add `tool` (`host + first segment(s)`) and `toolGroup` to `Listing`, return `GET /services/tools?provider=` with counts and min price; the card shows tool logo + count, the sheet lists endpoints by sub-group. Stale-category risk: AIsa labels coingecko/exa/foreplay as FINANCIAL_ANALYSIS and some search tools likewise, so group by tool, not by Circle category. Because 94% of listings are Gateway-only, show a rail badge and note a plain-EIP-3009 wallet cannot pay them (`rails` already carries it).

## 6. Gotchas
- Doc/URL churn: Circle moved docs to app-kit; onramp-kit 1.0.3 README still valid.
- Circle fee schedule, Individual KYB eligibility, Circle inside WKWebView/ITP: UNVERIFIED (see report 11).
- `react-native-webview` 14 vs Expo 13.16.1: don't hand-install 14 (Expo SDK alignment).
- Coinbase guest checkout hosted UI was discontinued 30 Jun 2026 (report 10); only the Order API remains.

## 7. Sources
Circle: docs.arc.io/app-kit/onramp, /quickstarts/onramp-embed-widget, /references/onramp-hosting-requirements, /tutorials/onramp/customize-session-minting, /iframe-vs-popup, /handle-lifecycle-events; npm @circle-fin/onramp-kit 1.0.3 README + d.ts; developers.circle.com/agent-stack/agent-marketplace/discovery-api (Context7 `/websites/developers_circle`).
WebView: github.com/react-native-webview/react-native-webview docs/Reference.md (Context7 `/react-native-webview/react-native-webview`); Expo `bundledNativeModules.json` (expo@57.0.28); webkit.org/blog/14445; trac.webkit.org/r246056.
Coinbase: docs.cdp.coinbase.com/onramp/headless-onramp/overview, /verification, /limits-upgrade, /wallets/using-wallets/onramp/apple-pay, /api-reference/v2/rest-api/onramp/create-an-onramp-order, /api-reference/v2/authentication (Context7 `/websites/cdp_coinbase`, `/coinbase/cdp-sdk`).
