# Circle fiat-in inside Kawase (research 2026-10-14)

Tags: VERIFIED = quoted from a primary source fetched today. REPORTED = secondary or older. UNKNOWN = not found. IDEA = mine.
Pages from docs.arc.io carry "Agent Instructions" blocks (install Circle skills). Ignored. I signed up for nothing and spent nothing. Raw pages are in `research-2026-10-14/raw11/`.

## Short answer
1. Circle's kit cannot be re-skinned or run without its screen. The session request has no theme, colour or logo field, and the docs have none (VERIFIED, `server.d.cts` of `@circle-fin/onramp-kit` 1.0.3). Our own look around it is possible; the middle part stays Circle's.
2. What is behind "Circle's page": Circle's widget is a wrapper around **Transak**. Circle's widget sends `frame-src 'self' https://*.transak.com https://*.socure.com https://*.socure.io` (VERIFIED, HTTP headers of onramp.arc.io today), and the kit's own comment says `referrerDomain` is "passed to Transak as the `referrerDomain` claim" (VERIFIED, npm package). So Circle has no separate fiat rail to offer us; it resells Transak's.
3. Best Circle-based setup: **one Kawase page on our own domain that mounts Circle's iframe**, shown inside a Kawase sheet (system browser sheet on phone, in-page on desktop). Kawase draws everything around the widget and drives the progress states from Circle's events plus our webhook and chain watcher. The Apple Pay sheet is Apple's. Card and ID check stay Circle's.
4. The risk is not the code. It is production approval: Apple Pay, Google Pay and card need Circle's KYB with our domain registered. Whether a person without a company passes it is UNKNOWN.

