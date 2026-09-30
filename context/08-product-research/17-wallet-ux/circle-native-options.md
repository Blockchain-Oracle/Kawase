# Circle-native wallet UX options (no PIN on every action)

Purpose: what Circle's own wallet products can do for a passkey / Face ID-grade experience in one Expo SDK 57 + React Native 0.86 + Expo-web app on Arc, judged on what the end user does and on feasibility in our stack. Facts only; it does not choose an architecture. It extends and corrects `../03-wallets-custody-limits/circle-wallet-options.md`.

Sources:
- Circle docs dump `.firecrawl/docs/circle-llms-full.txt` (cited as `l.N`). Pages: `/wallets/user-controlled` (l.116873), `/wallets/user-controlled/authentication-methods` (l.117014), `/sdks/user-controlled/confirmation-uis` (l.94652), `/wallets/user-controlled/build-a-wallet-app` (l.117219), `/wallets/user-controlled/request-a-signature` (l.120320), `/sdks/user-controlled/react-native-sdk` (l.96716), `/sdks/user-controlled/ios-sdk` (l.94859), `/sdks/user-controlled/ios-sdk-ui-customization-api` (l.95664), `/wallets/supported-blockchains` (l.116372), `/api-reference/keys` (l.8265), `/wallets/modular` (l.113704), `/wallets/modular/create-a-modular-wallet` (l.114139), `/wallets/modular/how-passkeys-and-modules-work` (l.114444), `/wallets/modular/batch-and-parallel-user-operations` (l.113802), `/wallets/modular/use-dynamic-as-a-signer` (l.115278), `/sdks/modular/{android,ios,web}-sdk` (l.88601, 89762, 91008), `/paymaster/pay-gas-fees-usdc` (l.81764).
- Circle's hosted approval app `https://pw-auth.circle.com` (the iframe the Web SDK loads): `.firecrawl/product/17/pw-auth-index.html`, `pw-auth-js/*`, extracted `pw-auth-promptui-routing-snippet.txt` and `pw-auth-autoapprove-snippet.txt`.
- SDK source: `@circle-fin/w3s-pw-web-sdk@1.1.11` (`web-sdk-1.1.11-index.ts`, `-types.ts`, `-usage.md`); `@circle-fin/w3s-pw-react-native-sdk@2.2.5` (`rn-sdk-2.2.5-*`); Circle iOS SDK 1.4.3 binary strings and interface (`ios-ucw-sdk-arm64.swiftinterface`, `ios-ucw-sdk-strings.txt`, `ios-ucw-sdk-1.4.3-strings-promptui-2026-09-30.txt`); `@circle-fin/modular-wallets-core@1.0.16` (`modular-wallets-core-1.0.16-index.d.ts`, `-index.mjs`); `circlefin/modularwallets-{ios,android}-sdk` at HEAD (`modular-native-sdk-appinfo-and-chains-2026-09-30.txt`); viem 2.57.1 (`plan/spikes/code/02-ucw-typed-data/node_modules/viem`).
- User-controlled wallets OpenAPI: `.firecrawl/product/17/ucw-openapi.yaml`.
- Circle's agent skills: `.firecrawl/product/17/circle-skills/*`.
- GitHub issues: `ucw-issues-detail.txt`, `ucw-sdk-issues-2026-09-30.txt`. Release notes: `release-notes-wallets-2026.md`, `release-notes-agent-stack-2026.md`, `rn-sdk-releases.txt`.
- `https://www.circle.com/modules-beta` (`circle-modules-beta-2026-09-30.html`); `circlefin/arc-p2p-payments` README (`circle-arc-p2p-payments-readme-excerpt-2026-09-30.md`).
- Project spikes: `plan/spikes/02-ucw-typed-data.md`, `plan/spikes/15-eip7702-limits.md`; `context/01-arc/gotchas.md`.

All evidence file names below are under `.firecrawl/product/17/` unless a path is given.

Verified: 2026-09-30

Method limits: no Circle account, login, client key or transaction was used. Everything tagged [VERIFIED] is a doc, a source file or a binary string read today. Nothing here was executed against Circle as a social-login or modular-wallet user.

## The four facts that matter most

1. **Social-login and email-OTP users never type a PIN and never see a biometric prompt from Circle.** By default each transfer, contract call or signature shows one Circle confirmation screen with a single button. A Console switch turns that screen off, and then `execute()` finishes with no Circle UI at all [VERIFIED docs + hosted-app code; not executed].
2. **That switch is per Circle project, not per user or per action**, and Circle warns that with it off "you can submit transactions on behalf of your users without their consent" (l.94821) [VERIFIED].
3. **Circle has no passkey or Face ID signing for user-controlled wallets.** Biometrics exist only as "biometrics to protect PIN" on the native PIN method; passkeys exist only in modular wallets, which are smart contract accounts [VERIFIED docs and SDK surfaces].
4. **Modular wallets have no React Native SDK**, and the web SDK's passkey registration calls `window.navigator.credentials` directly with no override [VERIFIED `modular-wallets-core-1.0.16-index.mjs:2828`].

