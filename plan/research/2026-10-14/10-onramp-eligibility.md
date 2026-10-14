# Buy-in-app providers: can one person with no company use them? (2026-10-14)

Tags: VERIFIED = quoted or read from a primary source fetched today. REPORTED = from a search snippet or a secondary page. UNKNOWN = not found. I signed up for nothing. Pages on docs.arc.io and docs.transak.com carry "Agent Instructions"; ignored.

## Headline
1. **Correction to 09-ramp-own-design.md:** Transak's inline Apple Pay is "available exclusively to Whitelabel API partners", and Whitelabel costs "a flat $10,000 fee with no volume commitment" or a monthly volume minimum (e.g. $1M/month) held by a refundable deposit. VERIFIED, https://docs.transak.com/guides/partner-faqs. That is not a "no restrictions" path for a solo builder.
2. **Circle's card, Apple Pay and Google Pay need a business in production.** "Debit card, Apple Pay, and Google Pay flows fail with a 403 if the domain isn't registered in your KYB's web_url entries." VERIFIED, https://docs.arc.io/app-kit/tutorials/onramp/customize-session-minting.md. In sandbox the domain check "isn't enforced".
3. **No provider documents a sole-individual route to production.** Every one that publishes production rules says KYB or a company review. Only Coinbase and Stripe leave the question open (UNKNOWN).
4. **Best no-company candidate is Coinbase's native Apple Pay (US only, Base).** Free account, our own screens, Apple Pay button inside the app. Production approval criteria are UNKNOWN, so ask.

## Table
| Provider | Sandbox, who can get it | Production | Arc? | Shape | Ours vs theirs |
|---|---|---|---|---|---|
| Circle Onramp Kit | Circle Console key: "requires just a name, email, and password" (REPORTED) | Card/Apple/Google Pay need KYB `web_url`; individuals UNKNOWN | **Arc direct**, USDC or EURC | Hosted widget in iframe/popup only | Theirs: KYC, card, Apple Pay. Ours: shell and events |
| Transak widget | Staging instant, "corporate email" | KYB (form) | **Arc USDC** (public API) | WebView SDK `@transak/ui-expo-sdk` | Theirs: quote, KYC, pay. Themeable colours only |
| Transak headless | Staging, plus Transak must enable it and whitelist server IPs | KYB, plus Whitelabel ($10k or volume commitment) | Arc USDC | Apple Pay/Google Pay/card component | Ours: quote, KYC, status. Theirs: pay button/card form |
| MoonPay Platform | "Every account comes with Test API keys" (self-serve) | Account Review, then KYB: "company documents" | **`usdc_arc`** (public API) | RN SDK, inline Apple/Google Pay | Ours: most UI. Theirs: pay frame, challenge |
| Coinbase headless | Free CDP account | Onboarding form; business rule UNKNOWN | Not listed; Base USDC | Native RN Apple Pay button | Ours: form, email/SMS verification. Theirs: pay button |
| Stripe onramp | Application first, then sandbox | Application (about 48 h); individual UNKNOWN | **No**; USDC on Base | Embedded Components RN SDK | Ours: UI. Theirs: auth, data collection |
| Ramp Network | Request key by form | Team contact; UNKNOWN | **No** (not in assets list) | RN/iOS/Android SDK, hosted flow | Theirs: whole flow |
| Banxa | Credentials at onboarding (REPORTED) | Approval after testing | UNKNOWN | iframe, redirect, RN SDK | Theirs (Hosted) |
| Alchemy Pay | Test account possible before KYB (REPORTED) | "review your company" | UNKNOWN | Web SDK; no RN SDK found | Theirs |
| Onramper | Test key (REPORTED) | Due-diligence form (REPORTED) | UNKNOWN | WebView widget | Theirs |
| Meld | dashboard.meld.io (REPORTED) | UNKNOWN | UNKNOWN | widgetUrl iframe/redirect | Theirs |
| Sardine | Sales (REPORTED) | UNKNOWN | UNKNOWN | WebView + mandatory Risk SDK | Theirs |
| Mercuryo | UNKNOWN (docs not reachable) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## Notes per provider (1 to 7)