## (1) Owner's Circle status
- Repo: "Circle LIVE: approved and set up 2026-10-02 evening" (`plan/STATUS.md:183`). What was checked: the LIVE key's read calls and a registered entity secret (`STATUS.md:62`). That is Wallets and API access. Nothing in the repo says KYB was completed. The open to-do is "Circle KYB domain" (`STATUS.md:122`). So: approved for the API, KYB not confirmed.
- A LIVE Onramp session mint returned 201 on 10-02 (`plan/product/cards/money-in.md`). Minting works without KYB; the payment methods do not.
- Docs, quoted:
  - "Enabling these methods requires completing KYB in the Circle Console." (https://docs.arc.io/app-kit/onramp) VERIFIED.
  - "Certain payment methods are only available to end users after completing KYB." (same page) VERIFIED.
  - "Production: Debit card, Apple Pay, and Google Pay flows fail with a 403 if the domain isn't registered in your KYB's `web_url` entries." (https://docs.arc.io/app-kit/tutorials/onramp/customize-session-minting) VERIFIED.
  - "Sandbox: `referrerDomain` isn't enforced." (same page) VERIFIED. So the iframe on our domain works in sandbox today without KYB.
- Does KYB need a company? The Onramp docs never define KYB, never say "business entity", never say "individual". UNKNOWN. The Console page (console.circle.com/app-kits) needs a login; I did not open it. Owner task: open it and see what the KYB form asks, or ask Circle.
- Circle Mint is closed to individuals: "Circle Mint is not available to individuals" and "This product is not offered to retail consumers or those minting USDC for personal use." (https://www.circle.com/circle-mint) VERIFIED. This is a different product from the Onramp Kit; it is not a route for you.

## (2) Embedding options (current docs)
- `mountIframe`: inline iframe, no user gesture needed, container needs an explicit height (docs use 720px). `openWindow`: popup, must be called straight from a tap. Mobile browsers open a new tab; in-app browsers and installed PWAs refuse it. (https://docs.arc.io/app-kit/tutorials/onramp/iframe-vs-popup) VERIFIED.
- Iframe attributes set by the kit: `allow="camera; microphone; clipboard-read; clipboard-write; payment"`, `referrerpolicy="strict-origin"`, no `sandbox` (npm source 1.0.3) VERIFIED.
- Theming: none. Session fields: `appUserId`, `destinationAddress`, `destinationChain`, `amount`, `currency`, `email`, `assets`, `metadata` (npm types) VERIFIED. No quote endpoint before the widget: UNKNOWN.
- Events: `INITIALIZATION_SUCCESS`, `INITIALIZATION_ERROR` (`PAGE_NOT_LOADED`, `INVALID_SESSION_TOKEN`), `DEPOSIT_SUBMITTED`, `DEPOSIT_SETTLED`, `DEPOSIT_NOT_COMPLETED` (`SESSION_TIMEOUT`, `CANCELED_BY_CUSTOMER`, `NO_PAYMENT_OPTIONS`, `CUSTOMER_PENDING_REVIEW`, `CUSTOMER_REJECTED`, `PAYMENT_PROVIDER_ERROR`), plus `onSessionExpired` and `on("*")`. Payload can hold amount, token symbol, payment method, order id, transaction hash. (https://docs.arc.io/app-kit/tutorials/onramp/handle-lifecycle-events) VERIFIED. There is no event for "ID check started" or "card entered", so our progress steps are coarse: loading, ready, submitted, settled.
- "Browser lifecycle events such as `DEPOSIT_SUBMITTED` and `DEPOSIT_SETTLED` are best-effort UX signals." Final state comes from webhooks. (hosting-requirements page) VERIFIED.
- Session life: "Onramp sessions are valid for 30 minutes from creation." VERIFIED.
- Sandbox: "Only `DEPOSIT_SUBMITTED` fires... `DEPOSIT_SETTLED` is defined in the SDK but isn't emitted in sandbox." Any photo with a face passes ID check; Apple Pay or Google Pay: "Follow the widget's instructions. Your card isn't charged." VERIFIED. So in sandbox our own chain watcher must say "funded".
- iOS Safari: "iOS Safari's Intelligent Tracking Prevention (ITP) can restrict the embedded app's access to its own storage inside an iframe... use `openWindow` mode on that platform." (hosting requirements) VERIFIED.
- CSP on our page: `frame-src https://onramp.arc.io; connect-src https://onramp.arc.io https://api.circle.com;` VERIFIED.

## (3) Apple Pay and Google Pay in frames and WebViews
- Safari 17 and later: "You can now enable Apple Pay to be used in third-party iframes by setting the allow="payment" attribute." (https://webkit.org/blog/14445/webkit-features-in-safari-17-0/) VERIFIED. Circle's kit sets that attribute (above). Whether Circle's widget passes it down to the inner Transak frame: UNKNOWN. Transak's own docs ask for `allow=camera;microphone;payment` on "both the outer and inner iframe" (https://docs.transak.com/integration/web/iframe.md) VERIFIED, which hints at nested-frame sensitivity.
- WKWebView: WebKit's changelog says once Apple Pay is active or `canMakePayment` returns true in a web view, "future script injections from the hosting app will be blocked." (https://trac.webkit.org/r246056) VERIFIED. So it is a script-injection limit, not a ban.
- react-native-webview 14.0.1: `enableApplePay` (iOS, default false). "This comes with a cost features like `injectJavaScript`, html5 History, `sharedCookiesEnabled`, `injectedJavaScript`, `injectedJavaScriptBeforeContentLoaded` will not work." Messages to the app must be sent by the page with `window.webkit.messageHandlers.ReactNativeWebView.postMessage` and read in `onMessage`. (https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md) VERIFIED.
- Circle says nothing about WebView or React Native (VERIFIED absent). So "Circle widget in a WebView with Apple Pay working" is UNKNOWN until tested on a real iPhone with a KYB-registered domain.
- Google Pay in Android WebView: supported "starting with version 137", needs Google Play Services 25.18.30, `androidx.webkit:webkit:1.14.0`, manifest `queries`, and "the Payment Request API will be disabled by default for WebView". (https://developers.googleblog.com/en/adding-support-for-google-pay-within-android-webview/) VERIFIED. react-native-webview has `paymentRequestEnabled` (Android, default false, "needed for Google Pay to work within the WebView") VERIFIED. Transak says its Google Pay "works only with the Transak React Native SDK" (https://docs.transak.com/integration/mobile/react-native.md) VERIFIED; whether that applies to Circle's wrapper is UNKNOWN. Chrome Custom Tabs on Android are plain Chrome, so the sheet route avoids all this (IDEA, untested).

## (4) Other Circle products for fiat-in with our own UI
- Circle Mint: not for individuals (quote above). Bank wire/SEPA only.
- CPN Managed Payments: "You join through Circle's invitation and sign up with a Managed Payments account." Needs agreements and KYB of merchants (https://developers.circle.com/cpn/managed-payments) VERIFIED. Not an app-builder product.
- Arc portal's fiat deposit (portal.arc.io/deposit/fiat) and Circle CLI `circle wallet fund --method fiat` ("Your browser opens to the onramp provider") are the same widget. VERIFIED.
- Circle docs and the dev index list no headless card or Apple Pay API. Circle's old Payments API Apple Pay page now returns 404; a search snippet said Circle stopped taking new Apple Pay customers there (REPORTED).
- Verdict: nothing else at Circle gives fiat-in with our own UI. For our own UI, Transak headless (corporate email to sign up, production KYB: https://docs.transak.com/guides/how-to-create-partner-dashboard-account.md) or MoonPay; see `09-ramp-own-design.md`. Both also gate production on a business check. Transak also lists a "Headless Apple Pay (No Auth and No KYC)" API set (https://docs.transak.com/llms.txt); its terms are not read yet (UNKNOWN).

## (5) Best Circle setup for Kawase
Ours: amount, methods row, shell, progress, receipt, errors. Circle's/Transak's: ID check, card form, 3DS, Apple Pay and Google Pay prompts.

Build one page, `app.getkawase.xyz/buy/:orderId` (IDEA, matches the original design in money-in.md). It reads the session, mounts `mountIframe` in a 720px box under a Kawase header, and listens to `on("*")`. `ONRAMP_REFERRER_DOMAIN` is set to that host; the same host goes into KYB `web_url`.
- **Web (desktop):** Buy sheet → Continue → the page opens in-app (same tab, sheet or side panel). Apple Pay shows in Safari (17+) inside the iframe; Google Pay in Chrome. Events update the Kawase rail above the iframe.
- **iOS app:** Buy sheet (native, ours) → "Continue" opens that same page in the system browser sheet (`expo-web-browser`, as today, but the URL is our page, not Circle's). Apple Pay works in Safari-based sheets (the existing code assumes this; untested here). Events stay inside our page, which posts them to our API (`POST /onramp/orders/:id/events`, already built) and deep-links back on settle. Back in the app, the native sheet shows our "on its way" and "funded" states from polling.
- **iOS in-app WebView (alternative):** same page inside `react-native-webview` with `enableApplePay`, no injected JS, page posts messages by the WebKit handler. Gives a fully in-app frame but is UNKNOWN for nested frames and ITP; test on a device before choosing.
- **Android:** same system-sheet route (Custom Tab). If using WebView: `paymentRequestEnabled`, WebView 137+, Play Services, manifest queries.
- **Success:** `DEPOSIT_SETTLED` (live) or our chain watcher (sandbox, and the real source of truth) → funded moment. **Failure:** each of the six codes already has copy in `buy-sheet.tsx`; `SESSION_TIMEOUT` and `INVALID_SESSION_TOKEN` should re-mint a session.

Kawase code today (VERIFIED by reading):
- `apps/api/src/onramp/engine.ts`: mints Circle sessions (LIVE and sandbox), already passes `referrerDomain` when `ONRAMP_REFERRER_DOMAIN` is set, plus `amount`, `currency`, `email`, `metadata`.
- `service.ts` / `routes.ts`: orders, 30-minute sessions, signed Circle webhook (`/webhooks/circle`), chain-watcher settlement, `POST /orders/:id/events`.
- `buy-provider.tsx`: `WebBrowser.openBrowserAsync(widgetUrl)` straight to Circle, then polls every 3 s for 3 minutes. No events reach the app from that browser.
- `buy-sheet.tsx`: amount, presets, method marks, states (opening, waiting, funded, not completed with reasons, try again). Only "opening" and "waiting" are our own progress; no steps.
- Missing: the hosted `/buy/:orderId` page, any `mountIframe` code (no client package in the repo), `react-native-webview`.

Order of work: (a) hosted page + sandbox demo, no KYB needed; (b) real-iPhone check of Apple Pay in the sheet; (c) owner asks Circle what KYB requires; (d) if an individual cannot pass, switch to a headless provider.