---

## A. User-controlled wallets with social login or email OTP

### A1. Onboarding steps for the end user

**Social login (Google, Apple, Facebook)** [VERIFIED l.117042–117098, l.118098–118126]:
1. Tap "Sign in with Google/Apple/Facebook".
2. Complete the provider's own consent screen.
3. The wallet is created. The docs say "The user approves the action, and Circle creates the wallet" (l.118123).

Behind it: the app gets a `deviceId` from the SDK; the backend calls `POST /users/social/token` for `deviceToken` + `deviceEncryptionKey`; the SDK's `performLogin` returns `userToken`, `encryptionKey`, `refreshToken`, `oauthInfo`; the backend calls `POST /user/initialize` (with `accountType` and `blockchains`) for a `challengeId`; the device runs `execute(challengeId)`.

In the hosted web app, the wallet-creation challenge for a social or email session is approved automatically and the iframe is never shown: for `SET_PIN`, `CREATE_WALLET` and `WALLET_UPGRADE` request types the code sets `autoApproveChallenge` to true and routes to `/social/confirm` without posting `showUi` [VERIFIED `pw-auth-promptui-routing-snippet.txt`; not executed]. The same code sends `newPin: "placeholder"` and dummy security questions, which confirms these users have no real PIN [VERIFIED `pw-auth-autoapprove-snippet.txt`].

So a social user's onboarding is: **tap provider, consent, done**. No PIN, no security questions.

**Email OTP** [VERIFIED l.117101–117156, l.119039–119084]:
1. Enter email.
2. Receive the code by email.
3. Type the code into **Circle's** OTP screen (web: hosted iframe `social/verify-email`; native: `EmailOTPViewController`, strings "Enter verification code", "Send again").
4. The wallet is created as above.

**React Native** (`@circle-fin/w3s-pw-react-native-sdk` 2.2.5) [VERIFIED `rn-sdk-2.2.5-types.ts`, `rn-sdk-2.2.5-WalletSdk.ts`]:
- `performLogin(provider, deviceToken, deviceEncryptionKey, onSuccess, onError)` with `SocialProvider.Google | Facebook | Apple`.
- `verifyOTP(otpToken, deviceToken, deviceEncryptionKey, onSuccess, onError)`.
- Both return `LoginResult { userToken, encryptionKey, refreshToken, oauthInfo }`.
- `execute(userToken, encryptionKey, challengeIds[], onSuccess, onError)`.
- It wraps Circle iOS SDK `CircleProgrammableWalletSDK_static` **1.4.3** and Android `circle.programmablewallet:sdk:1.0.1102` (`rn-sdk-2.2.5-podspec.rb`, `rn-sdk-2.2.5-android-build.gradle`).

**Web** (`@circle-fin/w3s-pw-web-sdk` 1.1.11) [VERIFIED `web-sdk-1.1.11-index.ts`]:
- `new W3SSdk({ appSettings, loginConfigs }, onLoginComplete)`, `getDeviceId()`, `performLogin(provider)`, `verifyOtp()`, `setAuthentication({ userToken, encryptionKey })`, `execute(challengeId, cb)`.
- Google and Facebook are **full-page redirects** (`window.location.href = …`), so state must survive a reload. Google uses the implicit flow (`response_type=id_token token`).
- Apple on web goes through **Firebase Auth** (`OAuthProvider('apple.com')` + `signInWithPopup`); `loginConfigs.apple` is a Firebase config object.

### A2. What the user does for each transfer, contract execution or typed-data signature

**Default (Confirmation UIs on)** [VERIFIED l.94657–94672]: "For the social logins and email authentication methods, by default, Circle presents your user with a UI to preview the transaction or signing details". It applies to `/user/transactions/transfer`, `/user/transactions/contractExecution`, `/user/sign/transaction`, `/user/sign/message`, `/user/sign/typedData`.
- The user sees one Circle screen ("Confirm transaction", "Contract interaction" or "Signature Request") and taps CONFIRM or SIGN.
- **No PIN and no biometric prompt is involved.** The native SDK's biometric screens belong to the PIN flow only (section B).
- Text, colours, icons, address labels, fiat amount and fee line are customizable (l.94682–94798).

**Switched off** [VERIFIED l.94800–94824]: "To use your own UIs, you can opt out of Circle's predefined confirmation UIs… Configurator > Wallet Security Settings… Toggle the Confirmation UIs setting off". Circle's warning, in full: "it is highly recommended that you enable them… If you decide to disable it, it means you can submit transactions on behalf of your users without their consent; therefore, you must provide context or disclaimers on your application that your users must acknowledge." The docs name gaming as the intended case.

