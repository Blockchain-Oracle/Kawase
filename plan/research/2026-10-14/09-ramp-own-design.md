# Buy inside Kawase, in our own design (research 2026-10-14)

Tags: VERIFIED = seen in current docs/code/npm today; REPORTED = from earlier reports, not re-checked; IDEA = mine.
Two docs pages (docs.arc.io, docs.transak.com) contain "Agent Instructions" blocks telling agents to install Circle skills / read other pages. Mentioned, not followed.

## Short answer
- Circle's kit cannot be re-skinned. Its page is theirs. Our own look needs Transak or MoonPay.
- Demo by 10-17: keep Circle sandbox, but wrap it in a Kawase-designed sheet we fully control around it (amount, progress, receipt). The Circle middle part stays visible. Be honest about that.
- Production: Transak headless (Apple Pay + card). MoonPay as second venue for the US.
- Owner-only tasks (sign-up, KYB, Transak email) are listed at the end. I signed up for nothing.

## (1) Circle Onramp Kit
- No theming, colours, logo or hide-Circle option is documented. The embed page lists only `session`, `container` and two callbacks for `mountIframe`. VERIFIED: https://docs.arc.io/app-kit/quickstarts/onramp-embed-widget . The widget loads from onramp.arc.io (sandbox onramp-sandbox.arc.io), so the page is Circle/Arc-branded. VERIFIED: https://docs.arc.io/app-kit/references/onramp-hosting-requirements
- Events we can drive our own progress UI with: INITIALIZATION_SUCCESS, INITIALIZATION_ERROR, DEPOSIT_SUBMITTED, DEPOSIT_SETTLED, DEPOSIT_NOT_COMPLETED (codes: SESSION_TIMEOUT, CANCELED_BY_CUSTOMER, NO_PAYMENT_OPTIONS, CUSTOMER_PENDING_REVIEW, CUSTOMER_REJECTED, PAYMENT_PROVIDER_ERROR), plus onSessionExpired; `on("*")` for all. Payload can carry amount, token, paymentMethod, orderId, transactionHash. VERIFIED: https://docs.arc.io/app-kit/tutorials/onramp/handle-lifecycle-events . Browser events are best-effort; final state must come from webhooks. Sessions last 30 minutes.
- Embedding: `mountIframe` (default, needs a 720px-tall box) or `openWindow` popup. `referrerDomain` is required on the server for debit card, Apple Pay and Google Pay. iOS Safari blocks storage in iframes and can break KYC, so Circle suggests a popup there. VERIFIED: iframe-vs-popup page and quickstart.
- React Native WebView and `enableApplePay`: nothing in Circle's docs covers RN or WebView Apple Pay (VERIFIED absent). The earlier claim comes from Report 2 (REPORTED). Our code avoids WebView because Apple Pay is restricted there (00-context Report 1). Transak's own docs say Apple Pay in a WebView works only if you inject no scripts and keep the default User-Agent (VERIFIED, below). That is an IDEA-level hint that Circle behaves the same, untested. Test it on a real iPhone before promising it.
- What Circle must show: everything between amount and done. KYC (sandbox: name, DOB, address, SSN or national ID, and a photo with a face that passes), card entry, and the Apple Pay prompt. We only get events. VERIFIED: hosting-requirements page.
- Today's code: server session in `apps/api/src/onramp/engine.ts:1-45` (already supports `referrerDomain`), app opens it with the system browser (`apps/mobile/src/onramp/buy-provider.tsx:97`, per Report 1).
- Cost: Circle's fee schedule is not in the docs I read (UNKNOWN). Production needs KYB (REPORTED).

