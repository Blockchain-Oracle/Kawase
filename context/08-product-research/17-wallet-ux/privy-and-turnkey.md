# Privy and Turnkey as the embedded wallet for Kawase (deep dive)

Purpose: what Privy and Turnkey each give a one-codebase Expo SDK 57 / React Native 0.86.3 app on Arc that needs an ordinary EOA key able to sign (1) an EIP-7702 authorization, (2) EIP-712 typed data and (3) ordinary transactions through our own RPC, with passkey / Face ID-grade UX instead of a PIN per action.

Verified: 2026-09-30

Sources (all fetched 2026-09-30; raw copies under `.firecrawl/product/17/`):
- `P:` = `privy-llms-full.txt` (Privy's full docs, https://docs.privy.io/llms-full.txt). Cited as `P:line`.
- `T:` = `turnkey-llms-full.txt` (Turnkey's full docs, https://docs.turnkey.com/llms-full.txt). Cited as `T:line`.
- npm tarballs: `@privy-io/expo@0.75.0` (`privy-expo-0.75.0-package.json`, `privy-expo-0.75.0-exports.txt`), `@privy-io/js-sdk-core@0.77.0`, `@privy-io/chains@0.6.1` (`privy-chains-0.6.1-arc.txt`), `@turnkey/react-native-wallet-kit@2.3.7` (`turnkey-rn-wallet-kit-2.3.7-package.json`, `turnkey-rn-wallet-kit-CHANGELOG.md`), `@turnkey/core@2.12.0` and `@turnkey/viem@0.14.43` (`turnkey-sdk-typings-extract-2026-09-30.txt`).
- Turnkey OpenAPI: `turnkey-public_api.swagger.json` (https://docs.turnkey.com/public_api.swagger.json).
- Privy React Native SDK changelog: `privy-react-native-changelog.md` (https://docs.privy.io/changelogs/react-native.md).
- Example apps: `privy-expo-starter-*.json` (github.com/privy-io/examples `privy-expo-starter`), `turnkey-rn-example-*.json` (github.com/tkhq/sdk `examples/demos/with-react-native-wallet-kit`).
- GitHub searches and commit dates: `gh-issues-privy-turnkey-2026-09-30.txt`, `privy-gh-issues-expo.txt`, `turnkey-gh-issues-rn.txt`, `passkey-libs-gh-issues.txt`.
- Pricing: `privy-pricing.txt`, `privy-pricing.html`, `privy-pricing-matrix-checks.txt` (https://www.privy.io/pricing); `turnkey-pricing.txt`, `turnkey-pricing.html`, `turnkey-pricing-matrix-checks.txt` (https://www.turnkey.com/pricing). The `*-matrix-checks.txt` files count check icons per row in the saved HTML, because the plain-text copies lost them.
- Passkey domain checks: `psl-sslip-grep.txt`, `psl.dat` (https://publicsuffix.org/list/public_suffix_list.dat), `sslip-domain-check.txt` (live curl/openssl), `apple-supporting-associated-domains.json` (Apple "Supporting associated domains"), `letsencrypt-rate-limits.html` (https://letsencrypt.org/docs/rate-limits/).
- Our app: `apps/mobile/package.json`, `apps/mobile/app.json`, `pnpm-workspace.yaml`; on-chain limit design: `plan/spikes/15-eip7702-limits.md`.
- Earlier file this one extends: `context/08-product-research/03-wallets-custody-limits/third-party-wallet-infra.md`.

Tags: [VERIFIED] primary source checked today; [REPORTED] secondary; [INFERENCE] my reasoning; [UNKNOWN] looked, not confirmed. Nothing here was run: no account was created, no app was built, no transaction was sent. Every "works" below means "documented or present in the published package", not "tested by us".

---

## 0. Short answer to the three signing requirements

| Must sign | Privy (`@privy-io/expo` 0.75.0) | Turnkey (`@turnkey/react-native-wallet-kit` 2.3.7) |
|---|---|---|
| EIP-7702 authorization | `useSign7702Authorization().signAuthorization({contractAddress, chainId, nonce?, executor?})` is exported by the package, added in 0.68.0 [VERIFIED, `privy-expo-0.75.0-exports.txt`, `privy-react-native-changelog.md:264`]. The docs page still shows only the raw-hash route for React Native: `provider.request({method:'secp256k1_sign', params:[hashAuthorization(...)]})` [VERIFIED, P:108638-108670]. | API activity `signRawPayload` with `encoding: PAYLOAD_ENCODING_EIP7702_AUTHORIZATION` [VERIFIED, swagger `PayloadEncoding`]; `@turnkey/viem` wraps it as `signAuthorization(client, {contractAddress, chainId, nonce}, organizationId, signWith)` [VERIFIED, `turnkey-sdk-typings-extract-2026-09-30.txt`]. |
| EIP-712 typed data | `provider.request({method:'eth_signTypedData_v4', params:[address, typedData]})` [VERIFIED, P:111023-111055] | `signRawPayload` with `PAYLOAD_ENCODING_EIP712`; `@turnkey/viem` `signTypedData` [VERIFIED, same files] |
| Ordinary transaction on a custom chain through our RPC | `provider.request({method:'eth_sendTransaction'})`; the chain and its RPC come from `supportedChains` (viem `defineChain`) [VERIFIED, P:23690-23760, P:107762-107790] | `signTransaction` then broadcast ourselves, or `signAndSendTransaction({..., rpcUrl})` [VERIFIED, T:111338, T:111379-111384]; Turnkey-broadcast `ethSendTransaction` lists `eip155:5042` and `eip155:5042002` [VERIFIED, swagger `EthSendTransactionIntent.caip2`] |

Neither provider is ruled out by the three requirements on paper.

---

## 1. Privy

### 1.1 End-user experience

**a. Onboarding**

- Email code: app calls `sendCode({email})`, user types the code, app calls `loginWithCode({code, email})` (`useLoginWithEmail`) [VERIFIED, P:24498-24545]. The code is valid for 10 minutes [VERIFIED, P:20552]. Two screens of our own design; Privy shows no UI ("Privy's React Native SDK is whitelabel by default") [VERIFIED, P:92072, `privy/authentication_user-authentication_whitelabel.md`].
- Wallet creation: automatic at login with `config.embedded.ethereum.createOnLogin: 'users-without-wallets'` on `PrivyProvider` [VERIFIED, P:23618-23640]. No extra user step.
- Passkey: `signupWithPasskey({relyingParty})` / `loginWithPasskey({relyingParty})` from `@privy-io/expo/passkey`; one system passkey sheet (Face ID / fingerprint) [VERIFIED, P:11579, `privy/authentication_user-authentication_login-methods_passkey.md:483-560`]. `relyingParty` is "the URL origin where your Apple App Site Association or Digital Asset Links are available".
- Google / Apple: `useLoginWithOAuth().login({provider:'google'|'apple'})`; opens the provider's page in the system browser and returns by URL scheme; Apple on iOS uses native Sign in with Apple through `expo-apple-authentication` [VERIFIED, P:10948-11030, P:23944]. Toggling a provider on in the dashboard "will use default OAuth credentials that the Privy team has configured"; own credentials are recommended before production, and users who logged in under the default credentials cannot be migrated ("we do not yet support migrating these users") [VERIFIED, P:20655-20669, P:20726-20727].
- Our existing Better Auth login could be reused instead: Privy accepts any JWT/OIDC issuer (JWKS endpoint), and the React Native SDK supports it, but the dashboard step is "Request access to **Custom authentication**" [VERIFIED, P:8584-8606, P:8869]. How long that request takes: [UNKNOWN].

**b. Per action**

- Headless. "The Expo SDK does not support built-in UIs for sending transactions. The `eth_sendTransaction` method gives you complete control over the experience and UI." [VERIFIED, P:107769]. Same sentence for typed data [VERIFIED, P:111030]. So the app shows its own confirm card and then the signature happens with no provider prompt.
- 7702 authorization: also headless (hook or raw hash, table above) [VERIFIED].
- Face ID when we want it: Privy's tool is **wallet MFA**. Once a user enrolls, "the user must complete MFA verification for actions that use the embedded wallet's private key" (sign, send, export, recover on a new device), "subject to the MFA verification duration" [VERIFIED, P:17598]. Passkey is one of three MFA methods and is "recommended"; to use it "you *must* also enable passkeys as a login method" [VERIFIED, P:17605-17609, P:17661]. On React Native: `useMfa().init({method:'passkey'})` then `submit({method:'passkey', mfaCode: options})`, which "will trigger the system's native passkey prompt" [VERIFIED, P:18265-18292].
- MFA is all-or-nothing per user, softened by a cache: the MFA token stays valid 15 minutes by default, configurable in the dashboard; `useMfa().clear()` drops it locally so the next action prompts again [VERIFIED, P:64039-64150].
- "Silent for small, Face ID for large" inside Privy is the **policy-based MFA** recipe: small transactions are signed by *our server's* authorization key (a signer with a policy) with no prompt; anything outside the policy must be signed by the user, which triggers MFA [VERIFIED, P:62499-62520]. With our on-chain design (spike 15) the small amounts are already spent by our server wallet under the on-chain limit, so every *user* signature (the 7702 authorization, a delegation on limit change, a large send) can simply require the passkey [INFERENCE].
- An app-level biometric gate (for example `expo-local-authentication`) before calling the provider is also possible with either vendor, but it is enforced only by our app, not by the wallet provider [INFERENCE].

**c. Sessions, new device, lost phone**

- Access token: 1 hour, refreshed automatically. Refresh token: 30 days by default, "configurable" in the dashboard (User management > Authentication > Advanced); session duration can be set per app client. After it expires the user must log in again [VERIFIED, P:18796-18918, P:20394-20396]. Maximum configurable duration: [UNKNOWN, not stated].
- Session storage on the phone: `expo-secure-store`; default access policy needs the device unlocked once after restart [VERIFIED, P:23907].
- New device: with TEE execution (the default, 1.5 below) the wallet is not tied to the device; the user logs in again and signs. "User-managed recovery (like cloud recovery) will no longer be prompted on new devices" under TEE [VERIFIED, P:71175]. If MFA is enrolled, new-device recovery also requires MFA [VERIFIED, P:17598].
- Lost phone: log in on another device with the same login method (email / Google / Apple / a synced passkey). Privy's own warning: "Account access is wallet access. If the delegated provider suspends or deletes an account, access to the wallet may be permanently lost" [VERIFIED, P:20538]. A user whose only method is a passkey that was not synced has no documented recovery path [INFERENCE].

### 1.2 React Native / Expo

- Package: `@privy-io/expo` **0.75.0**, published 2026-09-28 [VERIFIED, npm]. Requirements line in the docs: "iOS and Android platform support (Web is not supported)" [VERIFIED, P:24286].
- Install command from the docs: `npx expo install @privy-io/expo expo-application expo-crypto expo-linking expo-secure-store expo-web-browser react-native-webview expo-apple-authentication react-native-passkeys @privy-io/expo-native-extensions` [VERIFIED, P:24295]. Peer dependencies in 0.75.0: `@privy-io/expo-native-extensions` 0.0.12, `expo-application`, `expo-crypto`, `react-native-webview`, `react-native-passkeys` ^0.4.0 and others; optional peers include `viem` pinned to exactly `2.56.0` and `permissionless` ^0.2.47 [VERIFIED, `privy-expo-0.75.0-package.json`]. Our catalog has viem 2.57.0 (`pnpm-workspace.yaml:15`), so pnpm will report a peer mismatch; whether it matters at runtime: [UNKNOWN].
- Polyfills: `fast-text-encoding`, `react-native-get-random-values`, `@ethersproject/shims`, imported before the router entry (our `main` is `expo-router/entry`, so it must become a custom `entrypoint.js`) [VERIFIED, P:24317-24345]. Metro: a `resolveRequest` override for `isows`, `zustand` and `jose`; TypeScript `moduleResolution: "Bundler"` [VERIFIED, P:24386-24460].
- Dev build: the docs' build guide assumes "an expo development build" [VERIFIED, P:24390]; passkeys and native Apple login need native modules. We already build natively (`apps/mobile/ios`, Circle Podfile plugin).
- Evidence for Expo SDK 57 / RN 0.86 / new architecture:
  - 0.75.0 was built against `expo 56.0.9`, `react-native 0.85.3`, `react 19.2.3` (devDependencies) and peers are `react-native: "*"` [VERIFIED, `privy-expo-0.75.0-package.json`]. That is one SDK behind ours.
  - Privy's own `privy-expo-starter` is still on Expo 54 / RN 0.81.4 / `@privy-io/expo ^0.58.1`; its last dependency change was 2025-10 (a naming commit on 2026-07-15) [VERIFIED, `privy-expo-starter-package.json`, `gh-issues-privy-turnkey-2026-09-30.txt`].
  - No Privy doc page mentions Expo SDK 55-57, RN 0.82+, or "new architecture" (grep of `P:`), and neither does the SDK changelog [VERIFIED absence, `privy-react-native-changelog.md`].
  - The SDK is actively released: 14 versions between 2026-08-11 and 2026-09-28 [VERIFIED, npm `time`]. The changelog shows the embedded wallet runs through a hidden WebView on native: "Fixed embedded wallet transport recovery after a WebView process terminates" (0.73.1), "Fixed embedded wallet reconnection after iOS terminates the WKWebView content process" (0.70.4), "Fixed Android MFA and wallet shares writing to WebView localStorage" (0.74.0) [VERIFIED, same file]. So `react-native-webview` is on the signing path, and these were live bugs in the last two months.
  - GitHub issue search for `"@privy-io/expo"` updated since 2026-06-30: 6 hits in third-party repos, none reporting an Expo 57 / RN 0.86 failure [VERIFIED, same file]. The package declares no source repository and sends bugs to `https://privy.io/slack` (`package.json`), and no public issue tracker for the SDK was found, so the absence of issues is weak evidence.
  - Net: Expo 57 / RN 0.86.3 compatibility is [UNKNOWN]; nothing found against it, nothing found for it.
- Passkeys: library `react-native-passkeys` (0.4.2, peer `expo >=53`) [VERIFIED, `npm-native-deps-2026-09-30.txt`]. iOS: `associatedDomains: ["webcredentials:<domain>"]` plus `https://<domain>/.well-known/apple-app-site-association` with `{"webcredentials":{"apps":["<teamID>.<bundleID>"]}}`; docs examples set iOS deployment target 15.0 (the starter uses 17.5). Android: `https://<domain>/.well-known/assetlinks.json` with package name and SHA-256 certificate fingerprint, **and** the same fingerprint added to "allowed Android key hashes" in the Privy dashboard [VERIFIED, `privy/basics_react-native_advanced_setup-passkeys.md`]. Open issue in the passkey library: `create()` with a security key does not complete on iOS 26 (#68) [VERIFIED, `passkey-libs-gh-issues.txt`].
- Web: the Expo package does not support web [VERIFIED, P:24286]; a third-party repo reports "Privy is stubbed out on web, so the entire EVM path is untestable in a browser" (b-bhu/myboon#266) [REPORTED]. Expo web therefore needs `@privy-io/react-auth` (3.46.0) in `.web.tsx` files with the same app ID [INFERENCE]. Same user, same wallet across web and native follows from TEE execution (the key is not on the device) and one user record per app, but no doc sentence states it for this exact pairing [INFERENCE]. On web, React wallet calls show Privy confirmation modals unless `showWalletUIs` is set to `false` [VERIFIED, P:110965-110971]. Which rpId the web SDK uses for passkeys, and so whether one passkey works on both web and native: [UNKNOWN, no statement found].

### 1.3 Arc

- `@privy-io/chains@0.6.1` ships `arcMainnet` (5042) and `arcTestnet` (5042002), both with Privy-hosted RPC URLs and native currency `USDC` with `decimals: 18` [VERIFIED, `privy-chains-0.6.1-arc.txt`, earlier file].
- Own RPC: `addRpcUrlOverrideToChain(chain, 'https://rpc.testnet.arc.io')` from `@privy-io/chains`, or a viem `defineChain`, passed to `supportedChains` [VERIFIED, P:23766-23780]. "Privy embedded wallets can support *any* EVM-compatible chain" [VERIFIED, P:23690].
- How a send actually runs in the client core: populate with a viem client (`prepareTransactionRequest`), sign with the wallet, then `eth_sendRawTransaction` through the chain's JSON-RPC; `authorizationList` is carried through populate [VERIFIED, minified `@privy-io/js-sdk-core@0.77.0 dist/esm/index.mjs`, excerpt at the end of `privy-expo-0.75.0-exports.txt`]. So population and broadcast use the RPC we configure [INFERENCE from that code].
- Server side (`@privy-io/node`, REST): `eth_sendTransaction` with `caip2: 'eip155:<id>'`; type-4 transactions are supported on that endpoint since February 2026 [VERIFIED, P:29659 changelog]. Whether the REST send path accepts `eip155:5042` with Privy's own RPC is not stated on the chain page, which says only "Ethereum: Includes EVM-compatible networks" [VERIFIED, `privy/wallets_overview_chains.md`] → [UNKNOWN]; we do not need it if the client broadcasts through our RPC.
- 7702 method names: client `useSign7702Authorization` → `signAuthorization`; raw `secp256k1_sign`; REST/Node `eth_sign7702Authorization` [VERIFIED, P:108528-108800, pricing FAQ list of signature endpoints in `privy-pricing.txt`].
- What the Expo hook does in 0.75.0 (read from the minified bundle): it looks the `chainId` up in the chains given to `PrivyProvider` (throws "Error, chain not configured in PrivyProvider config" otherwise), calls viem `prepareAuthorization` over that chain's RPC to fill the nonce, then asks the wallet for `secp256k1_sign` over `hashAuthorization(...)`. So it is chain-generic, uses the RPC we configure, and needs `viem` installed; `chainId: 0` requires an explicit nonce [VERIFIED, `privy-expo-0.75.0-exports.txt`].

### 1.4 Agent authority while the user is away

- **Signers**: the user (through the client hook `useSigners().addSigners({address, signers:[{signerId, policyIds}]})`, present in the Expo package) adds our server's authorization key to the wallet; the server then signs through the Node SDK or REST "even when the user is offline" [VERIFIED, `privy-expo-0.75.0-exports.txt`, P:75838, P:62630-62650]. Requires TEE execution [VERIFIED, P:71120-71124].
- **Policy engine**: per-method rules, allow/deny lists, calldata and EIP-712 conditions, default deny (earlier file). New since the earlier file: **stateful policies** ("aggregations") give rolling-window sums, so daily caps are expressible; window 1 to 72 hours; "Each app can have a maximum of **10 aggregations**" [VERIFIED, P:38390-38407, P:38515].
- Free tier: the pricing matrix shows a check in both the Developer and Enterprise columns for "Policy engine" and "Delegated access to wallets" [INFERENCE from the page DOM, two check icons per row: `privy-pricing-matrix-checks.txt`; the plain-text copy lost the icons].

### 1.5 Custody and trust

- Default is TEE execution: "By default, Privy uses trusted execution environments (TEEs)"; on-device execution is an opt-in "advanced configuration" [VERIFIED, P:79912-79918]. The key is split into an enclave share and an auth share (2-of-2, Shamir) and "only temporarily reconstructed" inside AWS Nitro Enclaves [VERIFIED, P:80030-80075].
- Who can sign: whoever presents a valid user session (plus MFA if enrolled), and any signer the user added, within its policy [VERIFIED, P:80103-80112, P:75838]. With automatic recovery "you are trusting Privy's infrastructure ... and the user's authentication token as the sole root of trust" (that sentence is on the on-device page) [VERIFIED, P:79966-79968].
- Key export: "`exportWallet` ... can only be executed through the React SDK"; a mobile app must open a hosted web page in a WebView where the user logs in again and exports [VERIFIED, P:61153-61165]. So export on native costs us a small web page.
- Provider outage: no doc statement found on signing while Privy is unavailable (grep for outage/"if Privy") [UNKNOWN]. Since the key is reassembled only inside Privy's enclave, signing needs Privy reachable; only a key exported beforehand is independent [INFERENCE]. Funds already covered by an on-chain delegation remain spendable by our server wallet without Privy [INFERENCE from spike 15].

### 1.6 Cost and gating

- Free "Developer" tier: 0-499 MAU, "50K signatures and $1M transaction volume for free every month"; $299/month to 2,499 MAU; $499/month to 9,999 MAU; above 10K MAU or 50K signatures: $2,000 base + $0.05/MAU + $0.01/signature [VERIFIED, `privy-pricing.txt`]. A "signature" includes `eth_sendTransaction`, `eth_signTypedData_v4`, `secp256k1_sign`, `eth_sign7702Authorization` [VERIFIED, same].
- Gates found: none for wallets, passkeys, MFA, signers or policies on the free tier [VERIFIED for the pricing page and docs read]. KYB appears only for fiat on/off-ramps [VERIFIED, P:29546-29592]. "Custodial wallets" are Enterprise-only (not what we need). Custom (JWT) authentication needs a dashboard access request [VERIFIED, P:8606]. On-device execution needs a Slack request (not needed).
- Sales call or production approval for a normal app: none documented [VERIFIED absence in pricing page and `P:`]. Whether a new app gets TEE execution instantly: the docs say TEE is the default [VERIFIED, P:79912]; only the owner can confirm on the dashboard's Wallets > Advanced page.

### 1.7 Integration effort

Steps to the first signed Arc testnet transaction (from the docs; not run):
1. Owner: create a Privy account and app; copy the **App ID**; create an **app client** and copy the **Client ID**; add `xyz.kawase.app` under "Allowed app identifiers" ("You **must** configure at least one application identifier to use the React Native SDK") and the URL scheme `kawase` [VERIFIED, P:20404-20470]; enable login methods (email; passkey; Google/Apple); check Wallets > Advanced shows TEE.
2. Install the packages and polyfills (1.2); add `entrypoint.js`; add the Metro resolver override; set `moduleResolution: "Bundler"`.
3. Wrap the app in `<PrivyProvider appId clientId supportedChains={[arcTestnetWithOurRpc]} config={{embedded:{ethereum:{createOnLogin:'users-without-wallets'}}}}>`; gate on `usePrivy().isReady`.
4. Email login screen (`sendCode` / `loginWithCode`).
5. `useEmbeddedEthereumWallet().wallets[0].getProvider()`; send testnet USDC to the address; `eth_sendTransaction` on 5042002.
6. Then `signAuthorization` and `eth_signTypedData_v4` against the spike-15 script's contracts.
7. Passkeys (login and MFA): domain + AASA + assetlinks + dashboard Android key hash, rebuild.
8. Web: separate `.web.tsx` provider with `@privy-io/react-auth`.

Top 3 risks:
1. **Untested on our stack.** Built against Expo 56 / RN 0.85.3; no public source repository; starter app three SDK versions behind (54 vs 57); exact `viem 2.56.0` optional peer vs our 2.57.0; extra native modules (`react-native-webview`, `@privy-io/expo-native-extensions`, `react-native-passkeys`) beside the Circle pod.
2. **Two SDKs for one app.** Native uses `@privy-io/expo`, web needs `@privy-io/react-auth`, with different hooks and, on web, Privy modals unless disabled.
3. **Face ID granularity is per user, not per action.** MFA applies to every user signature within a cache window; finer control means either the policy-based-MFA recipe (server signer) or our own app-level gate. Passkey MFA also forces passkey to be enabled as a login method.

---

## 2. Turnkey

### 2.1 End-user experience

**a. Onboarding** (through Turnkey's hosted **Auth Proxy**, no backend of ours needed for auth [VERIFIED, T:67461-67475])

- Each end user gets a **sub-organization**; a wallet can be created in the same signup call (`createSuborgParams.<method>.customWallet.walletAccounts`) [VERIFIED, T:111403-111440, T:67545].
- Email code: `initOtp({otpType: OtpType.Email, contact})` returns `otpId`; user types the code (6 digits by default, configurable 6-9); `completeOtp(...)` logs in or signs up [VERIFIED, T:110465, T:110529, T:67570]. Own UI; the React Native kit exposes functions, not screens.
- Passkey: `signUpWithPasskey()` / `loginWithPasskey()` with `passkeyConfig.rpId` set to our domain [VERIFIED, T:110630-110775]. One system passkey sheet.
- Google / Apple: `handleGoogleOauth()` / `handleAppleOauth()`. We must bring our **own** client IDs from the providers' consoles (dashboard or provider config); Apple on iOS uses native Sign in with Apple against the bundle ID, Android uses a web flow against a Services ID; Turnkey hosts the redirect page at `oauth-redirect.turnkey.com` by default [VERIFIED, T:110781-110860, T:110817, T:110857]. No Turnkey-provided default OAuth credentials were found [VERIFIED absence on that page].
- Our existing Better Auth: supported only if it issues OIDC-compliant tokens (non-custodial path); the API-key path is described by Turnkey itself as "**custodial**: your backend holds signing authority" [VERIFIED, T:67934-67975, T:67948].

**b. Per action**

- Headless. `signMessage`, `signTransaction`, `signAndSendTransaction`, and `httpClient.signRawPayload` are plain functions; "Embedded wallets: Uses the Turnkey API to sign the message directly" [VERIFIED, T:90543-90590, T:111272-111395]. No Turnkey confirmation UI exists in the React Native kit docs.
- Silent signing: every request is stamped by the **session key**, a P-256 key generated on the device and kept in secure storage; no prompt [VERIFIED, T:70549-70581].
- Face ID when we want it, two levels:
  - Client choice: each signing call takes an optional `stampWith` (`StamperType.Passkey`, `StamperType.ApiKey`, `StamperType.Wallet`); choosing Passkey makes that one request show the passkey sheet [VERIFIED, T:90590, T:75839-75850].
  - **Server-enforced**: MFA policies with a condition in the policy language. Documented examples: `activity.action == 'SIGN'` requiring session + passkey, and `activity.action == 'SIGN' && eth.tx.value > 1000000000000000000` [VERIFIED, T:68917-68935, T:69488-69493]. "MFA applies to all users, including root users" [VERIFIED, T:69458]. A held activity waits in `ACTIVITY_STATUS_AUTHENTICATORS_NEEDED` until `approveActivity({fingerprint})` is stamped by the passkey; "sessions are **not transitive**", so a session created with a passkey does not satisfy a passkey requirement [VERIFIED, T:69662-69672, T:69717]. The React Native kit has `setMfaHandler` for this since 2.3.0 [VERIFIED, `turnkey-rn-wallet-kit-CHANGELOG.md:87-89`, `turnkey-rn-wallet-kit-2.3.7-mfa-typings.txt`].
  - Conditions can address typed data and 7702 authorizations too (`eth.eip_712.*`, `eth.eip_7702_authorization.address/chain_id/nonce`, `activity.type == 'ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2'`) [VERIFIED, T:72595, T:76089-76101, T:76216-76223, T:77204]. So "limit change needs Face ID" is expressible as a server-side rule [INFERENCE from those keywords; no such example is in the docs].
  - Caveat: a login stamped by the Auth Proxy is attributed to the parent organization, so an `activity.resource == 'AUTH'` MFA policy does not apply to it; signing activities stamped by the user's session are unaffected [VERIFIED, T:69446-69452].
  - Whether MFA policies are available on the free plan, and whether they count against the 5-policy limit: [UNKNOWN, not on the pricing page or the MFA pages].

**c. Sessions, new device, lost phone**

- Session length: default 900 seconds (15 minutes); "can be specified to any amount of time"; with the Auth Proxy it is set in the dashboard, not in code [VERIFIED, T:70612, T:67569, T:91319]. `autoRefreshSession: true` and `refreshSession()` renew it while valid [VERIFIED, T:111182, T:70591]. Up to 10 expiring session keys per user; older ones are dropped [VERIFIED, T:70616].
- So for a money app the owner must pick a session length in the dashboard; at the 15-minute default a user returning after a break must re-authenticate (email code, OAuth, or one passkey tap) before anything can be signed [INFERENCE].
- New device: log in with any registered method; a new session key is created on that device [VERIFIED, T:67511].
- Lost phone: "A sub-organization root user with a single authenticator is one lost device away from an unreachable wallet. Prompt users to register a second credential"; "Turnkey has no write access to your organizations and cannot restore access on your behalf" [VERIFIED, T:96925, T:96934]. Turnkey's "email recovery" is not a separate recovery channel: it "means **adding email as an authentication method for a user**", after which the user can log in by email code on any device [VERIFIED, T:68226-68227].

### 2.2 React Native / Expo

- Package: `@turnkey/react-native-wallet-kit` **2.3.7**, published 2026-09-22 (npm `latest`) [VERIFIED, npm]. Built on `@turnkey/core` 2.12.0 and `@turnkey/react-native-passkey-stamper` 1.2.26. The older `@turnkey/sdk-react-native` (1.5.33) still exists; the docs' React Native guide uses the wallet kit [VERIFIED, T:111252-111256].
- Install (docs): `@turnkey/react-native-wallet-kit react-native-passkey react-native-gesture-handler react-native-safe-area-context react-native-svg @react-native-async-storage/async-storage react-native-get-random-values react-native-keychain`, then `npx expo prebuild && npx expo run:ios` (so: development build) [VERIFIED, T:111102-111117]. Declared peers also include `react-native-inappbrowser-reborn >=3.7.0` and `@invertase/react-native-apple-authentication >=2.5.0` [VERIFIED, `turnkey-rn-wallet-kit-2.3.7-package.json`].
- Polyfills in the docs' root layout: `react-native-get-random-values`, `react-native-url-polyfill/auto`, `@walletconnect/react-native-compat`, `Buffer` [VERIFIED, T:111213-111218]. The example app's own entry file (`index.js`) imports only `react-native-get-random-values`, and its `package.json` lists neither of the other two [VERIFIED, GitHub `examples/demos/with-react-native-wallet-kit/index.js`, `turnkey-rn-example-package.json`]; the docs and the example disagree, the example is the newer one.
- Evidence for Expo SDK 57 / RN 0.86 / new architecture:
  - Turnkey's own example app `examples/demos/with-react-native-wallet-kit` declares `expo ~57.0.23`, `react-native 0.86.3`, `react 19.2.3`, `react-native-reanimated 4.5.1`, `react-native-gesture-handler ~2.32.0`, `react-native-safe-area-context ~5.7.0`, `react-native-svg 15.15.4`, `react-native-worklets 0.10.1`, and `"newArchEnabled": true`; its `package.json` was last changed 2026-09-24 [VERIFIED, `turnkey-rn-example-package.json`, `turnkey-rn-example-app.json`, `gh-issues-privy-turnkey-2026-09-30.txt`]. Those match ours (`apps/mobile/package.json`: Expo ~57.0.26, a later patch of the same SDK; RN 0.86.3; identical gesture-handler, reanimated, safe-area-context, svg and worklets versions).
  - The example pins wallet kit 2.3.5, two patch versions behind 2.3.7 [VERIFIED].
  - What the example exercises: email OTP login, `signMessage`, `exportWallet`, `exportWalletAccount`. It does not send a transaction, sign typed data, sign a 7702 authorization, or use passkey MFA [VERIFIED, `turnkey-rn-example-main-index.tsx`].
  - tkhq/sdk issues (not PRs) updated since 2026-06-30: 6, none about React Native or Expo. Global search for the package name in issues: 0 [VERIFIED, same file].
  - One open issue, tkhq/sdk#1094 (2025-11-14, no replies): `expo-doctor` flags `react-native-inappbrowser-reborn` as "Unsupported on New Architecture" [VERIFIED]. The example on RN 0.86.3 still depends on it; whether the OAuth browser step works on RN 0.86 was not run by us [UNKNOWN].
  - We did not build the example. "Declared and recently maintained on our exact versions" is the strength of this evidence.
- Passkeys: library `react-native-passkey` (3.6.2, published 2026-09-08) [VERIFIED, `npm-native-deps-2026-09-30.txt`]. iOS: `associatedDomains: ["webcredentials:<domain>"]` and the AASA file; Android: `assetlinks.json` at `https://<domain>/.well-known/assetlinks.json` (the docs also show an `intentFilters` entry for the host); `passkeyConfig.rpId` must match that domain [VERIFIED, T:110645-110690, T:110772-110776]. Recent library issues: open iOS bug "Passkey creation randomly fails with error 1004 after app reinstall — 'Unable to verify webcredentials association'" (#96, updated 2026-09-23) and an open `getImmediate()` multi-account issue (#117); several Android/iOS error-code fixes merged July to September 2026 [VERIFIED, `passkey-libs-gh-issues.txt`].
- Web: a separate package, `@turnkey/react-wallet-kit` 2.5.1, stores the session key as a non-extractable WebCrypto key in IndexedDB; "for React Native/Mobile applications you will need to leverage Secure Storage" [VERIFIED, T:70561-70581, T:70624]. Whether the React Native kit runs under `react-native-web`: [UNKNOWN] (the example has a `web` script and `react-native-web`, which proves nothing about the kit). Same wallet on web and native: a login resolves to the sub-organization that matches the verified email or OAuth identity, so the same user reaches the same wallet from either SDK [INFERENCE from T:67511 "The session is scoped to the sub-org matching the verified contact"]. For one Google identity on both platforms, `secondaryClientIds` registers extra OAuth audiences on the sub-org ("apps that have both web and mobile versions sharing one identity") [VERIFIED, T:110814]. Open web issue: wallet creation fails in iOS Safari Private Browsing / Lockdown Mode (tkhq/sdk#1454) [VERIFIED].

### 2.3 Arc

- Dedicated page: Arc Mainnet 5042 and Arc Testnet 5042002; `@turnkey/viem` and `@turnkey/ethers` work unchanged; example `examples/chain-integrations/with-arc` sends native USDC on Arc testnet with a type-2 transaction; notes the 18-decimal native / 6-decimal ERC-20 USDC split; "Blob transactions (EIP-4844, type 3) are not supported" by Arc [VERIFIED, T:71840-71900]. (The earlier file summarized this as "only tx types 0/1/2"; the page rules out type 3 and does not mention type 4.)
- Turnkey signs a payload and is chain-agnostic for signing; with our own RPC we build the transaction with viem, sign through Turnkey, and broadcast to `https://rpc.testnet.arc.io` ourselves, or pass `rpcUrl` to `signAndSendTransaction` [VERIFIED, T:111338, T:111379-111384; INFERENCE for the viem path in React Native, see risk 2].
- Turnkey's own broadcast (`ethSendTransaction`) accepts `eip155:5042` and `eip155:5042002` and offers `sponsor: true` gas sponsorship on Arc (dashboard activation; plan availability is unclear, see 2.6) [VERIFIED, swagger, T:71867-71871].
- EIP-7702: transaction types supported by the parser and policy engine are "legacy, EIP-2930 (Type 1), EIP-1559 (Type 2), EIP-4844 (Type 3), EIP-7702 (Type 4)" [VERIFIED, T:72603]. Authorization signing: `PAYLOAD_ENCODING_EIP7702_AUTHORIZATION` on `signRawPayload`; `@turnkey/viem` sends `JSON.stringify({address, chainId, nonce})` with that encoding [VERIFIED, `turnkey-sdk-typings-extract-2026-09-30.txt`]. An `ethUndelegate7702` activity also exists [VERIFIED, T:37944].

### 2.4 Agent authority while the user is away

- **Delegated access**: from the user's session the app creates an API-only, non-root "Delegated User" in the user's sub-organization whose key our server holds, plus policies limiting what it may sign (`fetchOrCreateP256ApiKeyUser`, `fetchOrCreatePolicies`, both present in the React Native kit). Turnkey recommends this client-side setup over the backend one, which temporarily makes our key a root user [VERIFIED, T:75193-75240, T:89115, T:89168].
- Policy engine: per-request conditions on destination, value, calldata, EIP-712 and 7702 fields (earlier file; T:77204). A rolling-window / daily-sum condition was not found in the policy language pages [UNKNOWN, same gap as the earlier file].
- Free tier: "Policies: Up to 5 per org" on Pay-as-you-go and Pro, 250 on Enterprise; "5 policies per organization on Free, Pay-as-you-go, and Pro" [VERIFIED, `turnkey-pricing.txt`, T:97849]. Whether "per org" counts each sub-organization separately: [UNKNOWN, not stated].

### 2.5 Custody and trust

- Keys are generated and used inside secure enclaves; Turnkey "stores encrypted private keys that are only decrypted when you authenticate to ... a secure enclave with your secret (e.g., API key or Passkey credentials)"; in the sub-organization model "only your end user will be able to authorize Turnkey to process a signature request" [VERIFIED, T:100164-100185].
- Who can sign: the sub-organization's root user through any of its credentials (passkey, session key obtained by email code or OAuth), and any delegated user we add, within policy [VERIFIED, same + 2.4]. The parent organization (us) has read access to sub-organizations by default, not write [VERIFIED, T:70522].
- Email/OAuth logins go through the Auth Proxy, which signs the login with a proxy key of our organization; "It cannot authenticate users without their participation (OTP code entry, OAuth consent). It has no access to funds" [VERIFIED, T:67471]. So for email users the mailbox is the root of trust [INFERENCE].
- Key export: available natively in the React Native kit: `exportWallet({walletId})` returns the mnemonic decrypted on the device (or an encrypted bundle) [VERIFIED, `turnkey-rn-wallet-kit-2.3.7` `dist/providers/Types.d.ts`]. "Export keys" on the pricing comparison carries three check icons, one per plan [INFERENCE from the page HTML, `turnkey-pricing-matrix-checks.txt`].
- Provider outage: Turnkey documents its own disaster recovery (redundant encrypted storage, quorum key shares) [VERIFIED, T:99986-100000]; nothing on signing during an outage [UNKNOWN]. As with Privy, signing needs the enclave reachable; an exported mnemonic is independent [INFERENCE].

### 2.6 Cost and gating

- "Turnkey is priced per signature, i.e. any transaction or raw payload successfully signed by a private key created on Turnkey. Turnkey offers 25 free signatures each month. To execute more than 25 transactions in a given month, you are required to have a credit card on file" [VERIFIED, T:97338]. Pay-as-you-go: $0.10 per signature, "Up to 1k free wallets"; Pro: $99/month minimum, $0.05 per signature, "Up to 2k free wallets"; Enterprise from $0.0015 [VERIFIED, `turnkey-pricing.txt`]. The comparison table's "Wallet limit" row reads `1K | 2K | Unlimited` [VERIFIED, `turnkey-pricing-matrix-checks.txt`]; what happens at the 1,001st wallet on Pay-as-you-go (blocked or billed) is not stated [UNKNOWN]. With one wallet per user this would also cap users [INFERENCE]. The 25 free signatures are per parent organization per month: the error text reads "this sub-organization cannot execute activities because its parent is over its allotted quota" [VERIFIED, T:30269-30273].
- In our design a user needs about one signature to set up (the 7702 authorization), one per limit change, and one per send above the limit; spends inside the limit are signed by our server wallet, not by Turnkey [INFERENCE from spike 15]. 25 signatures is still only enough for a handful of test users; a demo week needs a card on file.
- Rate limits: Free and Pay-as-you-go 1 request per second per organization, Pro 3, Enterprise 60; plus 10 RPS per sub-organization [VERIFIED, T:97250-97262]. Whether sub-organization requests count against the parent's 1 RPS: [UNKNOWN, wording is ambiguous].
- Other gates: passkey, OAuth, email and API-key auth, import and export carry a check for all three plans; "SMS authentication", "Custom email templates & domains", SLAs and dedicated support carry one check (Enterprise) [INFERENCE from check-icon counts in the page HTML, `turnkey-pricing-matrix-checks.txt`]. Gas sponsorship is contradictory on the page: the Enterprise card lists it under "Includes", while its comparison row has three checks [VERIFIED both; meaning UNKNOWN]. MFA is not mentioned on the pricing page [VERIFIED absence]. The Auth Proxy dashboard offers "Email customization: Application name and logo URL shown in OTP emails" [VERIFIED, T:67571]; what else can be changed below Enterprise: [UNKNOWN].
- Signup is self-serve ("create an organization and key self-serve at https://app.turnkey.com") [VERIFIED, `turnkey-llms.txt`]; no KYC/KYB or sales call is documented for Pay-as-you-go [VERIFIED absence]. "Turnkey is not currently available to users in any countries currently subject to US OFAC sanctions" [VERIFIED, T:97352]. The production checklist says "Ensure you have an active subscription" [VERIFIED, T:96909].

### 2.7 Integration effort

Steps to the first signed Arc testnet transaction (from the docs; not run):
1. Owner: create a Turnkey account/organization at app.turnkey.com; copy the **organization ID**; in Embedded Wallets > Configuration enable the **Auth Proxy**, enable email OTP (and passkeys), set the **session expiration**, copy the **auth proxy config ID**; add a credit card before the 26th signature; for Google/Apple create OAuth client IDs in Google Cloud / Apple Developer and enter them.
2. Install the packages (2.2); add the polyfills at the top of the root layout; `npx expo prebuild`.
3. Wrap the app in `<TurnkeyProvider config={{organizationId, authProxyConfigId, passkeyConfig:{rpId}, auth:{otp:{email:true}, passkey:true, oauth:{appScheme:'kawase'}, autoRefreshSession:true, createSuborgParams:{emailOtpAuth:{customWallet:{...one Ethereum account}}}}}}>`.
4. Email screens: `initOtp` then `completeOtp`.
5. Build a type-2 transaction for chain 5042002 with viem against `https://rpc.testnet.arc.io`, sign with `signTransaction({walletAccount, unsignedTransaction, transactionType:'TRANSACTION_TYPE_ETHEREUM'})`, broadcast with viem (or `signAndSendTransaction` with `rpcUrl`). Fund the address with testnet USDC first.
6. Then `signRawPayload` with the EIP-7702 and EIP-712 encodings against the spike-15 contracts.
7. Passkeys: domain + AASA + assetlinks, `rpId`, rebuild. Then one MFA policy per user for "signing needs passkey" if wanted.
8. Web: `@turnkey/react-wallet-kit` in `.web.tsx` files.

Top 3 risks:
1. **Free allowance and throughput.** 25 signatures per month for the whole organization, then a card; 1 request per second on the first two plans. A live demo with several users could hit either.
2. **The signing helpers for 7702 and EIP-712 are documented for web/server, not React Native.** No React Native example uses `@turnkey/viem` (it depends on `@turnkey/sdk-browser` and `@turnkey/sdk-server`); the likely route is calling `httpClient.signRawPayload` (present on the kit's client, with an optional `stampWith`) with the two encodings directly, or `signMessage` with its `encoding` override; no doc or example shows either for React Native [VERIFIED for the dependency list, the method on `@turnkey/core`'s client and the absence of such an example; INFERENCE for the route].
3. **Native-module surface and session design.** Seven-plus native peers (`react-native-passkey`, `react-native-keychain`, `react-native-inappbrowser-reborn` flagged for new architecture, `@invertase/react-native-apple-authentication`, async-storage) beside the Circle pod; and the session length must be chosen deliberately (15-minute default), since it decides how often a returning user re-authenticates.

---

## 3. Passkey relying-party domain: would `kawase-api.84.46.247.92.sslip.io` work?

- Public Suffix List (fetched 2026-09-30): no entry for `sslip.io`, `nip.io` or `xip.io` [VERIFIED, `psl-sslip-grep.txt`]. So `sslip.io` is an ordinary registrable domain and our host is a subdomain of it. WebAuthn allows an rpId equal to the host itself, so the full host name is a legal rpId; both SDKs let us set it (`relyingParty: 'https://…'` for Privy, `passkeyConfig.rpId` for Turnkey) [INFERENCE from the WebAuthn rule; the SDK options are VERIFIED above].
- What the platforms need: iOS fetches `https://<domain>/.well-known/apple-app-site-association` through Apple's CDN; "You must host the file using `https://` with a valid certificate and with no redirects"; Apple's CDN "requests the ... file for your domain within 24 hours", and a developer "alternate mode" (`?mode=<alternate mode>` on the entitlement) can bypass the CDN during development [VERIFIED, `apple-supporting-associated-domains.json`]. Android needs `https://<domain>/.well-known/assetlinks.json` [VERIFIED, both vendors' passkey pages].
- State of that host today: at 12:29 UTC and again at 13:51 UTC it served a self-signed `CN=TRAEFIK DEFAULT CERT`; curl could not verify TLS (`ssl_verify=20`, no HTTP status) for `/`, the AASA path and the assetlinks path [VERIFIED, `sslip-domain-check.txt`]. **As served today it fails Apple's valid-certificate requirement.**
- Why a certificate may be hard to get: Let's Encrypt counts certificates per *registered domain* as found with the Public Suffix List, "Up to 50 certificates can be issued per registered domain ... every 7 days. This is a global limit" [VERIFIED, `letsencrypt-rate-limits.html`]. Because `sslip.io` is not on the list, every sslip.io user worldwide shares that one allowance [INFERENCE]. Whether that is the cause of today's default certificate: [UNKNOWN].
- Further consequences [INFERENCE]: a passkey is bound to its rpId for life, so passkeys registered against the sslip host cannot be moved to a real domain later (users would have to register again); the host name contains the server's IP address, so an IP change has the same effect; and Apple's associated-domain check has an open flakiness report in one of the two passkey libraries (f-23/react-native-passkey#96).
- Net: possible in principle once the host serves a publicly trusted certificate and both `.well-known` files; not working today; and it ties every user's passkey to a throwaway host name. A domain we control avoids all three problems. The bundle ID is `xyz.kawase.app` (`apps/mobile/app.json`), which suggests `kawase.xyz`, but whether the owner holds that domain: [UNKNOWN].
- Both vendors also need, for iOS passkeys, an Apple Developer Team ID in the AASA file and the Associated Domains capability on the provisioning profile [VERIFIED, T:110775, P:24050-24075]. Whether the owner has a paid Apple Developer account: [UNKNOWN].

---

## 4. Side by side

| Point | Privy | Turnkey |
|---|---|---|
| RN package, version, date | `@privy-io/expo` 0.75.0, 2026-09-28 [V] | `@turnkey/react-native-wallet-kit` 2.3.7, 2026-09-22 [V] |
| Evidence on Expo 57 / RN 0.86.3 / new arch | Built against Expo 56 / RN 0.85.3; starter on Expo 54; no statement in docs or changelog [V] → fit [U] | Own example declares Expo ~57.0.23, RN 0.86.3, `newArchEnabled`, updated 2026-09-24; same library versions as our app [V]; not built by us |
| SDK source / issue tracker | No repository declared; bugs to Slack [V] | Public (tkhq/sdk) [V] |
| Dev build needed | Yes [V] | Yes [V] |
| Expo web | Not supported by the Expo package; use `@privy-io/react-auth` [V] | Separate `@turnkey/react-wallet-kit`; RN kit on web [U] |
| Email code signup | `sendCode` / `loginWithCode`, own UI [V] | `initOtp` / `completeOtp`, own UI [V] |
| Passkey signup | `signupWithPasskey({relyingParty})`; lib `react-native-passkeys` [V] | `signUpWithPasskey()`; lib `react-native-passkey` [V] |
| Google / Apple | Works with Privy's default credentials for development; own credentials advised for production, no migration of early users [V] | Own client IDs required [V] |
| Reuse our Better Auth | JWT/OIDC custom auth; needs a dashboard access request [V] | OIDC issuer (non-custodial) or API key (custodial) [V] |
| Signing UI on native | None; headless [V] | None; headless [V] |
| Silent signing | Yes, while the login session is valid (refresh token 30 days default, configurable) [V] | Yes, while the session key is valid (15 min default, configurable, auto-refresh) [V] |
| Face ID on chosen actions | Wallet MFA with passkey: applies to all user signatures, cached 15 min by default, `clear()` to force; selective only through a server signer + policy [V] | Per call `stampWith: Passkey` (client) and MFA policies with conditions such as `activity.action == 'SIGN' && eth.tx.value > X` (server-enforced) [V]; plan availability [U] |
| EIP-7702 authorization | `useSign7702Authorization` in the Expo package; `secp256k1_sign` documented [V] | `signRawPayload` + `PAYLOAD_ENCODING_EIP7702_AUTHORIZATION`; `@turnkey/viem signAuthorization` [V]; RN example [none found] |
| EIP-712 | `eth_signTypedData_v4` [V] | `PAYLOAD_ENCODING_EIP712` [V] |
| Arc 5042 / 5042002 | Chain definitions in `@privy-io/chains`; any EVM chain via `supportedChains`; own RPC override [V] | Arc docs page, API enum for both chain IDs, `with-arc` example [V] |
| Agent authority off-line | Signers + policies, stateful (rolling-window) limits, max 10 aggregations per app [V]; on free tier [I] | Delegated user + policies, 5 policies per org below Enterprise [V]; rolling-window limits [U] |
| Custody | TEE (AWS Nitro), 2-of-2 shares; user session is the root of trust [V] | Secure enclaves; user's credentials in own sub-organization; parent has read-only access [V] |
| Key export on native | Only through a hosted web page using the React SDK [V] | Native `exportWallet` in the RN kit [V]; on all plans [I] |
| Free tier | 499 MAU, 50K signatures/month [V] | 25 signatures/month per organization, then card + $0.10 each; 1 RPS; wallet limit 1K [V] |
| Sales call / KYB / approval | None documented for this use; KYB only for fiat ramps [V] | None documented; self-serve [V] |
| Owner must do | Account, app, app client, allowed app identifier + URL scheme, login methods, (Android key hash, own OAuth creds later) | Account, org ID, Auth Proxy + config ID, session length, card on file, own OAuth client IDs |

[V]=VERIFIED, [I]=INFERENCE, [U]=UNKNOWN.

---

## 5. Gaps

1. **Nothing was built or run.** No Privy or Turnkey account, no dev build, no signature. The decisive test for each is a half-day spike on `apps/mobile`: install, build for iOS and Android on Expo 57, email login, sign a 7702 authorization and an EIP-712 delegation, send on 5042002 through our RPC.
2. Privy on Expo 57 / RN 0.86.3 / new architecture: no positive or negative evidence; no public SDK source or issue tracker to check.
3. Privy's `useSign7702Authorization` on React Native exists in the 0.75.0 typings and bundle but is not in the docs (the docs list only React, REST and Node for that hook). Its code is chain-generic (any chain in `supportedChains`), but it was not run against 5042002 by us.
4. Turnkey: `react-native-inappbrowser-reborn` on RN 0.86 new architecture (tkhq/sdk#1094 open since 2025-11); only matters for OAuth.
5. Turnkey: whether MFA policies are on the free/Pay-as-you-go plan and whether they count toward the 5-policy limit; whether the 5-policy limit is per sub-organization; whether sub-organization traffic counts against the parent's 1 RPS.
6. Turnkey: maximum session length (docs say "any amount of time"); what happens past the 1K wallet limit on Pay-as-you-go; whether gas sponsorship is Enterprise-only (the pricing page contradicts itself).
7. Privy: maximum configurable session duration; how long a "Custom authentication" access request takes; whether the REST send path serves Arc with Privy's RPC.
8. Same passkey across web and native for either vendor (needs one rpId on a domain we control; Privy's web rpId behaviour not found).
9. Signing during a provider outage: not documented by either; only a previously exported key is independent.
10. Passkey domain: the sslip host has no valid certificate today; whether the owner has a real domain and a paid Apple Developer account is unknown.
11. Mainnet: all Arc evidence for both vendors is documentation and package contents; neither was exercised on 5042 or 5042002 by us.
12. Regulatory posture of a server-signer (delegated access) design was not researched; with the on-chain limit design it is not needed.