**What the "autoapprove" snippet is.** It is not an SDK option. It is the code inside Circle's hosted approval app that implements the Console switch [VERIFIED `pw-auth-promptui-routing-snippet.txt`]:
- The app decodes `authMode` from the `userToken` JWT.
- For `SSO` or `EMAIL` sessions it runs the GraphQL query `EntityConfig { promptUI }`, then does `setAutoApproveChallenge(!promptUI)` and posts `{ showUi: promptUI }` to the parent page.
- The Web SDK's `execute()` always adds the iframe **hidden** (`this.exec(onCompleted, false)`) and only reveals it on a `showUi` message (`web-sdk-1.1.11-index.ts`, `execute` and `messageHandler`).
- With `promptUI` false, a hook (exported as `X$`, used by the `/social/confirm`, `/social/send-tx` and `/social/sign-message` pages) submits the `approveChallenge` mutation by itself as soon as the device's stored secret, the storage key and the `pinCodeUserShare` are loaded, then posts `onComplete`.
- For `PIN` sessions the code forces `showUi: true` and `autoApprove` false. **The switch does nothing for PIN users**, which matches the docs note "Confirmation UIs are not available for the PIN authentication method" (l.94679).
- A developer reported the same behaviour in 2025: with Confirmation UIs off the iframe "still launches… but just hidden with css… and then eventually completing the challenge" (`circlefin/w3s-pw-web-sdk#42`, `ucw-issues-detail.txt`) [REPORTED].

**Native (iOS / Android through the RN SDK).** The iOS SDK 1.4.3 binary contains the endpoint `/sdk/users/entity/config` and the key `promptUI`, next to `TransactionRequestViewController`, `SignatureRequestViewController` and `RawTransactionRequestViewController` [VERIFIED strings, `ios-ucw-sdk-1.4.3-strings-promptui-2026-09-30.txt`]. That the native SDK skips those screens when `promptUI` is false is [INFERENCE]; the docs describe the switch without limiting it to web. The Android binary was not inspected (GitHub Packages needs a login) [UNKNOWN].

**What stays true with the switch off** [VERIFIED unless marked]:
- The challenge must still be run **on the device** by the SDK with a live `userToken`. "Every signing operation requires an active, authenticated user session" (l.116886).
- The approval call carries a secret held on the device: `encryptedUserSecret` from `localStorage["encrypted"]` on the `pw-auth.circle.com` origin on web; Keychain on iOS (`KeychainHelper`, error 155717 "User secret is missing").
- The signature is returned only to the device callback, not to the server (`plan/spikes/02-ucw-typed-data.md` finding 1, observed for a PIN user).
- On web, that secret lives in a third-party iframe's `localStorage`. Browsers that partition or clear third-party storage could force a new login [INFERENCE; untested].

### A3. Session and token model

- **`userToken`** for social and email sessions "expires 14 days after generation, after which users are logged out" (l.117207) [VERIFIED]. For comparison, a PIN user's token from `POST /users/token` lasts 60 minutes (l.120357; `circle-skills/use-user-controlled-wallets-SKILL.md`) [VERIFIED].
- **Refresh**: `POST /v1/w3s/users/token/refresh`, authenticated with the **API key** plus the `X-User-Token` header; body `idempotencyKey`, `refreshToken`, `deviceId`; response `userToken`, `encryptionKey`, `userID`, `refreshToken` (`ucw-openapi.yaml` l.1208, 2881, 3341) [VERIFIED]. Because it needs the API key, **the backend makes the call**.
- **Where the refresh token lives**: the SDK hands it to the app in the login callback (`LoginResult.refreshToken`). Storage is the developer's job; Circle's skill says httpOnly cookies on web. "If a `userToken` expires before being refreshed, the user is logged out and must authenticate again" (l.117215) [VERIFIED].
- How many times or for how long a session can be refreshed is not documented [UNKNOWN; looked in the auth-methods page, the OpenAPI and the API reference page].
- **Can the backend mint a token for a social or email user without the device?** Not documented. `POST /users/token` (by `userId`) is tagged "PIN Authentication" in the OpenAPI, and every doc gives the SDK login as the only source of a social or email token [VERIFIED]. Whether the endpoint accepts a social user's id is [UNKNOWN; needs one call with a test key and a social user]. Even with a token, the approval needs the device-held secret (A2), so no documented server-only path exists [INFERENCE].
- One developer reports calling the undocumented `https://pw-auth.circle.com/api/graphql` `verifyOtp` mutation with curl and receiving `userToken`, `refreshToken` and `encryptedUserSecret`; Circle has not replied on that issue (`w3s-pw-web-sdk#42`) [REPORTED]. It is unsupported.

### A4. Account types, signing, and EIP-7702