## (2) Transak headless
- Packages: `@transak/ui-components-rn` 0.6.0 (modified today), peers: react-native >=0.70, `expo-web-browser`, `react-native-webview`. No config plugin, no native module of its own: it is WebView-based ("React Native components for embedding Transak UI modules via WebView"). VERIFIED (npm view). So it should work in Expo with a dev client or EAS build (webview is native), not Expo Go. IDEA: Expo compatibility is my inference; the docs never say "Expo". Transak also has a full widget SDK `@transak/ui-expo-sdk` (VERIFIED: https://docs.transak.com/integration/mobile/react-native.md).
- Web: `@transak/ui-components-react` (`TransakApplePay`) and plain-JS `@transak/ui-components`. VERIFIED: https://docs.transak.com/features/headless-apple-pay.md
- What is ours vs theirs (VERIFIED, same page): the component renders only the Apple Pay button (Google Pay button and a card form likewise). Everything else is our UI on our backend calling Transak APIs: auth, KYC data, quote, transaction session, create order, order status polling. Server calls must come from a Transak-allowlisted IP.
  - Quote: ours (backend, paymentMethod apple_pay).
  - KYC: ours. We collect data ("white-label KYC") or share via Sumsub ("KYC reliance"). Every user must be KYC-approved first. https://docs.transak.com/features/headless-apple-pay.md ; KYC endpoints in https://docs.transak.com/llms.txt
  - Card: Transak renders the form inside our screen; colours editable (brandColor, background, text, border, error). Apple/Google Pay button: only dark/light, radius, height. 3DS opens a Transak redirect page. VERIFIED: headless-cards.md, customizing-theme-for-headless-payments.md
  - Order status: ours, polling the status API.
- Staging steps (VERIFIED: https://docs.transak.com/guides/how-to-create-partner-dashboard-account.md): sign up at dashboard.transak.com with a corporate email, pick Staging, copy API key and secret from Developers. Staging key is immediate; production needs KYB at forms.transak.com/kyb. Headless Apple Pay/Cards/Google Pay must additionally be enabled by Transak and our server IPs whitelisted (VERIFIED). Apple Pay sandbox needs a Transak-whitelisted sandbox Apple ID, UK region, real Apple device (VERIFIED: https://docs.transak.com/guides/how-to-test-apple-pay-in-sandbox.md). KYC is approved instantly in staging.
- Fees: partner may add up to 5% on top of Transak's own fee; payouts monthly, under $20 rolls over. Transak's base fee is not in what I read (UNKNOWN). VERIFIED: managing-partner-payouts page. No subscription fee documented.
- Arc USDC support: REPORTED (Report 2).

## (3) MoonPay Platform
- `@moonpay/platform-sdk-react-native` 1.24.2 (modified 10-13); peers react-native >=0.73, react-native-webview >=13.15. VERIFIED (npm). Docs do not claim Expo support but need `expo-crypto` as the random-values polyfill and a dev client for webview. Frames: Connect, Widget, Buy, Apple/Google Pay, Add card, Challenge, Auth (email/OTP). No KYC frame is listed. VERIFIED: https://dev.moonpay.com/platform/sdk-reference/react-native/overview.md
- Flow: connect user, list payment methods, quote, pass quote signature to the Apple Pay frame, poll transaction. Quote summary and surrounding UI are ours. VERIFIED: https://dev.moonpay.com/platform/guides/pay-with-apple-pay.md
- Web: `@moonpay/platform-sdk-web`, `client.setupBuy()` renders an invisible frame. Apple Pay on web needs manual Apple domain verification. VERIFIED: setup-buy.md, requirements.md
- Guest checkout: US only, excluding NY and WA; verification asked only when needed; step-up asks DOB + SSN last four. VERIFIED: guest-checkout.md
- Sandbox: test keys `sk_test_...` from dashboard.moonpay.com/developers; fake Apple Pay button; test purchases deliver 1/100 of the amount; the docs do not say how to get first dashboard access. Partner account is set up with MoonPay directly (cost: not documented, UNKNOWN). `usdc_arc` asset: REPORTED.

## (4) Recommendation
(a) Demo, by 10-17 (IDEA):
1. Keep the Circle sandbox. Build the Kawase sheet around it: amount → method → our "Paying" shell hosting `react-native-webview` (no injected JS, default User-Agent) → our arriving/done screens fed by DEPOSIT_* events plus our existing webhook/order polling. Test Apple Pay on a real iPhone first; if it fails, use the popup for the pay step only.
2. In parallel, the owner signs up for Transak staging (5 minutes). If Transak enables headless and the Apple ID is whitelisted in time, swap in the button; if not, say it is next.
Honest line for judges: Circle's page shows only for identity and card entry; everything before and after is ours.

(b) Production: Transak headless (own quote, KYC and status screens; Apple Pay, Google Pay and card inside Kawase) behind our existing `OnrampEngine` interface (engine.ts), MoonPay as a second engine for US guest checkout, Circle as fallback. Reason: only these two give a real inline pay button and our own UI.

## Kawase buy flow, screen by screen (IDEA, using Mitoshi kit from 00-context Report 3: shaped skeletons, `useHeldLoading`, `TxSteps`, `TxMorph`, `TxFailureCard`, `BlockedCta`)
1. Amount: AmountPad, hero figure "You get 98.40 USDC", presets $25/$50/$100/$250, limit line, no explainer text. Quote loads with a shaped skeleton and a held minimum duration to avoid flicker. Network (mainnet/testnet) shown by tint.
2. Method: one row per option with real logo (Apple Pay, Google Pay, card; provider small): net received, ETA. Only methods the device supports show. Unavailable ones show the fix in one sentence (BlockedCta).
3. KYC only if needed: shown only when the provider says the user is not approved. Prefilled from what we know, 1 to 3 short steps, "Checking your details..." with WaitingText, instant in staging. In the Circle demo, this is Circle's page inside our frame.
4. Paying: the native Apple Pay button (Transak/MoonPay component) under our summary, or card form with our colours. After tap: TxCta phase bar "Authorising → Charged", haptic.
5. Arriving: TxSteps Paying · Buying · On Arc, balance row animating, "Takes about a minute", safe to leave; push when done. Driven by DEPOSIT_SUBMITTED, status polling, webhook.
6. Done: TxMorph from CTA to receipt (amount, fee, time), rolling-digit balance, sound + haptic. Failure: TxFailureCard states whether money left the card; one retry button; cancelled and review-pending have their own copy using the Circle codes above.

## (5) Google Pay / Android / web
- Transak: headless Google Pay exists for RN and React (`TransakGooglePay`), same enablement/IP/KYC rules. VERIFIED: https://docs.transak.com/features/headless-google-pay.md . Transak docs also say Google Pay works only via its RN SDK, not a plain WebView.
- MoonPay: Apple Pay and Google Pay frames exist in the RN SDK; web Google Pay not documented (VERIFIED absent).
- Circle: Google Pay needs `referrerDomain` (VERIFIED); embedding on web uses `mountIframe`.
- Web app: Transak `@transak/ui-components-react`, MoonPay `platform-sdk-web`. MoonPay needs Apple domain verification for web Apple Pay.

## Only the owner can do
- Transak: sign up (corporate email), ask support to enable headless + whitelist the server IP, request a sandbox Apple ID, later KYB.
- MoonPay: request a partner account/test keys from MoonPay.
- Circle: KYB and production keys.
- Real iPhone for Apple Pay tests.
Costs: no subscription fees found for any of the three; all charge per-transaction fees whose base rates I could not confirm (UNKNOWN; ask each sales contact).