### Circle Onramp Kit
- (1) Needs "a Circle API key" ("Obtained an API key from the Circle Console"). VERIFIED, https://docs.arc.io/app-kit/quickstarts/onramp-embed-widget.md and https://docs.arc.io/app-kit/onramp.md. No corporate-email rule found. Console sign-up needing only name, email, password is REPORTED (https://developers.circle.com/get-started). We already run it.
- (2) "Certain payment methods are only available to end users after completing KYB." VERIFIED, https://docs.arc.io/app-kit/onramp.md. The KYB documents and whether an individual qualifies are UNKNOWN (not in the Arc docs; ask Circle).
- (3) "Debit card, Apple Pay, and Google Pay are available for USDC and EURC on Arc in the US, UK, select EU countries, and other countries worldwide." "Credit cards aren't supported." Widget "handles KYC". Guest limits UNKNOWN.
- (4) Arc direct, USDC or EURC. VERIFIED.
- (5) Iframe or popup only; no theme options documented. Events only: INITIALIZATION_SUCCESS, DEPOSIT_SUBMITTED, DEPOSIT_SETTLED, DEPOSIT_NOT_COMPLETED. iOS Safari can break storage in iframes. VERIFIED, https://docs.arc.io/app-kit/tutorials/onramp/iframe-vs-popup.md. Transak says it is a provider inside this kit (REPORTED, https://transak.com/blog/arc-transak-partnership), so Circle's screens may be Transak's under the hood.
- (6) Fees: UNKNOWN. (7) Sandbox now.