- **EOA on Arc**: the supported-blockchains table lists `Arc (ARC / ARC-TESTNET)` as "EOA, SCA" for user-controlled wallets (l.116376) [VERIFIED]. `accountType` is a parameter of `POST /user/initialize` for every login method; Circle's own examples use `"SCA"` on `ARC-TESTNET` in the social and email tutorials and `"EOA"` in the social-login skill [VERIFIED]. A UCW **EOA on ARC-TESTNET** was created and used live by this project for a PIN user (`plan/spikes/02-ucw-typed-data.md`); not done for a social user, and not on ARC mainnet (the project's Circle mainnet access is not approved: `plan/STATUS.md`).
- **EIP-712**: `POST /user/sign/typedData` is one endpoint for all login methods, and it is on the list of calls the confirmation UI covers [VERIFIED]. The strict typed-data rules found in spike 2 (project the message onto `types`, include `EIP712Domain`) are server-side, so they apply equally [INFERENCE].
- **Difference from PIN users**: only the approval step. PIN users always get Circle's PIN screen; social and email users get the confirmation screen or nothing [VERIFIED].
- **EIP-7702 authorization (raw hash signing)**: the user-controlled signing surface is `sign/message` (EIP-191), `sign/typedData` (EIP-712) and `sign/transaction` (`rawTransaction` hex or a `transaction` JSON object) (`ucw-openapi.yaml` l.1026–1150, 2793–2806). There is no raw-digest or authorization endpoint [VERIFIED absence]. The only "7702" text in Circle's docs is the Circle Paymaster quickstart, which uses a viem `privateKeyToAccount` owner and `owner.signAuthorization`, not a Circle wallet (l.82100–82420) [VERIFIED].
  - EIP-191 and EIP-712 prefixes make it impossible to produce the 7702 digest `keccak256(0x05 ‖ rlp(chainId, address, nonce))` through the first two endpoints [INFERENCE from the standards].
  - Whether `sign/transaction` would accept a crafted payload is [UNKNOWN, untested]; it is not a documented use.
  - So no Circle user-controlled wallet is documented as able to sign a 7702 authorization. The same holds for modular wallets, which are contract accounts with a passkey (P-256) or an external owner.

### A5. What we would have to set up

Console [VERIFIED l.117294–117306, l.118187–118204, l.94800–94808]:
- **Wallets → User Controlled → Configurator**: App ID.
- **Authentication Methods → Social Logins**: a client ID per provider.
- **Authentication Methods → Email**: From address and SMTP host, port, username, password; optional subject and body template.
- **Wallet Security Settings → Confirmation UIs**: the on/off switch.

Email: "Requires SMTP configuration through your own provider. Circle does not send the email" (l.117117). Circle generates the OTP and submits it through **our** SMTP account; the tutorial uses Mailtrap, the skill names SendGrid, Mailgun or AWS SES [VERIFIED].

Web [VERIFIED]: a Google OAuth "Web application" client with the app's URL as authorized redirect URI; a Firebase project for Apple; Node polyfills in the bundle (`Buffer`, `util`), as the skill and spike 2 both found.

React Native / Expo [VERIFIED `rn-sdk-2.2.5-README.md`, l.96760–97215]:
- A development build; Expo Go is not supported.
- Config plugins `podfile-modifier`, `withCopyFiles` (with a `prebuild-sync-src/` folder), `apple-signin-entitlements`, `infoplist-config` (Facebook app id, client token, display name, Google iOS client id).
- Google: a Firebase project with an iOS app (`GoogleService-Info.plist`) and an Android app (`google-services.json`), the `google_web_client_id` string, and the google-services Gradle plugin.
- Apple: the Sign in with Apple capability on iOS; an Apple **Services ID** as `appAuthRedirectScheme` on Android.
- Facebook: manual `AppDelegate.swift` edits kept in `prebuild-sync-src`.
- Android build needs a **GitHub username and PAT** (`read:packages`) for `maven.pkg.github.com/circlefin/w3s-android-sdk`, also as EAS secrets.
- `expo-module.config.json` lists platforms `apple` and `android` only. **There is no web implementation**, so Expo web must call `@circle-fin/w3s-pw-web-sdk` from a platform-specific file.
- The README's "Recommended" range is React Native 0.76–0.81 and Expo SDK 54+; the package is developed against Expo 54 / RN 0.81.5 (`rn-sdk-2.2.5-package.json`). Expo 57 / RN 0.86 is above that range; the project's spike 1 is testing it (`plan/STATUS.md:10`).

Providers beyond Google, Apple and Facebook are "request it through Circle on Discord" (l.117063). Each social account is a separate Circle user: "Signing up with multiple providers (for example, Google then Apple) creates separate user IDs" (l.117061) [VERIFIED].

---

## B. PIN + biometrics (`enableBiometricsPin`, `setBiometricsPin`)

- **What it is**: "Enable biometrics to protect PIN code" (iOS `SettingsManagement`, l.94984); Android: "Flag that decides whether to use biometrics to protect PIN or not" (l.92716). The PIN stays the credential. Biometrics unlock a stored copy of it [VERIFIED]. Supporting evidence: the UI table calls the failure case "After the auto-fill PIN verify fails" (l.93870) and the error text is "The PIN encrypted by Face ID is incorrect" (`img/iossdk-uic-enterpin04.png`).
- **Turning it on**: `WalletSdk.init({ endpoint, appId, settingsManagement: { enableBiometricsPin: true } })`, then `setBiometricsPin(userToken, encryptionKey, …)` (result type `SET_BIOMETRICS_PIN`). The SDK also has its own prompt screen, "Allow Biometrics for Web3 Access", with Continue / Skip / "Don't ask me again" (`img/iossdk-uic-allowbiom.png`; iOS `BiometricsPromptViewController`) [VERIFIED].
- **UX after enabling**: Circle's example image shows the **"Enter your PIN" screen still opening**, with a "Use FACE ID" action (Android: "Use Biometrics") and the Face ID animation over it (`img/ucw-am-examplebio01.png`; l.98173). The docs' one-line description is "Optional biometrics let users sign with fingerprint or facial recognition on supported devices" (l.117161) [VERIFIED].
  - So Face ID replaces **typing** the six digits, but the Circle PIN sheet is still presented for every challenge [INFERENCE from the screenshots and the `biometricsButton` on the PIN view controller].
  - Whether the Face ID prompt starts by itself when the sheet opens or only after tapping "Use FACE ID" is not stated anywhere [UNKNOWN; spike 1 on a real device can observe it].