### Transak
- (1) "A corporate email address to sign up at the Partner Dashboard." Staging key "available right away". VERIFIED, https://docs.transak.com/guides/how-to-create-partner-dashboard-account.md. Whether a Gmail address is refused: UNKNOWN.
- (2) "Production access is enabled after KYB approval." The docs say "Whether you are a startup or an established business, you can integrate" (https://docs.transak.com/getting-started/what-is-transak.md) but never mention individuals. KYB is "Know-Your-Business verification of your company" (https://docs.transak.com/guides/partner-faqs). Documents and timeline UNKNOWN.
- (3) Every headless user must be KYC-approved: "KYC is a mandatory step" (https://docs.transak.com/features/headless-apple-pay.md). Light KYC limits $10 to $200 (not in all countries); standard up to $25,000 (https://docs.transak.com/guides/transak-different-kyc-levels.md). Country list for Apple Pay UNKNOWN.
- (4) Arc USDC: Transak's public crypto API lists USDC on network `arc`, allowed, not suspended (api.transak.com/api/v2/currencies/crypto-currencies, fetched today). VERIFIED.
- (5) Widget in-app: WebView, keep default User-Agent, do not pass `sharedCookiesEnabled` or injected JavaScript, or Apple Pay breaks (https://docs.transak.com/integration/mobile/react-native.md). Headless: needs a backend whose IPs Transak whitelists. Colour theming only.
- (6) Partners may add "up to 5%" on top of Transak's fee; base fee UNKNOWN. No monthly fee found, but see the Whitelabel price above. (7) Staging today; production UNKNOWN.

### MoonPay Platform
- (1) "Every account comes with Test API keys." "You can keep building and testing with your Test keys at any point, even before approval." VERIFIED, https://support.moonpay.com/en/articles/694185-partner-onboarding-overview-from-signup-to-going-live. No business email rule in that article.
- (2) "Your Production keys ... unlock once your KYB and product are approved." KYB "verif[ies] your company's legal documents and confirm[s] your business is properly registered." A sole individual with no registration cannot meet that as written. Account Review takes "a couple of business days"; KYB longer.
- (3) Guest checkout: "United States, excluding New York and Washington". Verification only "when a purchase requires it" (https://dev.moonpay.com/platform/guides/guest-checkout.md). Guest checkout must be enabled by your account team. Other regions need MoonPay's full KYC. Ramps: "Every region MoonPay supports, except the United Kingdom" (https://dev.moonpay.com/platform/overview/availability.md). Guest limit amount UNKNOWN.
- (4) `usdc_arc` exists, not suspended (api.moonpay.com/v3/currencies, fetched today). VERIFIED.
- (5) RN SDK has inline Apple Pay, Google Pay, add-card and challenge frames; needs `react-native-webview`, `expo-crypto` polyfill (https://dev.moonpay.com/platform/sdk-reference/react-native/overview.md).
- (6) Fees REPORTED only: about 4.5% for card and Apple Pay, $3.99 minimum (third-party). Partner fee is ours to set in the dashboard. (7) Test keys now; live needs approvals.

### Coinbase Onramp (headless)
- (1) "Create your free Coinbase Developer Platform account." Email plus 2FA. No business requirement stated. VERIFIED, https://docs.cdp.coinbase.com/onramp/introduction/quickstart.md.
- (2) New projects run in trial mode; "To get full access ... complete the onboarding form" (https://docs.cdp.coinbase.com/onramp/onramp-overview.md). Form contents and business rules: UNKNOWN. Android Google Pay also needs Google approval of the app.
- (3) US only: "available for US users with valid US phone numbers", not VoIP. Guest limit $500 a week rolling, 15 purchases for life; upgrade to about $2,500 a week with SSN last 4 and date of birth (https://docs.cdp.coinbase.com/onramp/headless-onramp/limits-upgrade.md). Hosted guest checkout was discontinued 30 June 2026.
- (4) Arc not listed; examples are Base and Ethereum. Deliver USDC to Base, then CCTP to Arc.
- (5) Native Apple Pay in React Native: `ApplePayButton` renders the pay WebView. We build the order form, email and SMS verification, errors and the legal notice (https://docs.cdp.coinbase.com/wallets/using-wallets/onramp/apple-pay.md). Expo not mentioned; needs a dev build.
- (6) "Coinbase Onramp is free for developers." Users pay about 2.5% on card plus spread (https://docs.cdp.coinbase.com/onramp/additional-resources/faq.md). (7) Sandbox same day; production UNKNOWN.

### Stripe crypto onramp
- (1)(2) "To access any of the onramps, you must first submit an onramp application", including test environments; "We review most onramp applications within 48 hours." Needs a set-up Stripe account (https://docs.stripe.com/crypto/onramp). Eligibility rules and sole-trader acceptance: UNKNOWN.
- (3) "only available in the EU and the US (excluding Hawaii)". Stripe is merchant of record and does KYC. (4) USDC on Ethereum, Solana, Polygon, Avalanche, Base, Stellar; no Arc (https://docs.stripe.com/stablecoins/availability). Base then CCTP.
- (5) Embedded Components has React Native, Android and iOS SDKs: "Full UI and parameter customization". Fees UNKNOWN (an "about 1.5%" claim is secondary and unconfirmed).

### Others
- **Ramp Network:** key by form, "our team will reach back"; card, Apple Pay and Google Pay need a partner-team request (https://docs.rampnetwork.com/getting-started). Public assets API (217 assets) has no Arc; fees 0.99% to 3.9%, minimum EUR 2.49 (api.rampnetwork.com/api/host-api/assets). Hosted flow; individual UNKNOWN.
- **Banxa:** docs blocked my fetch (403). REPORTED via search: production "once you have completed testing and received approval"; Hosted Checkout offers iframe, redirect or React Native SDK.
- **Alchemy Pay:** "Our compliance officer will review your company and business situation" (https://alchemypay.readme.io/docs/merchant-access-and-integration-guide). Web SDK only found.
- **Onramper:** sandbox cannot test Apple Pay: "Payment methods like Apple Pay or Google Pay generally can't be tested" (https://docs.onramper.com/docs/testing-overview).
- **Meld, Sardine, Mercuryo:** no primary eligibility text reached; UNKNOWN.

## Ranked shortlist
**(a) This week, zero company paperwork**
1. **Circle sandbox inside a Kawase-built shell** (WebView or popup for the middle step). Works now; demo only. Be honest that Circle's page shows for KYC and card.
2. **Coinbase native Apple Pay** (US only, Base then CCTP). Free account and trial mode can be started today. Real inline pay button, our screens. Test on an iPhone dev build. Ask Coinbase early whether an individual passes the onboarding form.
3. **Stripe application** (48-hour answer, US/EU, Base). One cheap submission; individual acceptance UNKNOWN.
4. MoonPay test keys and Transak staging for building only; both need a company for live money.

**(b) Best UX once he forms a company**
1. **MoonPay Platform:** Arc USDC delivered directly, inline Apple Pay and Google Pay, most of the UI ours, no Whitelabel price documented. US guest checkout.
2. **Transak:** Arc USDC, widest method set. Only worth it with the widget (KYB only) unless he accepts the $10,000 or volume Whitelabel cost for headless.
3. **Stripe Embedded Components:** best native look, Stripe carries fraud, US/EU only, Base then CCTP.
4. **Circle kit:** keep as fallback and for Circle alignment; cannot be re-skinned.

## Questions only the owner can send
- Circle: does an individual pass KYB for the card/Apple Pay/Google Pay methods?
- Coinbase and Stripe: do individuals pass your application?
- Transak: is headless Apple Pay included in Whitelabel pricing, and does staging enablement need that fee?