- **Platforms**: iOS (needs `NSFaceIDUsageDescription`; the `infoplist-config` plugin adds it) and Android (`setBiometricsPin(activity, …)`, l.92624) [VERIFIED].
- **Web**: none. Web SDK 1.1.11 has no biometrics method and its `ChallengeType` has no `SET_BIOMETRICS_PIN` [VERIFIED `web-sdk-1.1.11-index.ts`, `-usage.md`]. A web PIN user types the PIN for every challenge.
- **Failure modes** [VERIFIED error table l.94843–94851]: 155710 biometric key invalidated (after the device's biometrics change) leads to an "Update Biometrics" screen; 155713/155714 lockout. An open issue reports that the iOS SDK offers no device-passcode fallback when Face ID is locked out (`circlefin/w3s-ios-sdk#31`, 2026-02-12, no reply) [REPORTED].
- **Security questions**: no documented way to skip or defer them. Onboarding is "User sets a 6-digit PIN and security-question answers during sign-up" (l.117036) [VERIFIED]. In this project's run, one `INITIALIZE` challenge covered PIN, questions and wallet (spike 2).
  - The required count is configurable: default 2 (iOS `securityQuestionsRequiredCount()`, l.95994; web `setCustomSecurityQuestions(questions, requiredCount)`; the web code only falls back to 2 when `requiredCount <= 0`) [VERIFIED]. Whether the server accepts 1 is [UNKNOWN].
  - `POST /user/pin` exists ("PIN setup without setting up the wallets") and `SET_SECURITY_QUESTIONS` is a separate challenge type, but error 155111 "User hasn't set the security questions for PIN backup yet" shows some operations require them [VERIFIED]. Which ones is [UNKNOWN].
- **PIN rules that remain**: three wrong PINs lock entry for 30 minutes; a lost PIN plus forgotten answers is permanent loss (l.117166–117180) [VERIFIED].

---

## C. Modular wallets (passkey smart accounts)

### C1. Arc mainnet and testnet

| Item | Value | Tag |
|---|---|---|
| Docs table | `Arc (ARC / ARC-TESTNET)`: Modular = MSCA (l.116376) | [VERIFIED] |
| Base URL | `https://modular-sdk.circle.com/v1/rpc/w3s/buidl` "is the same for every app" (l.114187) | [VERIFIED] |
| Chain path | `<base>/<chain>`, the lowerCamelCase chain name: testnet `/arcTestnet`, mainnet `/arc` (l.88657, 114320; path table in `circle-skills/use-modular-wallets-SKILL.md`) | [VERIFIED docs; not called] |
| Transport | `toModularTransport(url, clientKey)`; one transport serves public RPC, bundler (`eth_sendUserOperation`, `eth_estimateUserOperationGas`, …) and paymaster (`pm_getPaymasterData`, `pm_getPaymasterStubData`) | [VERIFIED `modular-wallets-core-1.0.16-index.mjs:1990–2015`] |
| Gas Station | `paymaster: true` on `sendUserOperation`; Arc mainnet and testnet supported (see `../03-wallets-custody-limits/circle-wallet-options.md` §5) | [VERIFIED docs] |
| Web SDK 1.0.16 | constants `Arc_USDC` and `ArcTestnet_USDC` = `0x3600…0000`; chain objects come from viem (`arc` id 5042, `arcTestnet` id 5042002 in viem 2.57.1) | [VERIFIED] |
| iOS SDK 1.5.0 (HEAD 2026-05-29) | `Arc.swift` (chainId 5042, blockchain "ARC") and `ArcTestnet.swift` | [VERIFIED] |
| Android SDK 1.5.3 (HEAD 2026-05-29) | `ArcTestnet.kt` only. **No `Arc.kt`**, although the docs list `Arc` (l.89670) | [VERIFIED `modular-native-sdk-appinfo-and-chains-2026-09-30.txt`] |
| Contracts on Arc | factory, MSCA implementation, EntryPoint v0.7, paymaster present on both networks (earlier `eth_getCode`, see the 03 file) | [VERIFIED 2026-09-29] |
| Live routing | unauthenticated calls to `/arc`, `/arcTestnet`, `/polygonAmoy` and `/notARealChain` all return HTTP 401 "Missing API key", so the path cannot be confirmed without a client key (`modular-rpc-unauth-probe-2026-09-30.txt`) | [UNKNOWN] |

Mainnet also needs a `LIVE` client key and an active Gas Station policy: error 155509 "Paymaster policy required on mainnet before SCA account creation" (`use-modular-wallets-SKILL.md`) [VERIFIED].

Circle's own Arc consumer sample, `circlefin/arc-p2p-payments`, uses "Circle Modular Wallets with Passkey security" in a Next.js web app, and says it "Assumes testnet usage only" [VERIFIED README].

### C2. Per-action UX

- **Every user operation is signed by the passkey.** `signUserOperation` hashes the user op and calls the owner's `sign`, which for a WebAuthn owner is a `navigator.credentials.get` call, meaning the OS passkey sheet (Face ID, Touch ID, fingerprint or device unlock) [VERIFIED `modular-wallets-core-1.0.16-index.mjs:2782–2800`; viem `toWebAuthnAccount`]. `signMessage` and `signTypedData` each cost one prompt too.
- **Batching**: "Pass multiple `calls` to `sendUserOperation`. The user signs once and the smart account executes the entire array atomically" (l.113818) [VERIFIED]. Parallel operations use 2D nonces.
- **Session keys**: none shipped. The docs list two modules, Passkey and Address Book (l.114513–114518). Circle's marketing page lists Session Keys under "A sneak peek of upcoming Modules… Sign up for the Beta program" (`circle-modules-beta-2026-09-30.html`) [VERIFIED page text; announced, not live]. The contracts repo's session-key test was still commented out on 2026-09-29 (03 file).
- So with a passkey owner, one biometric prompt per action is the floor, and there is no "inside a limit, ask nothing" mode from Circle itself [INFERENCE from the above].

### C3. React Native

- **No official React Native SDK.** Docs: "integrate using Circle SDKs for web, iOS, and Android" (l.113713). Six plausible npm names return 404 (`npm-rn-modular-probe-2026-09-30.txt`), and the `@circle-fin` npm listing has no such package (`npm-search-circle-fin-2026-09-30.txt`) [VERIFIED].
- **Web SDK inside React Native** (facts, then what they imply):
  - `toWebAuthnCredential({ transport, mode, username?, credentialId? })` has **no `getFn` / `createFn` parameter** and throws "Credential Management API not supported." unless `window.navigator.credentials` exists (`index.mjs:2827–2832`) [VERIFIED].
  - viem's `toWebAuthnAccount({ credential, getFn, rpId })` does accept a custom `getFn`: "Useful for environments that do not support the WebAuthn API natively (i.e. React Native or testing environments)" (viem 2.57.1 `account-abstraction/accounts/toWebAuthnAccount.ts`) [VERIFIED]. `toCircleSmartAccount` takes that viem account as `owner`.
  - The registration and login calls to Circle's relying-party server are exported separately: `createRpClient`, `getRegistrationOptions`, `getRegistrationVerification`, `getLoginOptions`, `getLoginVerification` (JSON-RPC `rp_*`) [VERIFIED `index.d.ts:881–1031`].
  - So a React Native build would either polyfill `window.navigator.credentials` with a passkey library, or call the `rp_*` actions itself and pass the library's `get` as `getFn` [INFERENCE; untested, and not a Circle-documented path].
  - **Risk**: every SDK request sends `X-AppInfo: platform=web;version=1.0.16;uri=<window.location.hostname or "unknown">` (`index.mjs:2371–2382`). The native iOS SDK sends `platform=ios;version=…;bundleid=<bundle id>`. Client keys are "linked to either a specific host domain (websites), bundle ID (iOS), or package name (Android). This restricts access to pre-configured apps" (l.8372) [VERIFIED]. In React Native the web SDK would report `uri=unknown`. Whether Circle rejects that is [UNKNOWN; needs a client key to test].
- **Owner as a plain EOA**: yes. `ToCircleSmartAccountParameters.owner: LocalAccount | WebAuthnAccount` (`index.d.ts:747`), `signAndWrap` handles both, and `walletClientToLocalAccount` is exported. Circle documents the pattern in "Use Dynamic as a signer": "a modular wallet whose smart account is signed by the user's Dynamic EOA. After setup, every transfer, signature, and batched operation is signed by Dynamic automatically" (l.115283–115290) [VERIFIED]. That page's prerequisites list only a client key, not a passkey domain. With an EOA owner no passkey prompt exists; what the user sees is whatever protects that key.

### C4. Passkey requirements

- Console: a client key (**Keys → Create a key → Client Key**) and "A passkey domain matching the client key's web domain: Console → Wallets → Modular Wallets → Passkey" (l.114165) [VERIFIED].
- Native: "For iOS and Android apps, passkeys are bound to a web domain. Publish an Apple associated domains file or Android Digital Asset Links file at your domain root so your native app can use the passkey" (l.114176) [VERIFIED].
- The `rpId` is set by Circle's server in the registration options (`registrationOptions.rp.id`), that is, the Console passkey domain (`index.mjs:2861`) [VERIFIED].
- Domain mismatch gives `SecurityError`; "passkeys created on `localhost` or testnet domains will not work on the production domain" (`use-modular-wallets-SKILL.md`) [VERIFIED].
- For one app on iOS, Android and web, all three must share one domain: the web app served from it (or a subdomain), plus `apple-app-site-association` and `assetlinks.json` hosted on it [INFERENCE from WebAuthn rules and the note above].

### C5. Limits of the account type on Arc, pricing, recovery

- It is a **smart contract account** (MSCA, ERC-4337 + ERC-6900). Arc's Memo and Multicall3From "only accept direct EOA callers… Circle SCA wallets and modular wallets can't use them directly" (`context/01-arc/gotchas.md` #27) [VERIFIED there].
- Signatures are contract signatures (ERC-1271, and ERC-6492 before deployment), so anything that needs an EOA signature, including an EIP-7702 authorization, is out [INFERENCE].
- Deployment is lazy: the first outbound operation deploys the account (`use-modular-wallets-SKILL.md`). "MSCAs have a single implementation and can't be upgraded" (03 file) [VERIFIED].
- "Your application is responsible for monitoring user operation status and resubmitting failed operations" (l.113782) [VERIFIED].
- Server-side view is read-only: the `buidl` REST endpoints list transfers, user ops, balances and NFTs (l.9273–9331). There is no server signing [VERIFIED].
- Not covered by the App Kit Circle-wallets adapter (03 file §7) [VERIFIED 2026-09-29].
- **Recovery**: `registerRecoveryAddress` adds an ECDSA recovery key from a mnemonic; "A recovery key has the same permissions as a passkey"; "Neither Circle nor your application can recover user wallets if every credential is lost" (l.114486–114493) [VERIFIED]. Synced passkeys restore through iCloud Keychain or Google Password Manager.
- **Pricing**: no separate modular price on circle.com/wallets (03 file §6) [UNKNOWN]. Gas Station bills sponsored gas plus 5% (03 file §5).

---

## D. Anything new from Circle in 2026

- **Wallets release notes 2026** contain no passkey, biometric or session feature for user-controlled wallets. Entries: Arc mainnet (2026-09-16), a `refId` filter, doc rewrites, the React Native SDK V2 doc update (2026-03-04), Solana ATA sponsorship (`release-notes-wallets-2026.md`) [VERIFIED].
- **React Native SDK 2.2.5** (2026-09-29) and iOS SDK 1.4.1–1.4.3 (September 2026) are reliability and layout fixes for PIN flows (`rn-sdk-releases.txt`; `gh api repos/circlefin/w3s-ios-sdk/releases`) [VERIFIED].
- **Agent Stack** (launched 2026-05-11; Arc mainnet 2026-09-16) is the only Circle product with scoped spending policy, and it is CLI-only with one human per session (03 file §4; `release-notes-agent-stack-2026.md`) [VERIFIED]. No SDK or REST surface for embedding it in a mobile app is documented.
- **Session Keys module**: still "upcoming" on `circle.com/modules-beta` (undated page, read today) [VERIFIED page text].
- **`@circle-fin/device-checks` 0.1.2** (2026-09-11): "collects passive device signals for partner KYB". Not a wallet authentication feature [VERIFIED npm].
- Newest `circlefin` repos (2026) include no passkey, session-key or embedded-wallet SDK for user-controlled wallets (`gh api orgs/circlefin/repos?sort=created`, read today) [VERIFIED].
- Nothing found that older research missed, other than the two items this file adds: the exact behaviour of the Confirmation UIs switch (A2), and the EOA-owner path for modular wallets being a documented Circle pattern (C3).

---

## Comparison

| | UCW social login | UCW email OTP | UCW PIN + biometrics | Modular, passkey owner | Modular, EOA owner |
|---|---|---|---|---|---|
| Onboarding steps for the user | Tap provider, consent | Enter email, type code | Set 6-digit PIN, confirm it, answer 2 security questions, then allow biometrics | Create a passkey (one OS sheet) | Depends on who holds the EOA key |
| Per-action prompt | One Circle confirm screen (one tap); **none** if Confirmation UIs is off | Same as social | Circle PIN sheet every time; Face ID fills the PIN on iOS/Android | One OS passkey prompt per user operation (batch = one) | None from Circle |
| PIN or biometric from Circle | No | No | Yes | Biometric through the OS passkey sheet | No |
| React Native | Yes, RN SDK 2.2.5 (native module, dev build) | Yes | Yes | No official SDK; web SDK needs a workaround, untested | Web SDK is plain viem; client-key binding untested in RN |
| Expo web | Web SDK 1.1.11 (redirect login; hidden iframe) | Web SDK | Web SDK; **no biometrics**, PIN typed each time | Web SDK 1.0.16 | Web SDK 1.0.16 |
| Arc testnet / mainnet | Yes / Yes (docs) | Yes / Yes (docs) | Yes (run live on testnet, EOA) / Yes (docs) | Yes / Yes (docs; Android SDK lacks the mainnet chain class) | Yes / Yes (docs) |
| Account type | EOA or SCA | EOA or SCA | EOA or SCA | Contract account (MSCA) only | Contract account (MSCA) only |
| EIP-712 signing | Yes (`sign/typedData`) | Yes | Yes (run live) | Yes, as a contract signature | Yes, as a contract signature |
| EIP-7702 authorization | Not documented; no raw-hash endpoint | Same | Same | No (not an EOA) | The MSCA cannot; the owner EOA is outside Circle |
| Works with Arc Memo / Multicall3From | Yes if EOA | Yes if EOA | Yes if EOA | No | No |
| Session length | 14 days, refreshable by the backend | Same | 60-minute tokens minted by the backend | Passkey credential, no Circle session | — |
| Recovery | Through the provider account | Through the email inbox | Security questions | Synced passkey, plus optional recovery key | Whatever protects the EOA |
| What we must set up | OAuth clients, Firebase project, Expo config plugins, GitHub PAT for Android, Console configurator | Our own SMTP provider, Console configurator | Console App ID; `NSFaceIDUsageDescription` | Client key, passkey domain, AASA + assetlinks on one domain, Gas Station policy on mainnet | Client key, Gas Station policy on mainnet |

Where a cell says "docs", the claim rests on Circle's documentation and was not executed.

## Gaps

- Not executed: a social-login or email-OTP session on Arc with Confirmation UIs off, on web or in the RN SDK. The "no UI at all" result rests on the docs, Circle's hosted-app code and one third-party report.
- Native behaviour of the Confirmation UIs switch: the iOS binary has `promptUI` and `/sdk/users/entity/config`, but the behaviour is inferred. Android not inspected.
- Whether `POST /users/token` can mint a token for a social or email user, and what `authMode` it would carry.
- Refresh-token lifetime and the maximum session length.
- Whether the web iframe's stored secret survives Safari and other third-party-storage limits.
- Biometrics-for-PIN: does the Face ID prompt start automatically on each challenge or need a tap? Does the PIN sheet flash on screen? (Spike 1 can answer on a device.)
- Whether security questions can be reduced to one, or deferred.
- Whether the RN SDK 2.2.5 runs on Expo 57 / RN 0.86 (above Circle's stated range; spike 1 in progress).
- Modular wallets: whether the web SDK works in React Native with a passkey library, and whether Circle's backend rejects a web client key when `X-AppInfo` reports `uri=unknown`.
- Modular wallets: the `/arc` mainnet path and Gas Station on Arc mainnet, not called (no client key; the project's Circle mainnet access is not approved yet).
- Modular wallet pricing.
- Whether `sign/transaction` accepts anything usable for an EIP-7702 authorization (no document suggests it does).
- The date and current status of the Session Keys beta.

## Claude's notes (ideas, not facts)

These are my own observations, labelled as such per the project's research rules.
- With Confirmation UIs off, the app itself could put a device biometric check (for example `expo-local-authentication`) in front of `execute()`. That would look like Face ID approval, but it is an app-level gate: Circle would not enforce it, and the consent burden Circle describes in its warning would sit with Kawase.
- The cheapest way to close the biggest gap is one test on ARC-TESTNET with the existing test key: create an email-OTP user (Mailtrap), set `accountType: "EOA"`, turn Confirmation UIs off, and run a transfer and a `signTypedData` challenge in both the Web SDK and the RN dev build. It needs Abu to change a Console setting and to log in, so it was out of scope for this research run.
- The Confirmation UIs switch is project-wide. If Kawase wanted "ask above a limit, do not ask below it", the asking would have to be Kawase's own screen in both cases.
