# Passkey accounts on Arc without a wallet vendor: React Native passkeys, PRF-derived keys, passkey-owned contract accounts

Purpose: what Kawase (one Expo SDK 57 / React Native 0.86.3 app for iOS, Android and web) can do with passkeys / Face ID on Arc **without** a wallet vendor, what is deployed on Arc for it, and what each option costs.

Sources:
- npm tarballs unpacked 2026-09-30: `react-native-passkeys@0.4.2`, `react-native-passkey@3.6.2`, `@zerodev/passkey-validator@5.6.0`, `@zerodev/webauthn-key@5.5.0`; versions and dates in `.firecrawl/product/17/npm-native-deps-2026-09-30.txt` and `.firecrawl/product/17/passkey/npm-versions-2026-09-30.tsv`
- GitHub (via `gh api`): `.firecrawl/product/17/passkey-libs-gh-issues.txt`, `.firecrawl/product/17/passkey/rn-passkey-libs-issues-detail-2026-09-30.txt`, `rn-passkey-simulator-issues.txt`, `breez-passkey-login-spec.md`
- Live RPC, read-only, 2026-09-30, `https://rpc.mainnet.arc.io` (block 23,549,453) and `https://rpc.testnet.arc.io` (block 64,787,180): `.firecrawl/product/17/passkey/getcode-2026-09-30.tsv` and `getcode-rerun-2026-09-30.tsv` (addresses and their package provenance in `addrs.tsv`), `coinbase-impl.txt`, `usdc-3009-1271-2026-09-30.txt`, `usdc-1271-simulation-2026-09-30.txt`, `usdc-3009-7702-simulation-2026-09-30.txt` (script: `usdc-3009-7702-simulation.sh`)
- Host checks: `.firecrawl/product/17/psl.dat` (Public Suffix List, version 2026-09-24), `psl-sslip-grep.txt`, `sslip-domain-check.txt`, `passkey/sslip-domain-recheck-2026-09-30.txt`, `letsencrypt-rate-limits.html`
- Specs and platform docs: W3C WebAuthn Level 3 Recommendation https://www.w3.org/TR/webauthn-3/ (saved `passkey/webauthn-3-TR.txt`); MDN browser-compat-data 8.1.3 (saved `passkey/mdn-bcd-8.1.3-prf.json`); Apple https://developer.apple.com/documentation/xcode/supporting-associated-domains (saved `apple-supporting-associated-domains.json`), https://developer.apple.com/documentation/authenticationservices/supporting-passkeys and the PRF API page (saved `passkey/apple-*.json`); Android https://developer.android.com/identity/credential-manager/prerequisites and https://developers.google.com/identity/passkeys/supported-environments; Expo SecureStore docs for SDK 57 (saved `passkey/expo-securestore-v57.0.0.mdx`) and the installed `expo-secure-store@57.0.4` typings
- Secondary: Corbado, "Passkeys & WebAuthn PRF" https://www.corbado.com/blog/passkeys-prf-webauthn (modified 2026-09-29); Yubico PRF guide https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html; Breez SDK https://sdk-doc-spark.breez.technology/guide/passkey.html; Openfort docs (`.firecrawl/product/17/other/openfort-llms-full.txt`)
- Circle: packages installed for spike 3 in `plan/spikes/code/03-app-kit/node_modules/@circle-fin/` (`adapter-viem-v2@1.18.0`, `unified-balance-kit@1.7.0`); docs dumps `.firecrawl/docs/circle-llms-full.txt` and `arc-llms-full.txt` (fetched 2026-09-29)
- Earlier work in this repo: `plan/spikes/15-eip7702-limits.md`, `04-delegation.md`, `03-app-kit.md`; `context/08-product-research/03-wallets-custody-limits/aa-infra-on-arc.md`, `delegation-session-keys-limits.md`

Verified: 2026-09-30

Nothing in this file was built or run inside the Kawase app. No passkey was created, no transaction was sent. "Works" below means "the code, docs or chain state say so", unless a row says it was simulated.

---

## 0. Short answers

| Question | Answer |
|---|---|
| Can an Expo 57 app do passkeys on iOS, Android and web with one API? | Yes on paper: `react-native-passkeys@0.4.2` is an Expo module with iOS, Android and web implementations [VERIFIED tarball]. Not built in our app [UNKNOWN]. |
| What blocks shipping this week? | Not the library. (1) A stable HTTPS host for the rpId: both Kawase sslip.io hosts serve Traefik's self-signed default certificate today [VERIFIED]. (2) A paid Apple Developer team for the Associated Domains entitlement [REPORTED]. (3) The Android signing-certificate SHA-256 for `assetlinks.json`. (4) A decision on the rpId, which can never change afterwards. |
| PRF (passkey-derived EOA key)? | Possible on iOS 18+, Android (libraries say Android 14+), Safari 18+, Chrome 116+ [VERIFIED data / REPORTED]. It keeps the wallet an ordinary EOA, which fits everything already proven on Arc. The costs: the key is in app memory while signing, and it is tied for ever to one passkey and one domain. |
| Passkey-owned contract accounts live on **both** Arc networks? | ZeroDev Kernel v3.1/v3.3 + patched passkey validator, Safe 1.4.1 + passkey signer, MetaMask HybridDeleGator: **yes**. Coinbase Smart Wallet: **mainnet only**. [VERIFIED bytecode; none was exercised] |
| 4(a) Does `@circle-fin/adapter-viem-v2` need an EOA? | It needs a viem `WalletClient` with `sendTransaction` and `signTypedData`; it does not check the account type [VERIFIED code]. Three Circle paths around it prefer or require EOA signatures (§4a). |
| 4(b) Does Arc USDC accept ERC-1271 for `transferWithAuthorization`? | **Yes, on both networks** [VERIFIED by `eth_call` simulation]. Circle's Facilitator Service accepts deployed ERC-1271 accounts; Gateway Nanopayments / x402 batch settlement are EOA-only [VERIFIED docs]. |

---

## 1. React Native passkeys

### 1.1 The two libraries

| | `react-native-passkeys` (peterferguson) | `react-native-passkey` (f-23) |
|---|---|---|
| Latest version, published | 0.4.2, 2026-08-05 | 3.6.2, 2026-09-08 |
| Repo activity | last push 2026-08-05, 155 stars, 23 open issues/PRs | last push 2026-09-08, 221 stars, 6 open |
| Kind of module | **Expo module** (`expo-module.config.json`: `"platforms": ["ios", "android", "web"]`; Swift/Kotlin written with the Expo Modules API) | Classic bridge module: `RCT_EXTERN_MODULE(Passkey, NSObject)` on iOS, `ReactContextBaseJavaModule` on Android, reached through `NativeModules.Passkey`; no codegen spec in `package.json` |
| Web | **Yes**: `ReactNativePasskeysModule.web.ts` wraps `navigator.credentials.create/get` behind the same API | No web code in the package |
| Expo config plugin | **None in the tarball.** Setup is plain `app.json`: `ios.associatedDomains` plus `expo-build-properties` (iOS deployment target 15.0, Android `compileSdkVersion` ≥ 34) | **None.** README describes Xcode steps; its linking error lists "You are not using Expo managed workflow" |
| Peer dependencies | `expo >=53.0.0`, `react-native >=0.71.0` | `react-native *` |
| iOS minimum | 15.0 (podspec) | 15.0 (podspec) |
| Android | `androidx.credentials:credentials(-play-services-auth):1.3.0-alpha01`; `isSupported()` returns true from API 28; the request (including `prf`) is serialized to JSON and handed to Credential Manager, so PRF support is decided by the OS and the provider, not by the library | `androidx.credentials…:1.6.0`; README: "Android API 28+" |
| New architecture | Expo Modules API modules run on the new architecture; nothing in the package opts out [INFERENCE from the module type] | No TurboModule spec; on RN 0.86 it depends on the legacy-module interop layer [INFERENCE]. No new-architecture bug appears in its issues since 2026-06-25 [VERIFIED issue list] |
| PRF | iOS 18+ (`#available(iOS 18, *)`), Android, web. `eval` and, since 0.4.0, `evalByCredential`; the changelog says "iOS (iOS 18+), Android (API 34+), and Web" | README: "As of version 3.3 the PRF extension will work for Android and iOS 18+." `evalByCredential` at registration throws on iOS |
| largeBlob | iOS 17+ | iOS 17+ |
| Other | `isSupported()`, `isAutoFillAvailable()` | `getImmediate()` (silent check), Signal API (iOS 26+), normalized error codes |

All rows [VERIFIED] from the unpacked tarballs (`README.md`, `CHANGELOG.md`, `ios/*.swift`, `android/build.gradle`, `package.json`) and `gh api repos/...`, unless tagged otherwise.

**Reports for Expo SDK 57 / RN 0.86**
- `react-native-passkeys` PR #67 (open, 2026-08-05): the author "built an app with this change and ran it on a device (iOS 26.5.2, Expo SDK 57)" [REPORTED, one contributor].
- Android Gradle Plugin 9: `react-native-passkeys@0.4.2` still applies `kotlin-android` unconditionally (`android/build.gradle:2`); PR #71 (open since 2026-09-04) says "on an AGP 9 project this cannot be built at all". `react-native-passkey` merged the same fix (#116) and shipped it in 3.6.2 [VERIFIED]. **This does not hit us today**: React Native 0.86.3 pins `agp = "8.12.0"` (`node_modules/.../react-native/gradle/libs.versions.toml:9`, saved as `passkey/rn-0.86.3-agp-version.txt`) [VERIFIED]. It will matter on the next RN upgrade [INFERENCE].
- No issue in either repo names SDK 57 or RN 0.86 as broken [VERIFIED: issue titles since 2026-06-25]. Absence of reports is not proof.
- Open issues worth knowing: `react-native-passkey` #96 (open, updated 2026-09-23): passkey creation fails about 5% of the time after delete + reinstall with "Unable to verify webcredentials association", and then stays stuck; this is iOS association state, so it likely applies to any library [REPORTED; INFERENCE for the last part]. `react-native-passkeys` #68: security-key registration does not complete on iOS 26 (not our case; we use platform passkeys).

**Which one for Kawase** [Claude's opinion]: `react-native-passkeys`, because it is the only one with a web implementation behind the same API and it is an Expo module. `react-native-passkey` is more actively maintained and is what Para's and thirdweb's Expo examples use (`.firecrawl/product/17/other/example-app-versions-2026-09-30.txt`), so it is the fallback for native, with plain `navigator.credentials` on web.

### 1.2 Platform requirements

| Requirement | Fact | Source |
|---|---|---|
| iOS entitlement | The app needs the Associated Domains capability with `webcredentials:<domain>`; without it "the request returns an error" | Apple, Supporting passkeys [VERIFIED] |
| iOS association file | `https://<fully qualified domain>/.well-known/apple-app-site-association`, JSON `{"webcredentials":{"apps":["<TeamID>.<bundleID>"]}}`, no extension. "You must host the file using `https://` with a valid certificate and with no redirects." | Apple, Supporting associated domains [VERIFIED] |
| Who fetches it | Since iOS 14 the device asks an **Apple CDN**, not your server. Apple's CDN "requests the … file for your domain within 24 hours"; devices re-check about weekly. For servers not reachable from the internet there is `?mode=developer` | same [VERIFIED] |
| Apple account | Needs a Team ID. The `react-native-passkeys` maintainer: "you'll need to have a paid account to test passkeys on iOS" (Xcode refuses Associated Domains on free accounts) | issue #47 [REPORTED]; Apple's capability table was not readable by our fetch [UNKNOWN] |
| Android association file | `https://<domain>/.well-known/assetlinks.json` with relation `delegate_permission/common.get_login_creds` (plus `handle_all_urls` for App Links), the package name and the **SHA-256 signing-certificate fingerprint(s)**. Must return 200, `Content-Type: application/json`; "Verification fails if the response has a `301` or `302` HTTP redirect" | Android Credential Manager prerequisites [VERIFIED] |
| Android version | "Passkeys are supported on devices that run Android 9 (API level 28) or higher"; other providers selectable on Android 14+ | Google, supported environments (page dated 2025-05-19) [VERIFIED] |
| Android caching | "Android caches `assetlinks.json` for up to 24 hours"; reinstall to refetch | `react-native-passkeys` README [REPORTED] |
| Build type | A native build (`expo prebuild` / `expo run` / EAS). Kawase already uses native modules and generated `ios/` (`plan/spikes/09-pnpm-expo57-native.md`) | README of both libraries [VERIFIED] |
| Kawase today | `apps/mobile/app.json` has bundle id and package `xyz.kawase.app`, **no `associatedDomains`**, no `eas.json`, no team id | repo [VERIFIED] |

### 1.3 Can `kawase-api.84.46.247.92.sslip.io` be the rpId?

What the saved checks show:
- **sslip.io is not on the Public Suffix List.** `grep -i 'sslip\|nip\.io\|xip\.io'` on the PSL (version 2026-09-24, commit a179a48) returns nothing [VERIFIED, re-run today].
- **The host does not serve valid HTTPS today.** `kawase-api.84.46.247.92.sslip.io`, `kawase.84.46.247.92.sslip.io` and the bare `84.46.247.92.sslip.io` all present `CN=TRAEFIK DEFAULT CERT` (self-signed); both `.well-known` files are unreachable; Apple's CDN path for the host returned nothing. Another app on the same server, `our-journal.84.46.247.92.sslip.io`, has a valid Let's Encrypt certificate, so the server can get one for an sslip.io name once a Kawase service is deployed there [VERIFIED `passkey/sslip-domain-recheck-2026-09-30.txt`; INFERENCE for the last clause].

Why the PSL matters:
1. **rpId scope on the web.** WebAuthn: the RP ID defaults to the caller's effective domain and may be overridden only if it "is a registrable domain suffix of or is equal to the caller's origin's effective domain" (WebAuthn L3 §5.1.3 / RP ID definition) [VERIFIED]. "Registrable domain" is computed from the PSL. Because sslip.io is not on it, the registrable domain of every sslip.io host is `sslip.io` itself [INFERENCE from the two verified facts]. Consequences [INFERENCE]:
   - Using the **full host** as rpId is safe from other sslip.io tenants: `evil.1.2.3.4.sslip.io` cannot claim `kawase-api.84.46.247.92.sslip.io`, because that is not a suffix of its own domain.
   - Using `sslip.io` or `84.46.247.92.sslip.io` as rpId would be allowed by browsers and would expose the passkeys to every sslip.io site, or to every app on Abu's server. Do not do that.
   - **The web app cannot use the api host as rpId.** The planned web origin is `kawase.84.46.247.92.sslip.io` (`deploy/coolify.md:42`). `kawase-api.…` is not equal to it and is not a suffix of it. So an rpId on the api host would work in the native apps and fail on web, unless Related Origin Requests (`https://<rpId>/.well-known/webauthn`, WebAuthn L3 §5.11) are set up, and client support for that varies [VERIFIED spec; support not checked]. **For one passkey across native and web, the rpId must be the web app's host (or a parent both share), and that host must serve both `.well-known` files.**
2. **Certificates.** Let's Encrypt uses the PSL "to identify registered domains" and allows "Up to 50 certificates … per registered domain" per 7 days [VERIFIED `letsencrypt-rate-limits.html`]. With sslip.io off the PSL, every sslip.io user in the world shares that one bucket [INFERENCE]; whether sslip.io holds an exemption is [UNKNOWN]. A failed renewal leaves Traefik's default certificate, and Apple's CDN then cannot fetch the association file.
3. **The rpId is permanent, and this one contains the server's IP address.** A credential "can only be used for authentication with the same entity (as identified by RP ID) it was registered with" (WebAuthn L3) [VERIFIED]. If the server moves or the project later takes a real domain, every passkey made for `….84.46.247.92.sslip.io` stops working [INFERENCE]. For login passkeys that is an inconvenience. For a PRF-derived wallet key (§2) it means the key is gone.

[Claude's opinion] A throwaway sslip.io rpId is acceptable for a demo spike and wrong for anything that holds a user's key. A real domain (the bundle id `xyz.kawase.app` suggests `kawase.xyz`, not checked) should be in place before the first user passkey is created. This revises the scope of D27 ("deploy on the Coolify-provided domain for now") for this one feature.

### 1.4 iOS Simulator

- The `react-native-passkey` maintainer reported passkeys working on a Simulator (Xcode 14.3, iOS 16.4) with "FaceID/TouchID is enrolled …, not signed in to iCloud", using a public HTTPS tunnel for the association file; the reporter's actual fault was a team ID that differed between debug and release builds (issue #10, 2023) [REPORTED].
- `localhost` does not work as the domain: the `react-native-passkeys` maintainer points to Apple's "valid certificate … no redirects" rule (issue #24, 2024) [REPORTED].
- Simulator setup asked about in `react-native-passkeys` #15: Features → Face ID → Enrolled [REPORTED].
- So: creation in the Simulator is reported to work, given a signed build with the right team ID and a public HTTPS domain. Current Xcode / iOS 26 Simulator behaviour, and **PRF in the Simulator**, are [UNKNOWN] (no source found; not tried).
- `expo-secure-store` notes that simulators "do not require biometric authentication when retrieving secrets, unlike real iOS devices" [VERIFIED typings], so the Face ID UX needs a real device either way.

### 1.5 Does a passkey made in the app work on the web, and the reverse?

Yes by design, when the rpId is the same and the associations are in place:
- A credential's scope is its RP ID (§1.3), not the app or browser that created it [VERIFIED spec].
- Apple: associated domains exist "so you can share credentials … in your app from your website"; passkeys are stored in iCloud Keychain and synced across the user's devices [VERIFIED Apple docs].
- Android: `get_login_creds` "enables sharing credentials between your website and your Android app" so users "use the same saved credentials across associated apps and websites" [VERIFIED Android docs].
- Limits: sharing is within one provider. A passkey in iCloud Keychain is not in Google Password Manager; going from an iPhone to Chrome on Windows or Android uses the QR / cross-device flow each time [INFERENCE; Corbado lists cross-device PRF as supported on iOS 18.4+, Android, macOS and Windows, REPORTED]. Not tested by us on any device.

### 1.6 What shipping needs from the product owner

1. A domain decision for the rpId (§1.3), and that host serving valid HTTPS plus the two `.well-known` files from the **web app's** host.
2. Apple Developer Program membership and the Team ID (for the entitlement and for the `apple-app-site-association` entry `<TeamID>.xyz.kawase.app`).
3. The Android signing SHA-256 fingerprints (debug keystore and the EAS / Play signing key).
4. Real devices: an iPhone on iOS 18+ (for PRF) and an Android phone with a Google account and a screen lock.
5. One day of spike time to build and run `react-native-passkeys` in `apps/mobile` on the three targets [Claude's estimate, INFERENCE].

---

## 2. The passkey-derived key (WebAuthn PRF → ordinary secp256k1 EOA)

### 2.1 What PRF is

The `prf` extension lets a relying party get a pseudo-random output bound to one credential. The client hashes each input as `SHA-256("WebAuthn PRF" || 0x00 || input)` and uses the CTAP2 `hmac-secret` extension [VERIFIED WebAuthn L3 §10.1.4]. The same passkey plus the same salt gives the same 32 bytes on every device the passkey syncs to, so a wallet key can be re-derived on demand instead of stored [INFERENCE from the spec; this is the Breez design below].

### 2.2 Support

**Browsers** (MDN browser-compat-data 8.1.3, 2026-09-24, `create()` with `prf`) [VERIFIED data file]:

| Chrome | Chrome Android | Edge | Safari | Safari iOS | Firefox | Firefox Android | Samsung Internet | Android WebView | iOS WKWebView |
|---|---|---|---|---|---|---|---|---|---|
| 116 | 116 | 116 | 18 | 18 | 139 (135, not on macOS) | 149 | 24.0 | **no** | 18 |

The same data set marks `get()` with `prf` as **unsupported in Safari, Safari iOS and iOS WebView**, and Firefox Android. That contradicts Apple's own API (next row) and Corbado's tests; treat the MDN `get` row for Safari as a data gap, not as a fact [INFERENCE].

**Native** [VERIFIED unless tagged]:
- iOS / iPadOS **18.0+**, macOS 15.0+: `ASAuthorizationPublicKeyCredentialPRFAssertionInput` availability (Apple docs); both RN libraries gate PRF on `#available(iOS 18, *)`.
- Android: the libraries and Openfort say Android 14 / API 34+ for PRF (`react-native-passkeys` changelog; Openfort docs: "requires **iOS 18+** or **Android 14+ (API 34)**"). Google's own page gives no PRF minimum [UNKNOWN from a primary Google source].

**Authenticators / password managers** (Corbado, page modified 2026-09-29) [REPORTED]:
- Apple Passwords (iCloud Keychain): PRF on create and get. Google Password Manager: "Every passkey stored in GPM supports PRF."
- Windows Hello: only on Windows 11 24H2/25H2 with the February 2026 update, Chrome/Edge 147+ or Firefox 148+. Windows 10: none.
- macOS 15+: Safari 18+, Chrome 132+, Firefox 139.
- **iOS 18.0–18.3: "Bugs causing data loss as CDA Source"** (cross-device sign-in); fixed in 18.4.
- Third-party managers vary: 1Password, Proton Pass, Keeper yes; Bitwarden partial ("0% on iOS"); Dashlane and NordPass no; Samsung Pass returns nothing at registration and a value at the next sign-in.
- "Create and get are separate capabilities."

The spec itself says results at registration are optional: "Outputs may not be available during registration" [VERIFIED §10.1.4]. A design must handle "created, but no PRF output yet" with a second prompt, and must check `prf.enabled` and refuse or fall back when the user's chosen provider has no PRF.

### 2.3 Who does this in production

| Who | What they do with PRF | Status |
|---|---|---|
| **Breez SDK** (Bitcoin / Lightning) | "uses the WebAuthn PRF extension to deterministically derive a seed phrase from the user's passkey on-demand"; "No keys or seed phrases are stored". Spec v0.9.1: `root_key = PRF(passkey, salt)`, `mnemonic = BIP39(root_key)`, user "may choose to record/write down mnemonic for backup" | docs + `breez/passkey-login` spec (repo last pushed 2026-01-19) [VERIFIED]. The closest production analogue; not EVM |
| **Openfort** (EVM / Solana embedded wallets) | Passkey **recovery**: the "Recovery share [is] encrypted with the passkey … (PRF) extension to derive an encryption key". The wallet key is not the PRF output. RN needs iOS 18+ / Android 14+ | Openfort docs dump l.10549, 29911 [VERIFIED docs]. A vendor, listed only as evidence of the pattern |
| Small open-source wallets | Derive a secp256k1 key from `SHA-256`/HKDF of the PRF output (e.g. `sanjaysingh/ethwallet` PR 24) | search result only [REPORTED, not reviewed] |
| Privy, Turnkey, Para, thirdweb, Magic, Crossmint, Reown, Dynamic, Coinbase CDP, MetaMask Embedded Wallets, Tempo | **No mention of PRF** in their docs dumps saved today (`grep` count 0 in each `*-llms*.txt`) | [VERIFIED grep; an `llms.txt` dump can miss pages] |

No established EVM wallet was found that derives the user's EOA key directly from PRF [UNKNOWN beyond the rows above].

### 2.4 Library support

- **Web:** native `navigator.credentials` with `extensions: { prf: { eval: { first } } }`; `react-native-passkeys`' web module passes `prf` through and base64url-encodes the results [VERIFIED source].
- **React Native:** both libraries (§1.1).
- **From PRF bytes to a wallet:** no ready-made package was found that goes "PRF output → viem account" [UNKNOWN; not searched exhaustively]. The step is small: HKDF over the PRF output, reduce to a valid secp256k1 scalar, `privateKeyToAccount` [Claude's design, not built]. Yubico's guide: the PRF output "should be treated as **Input Keying Material (IKM)**, not as a final encryption key", with HKDF recommended [REPORTED].

### 2.5 Trade-offs

Facts:
1. **The key leaves the authenticator.** PRF results are returned to the calling app in `clientExtensionResults` [VERIFIED spec]. The secp256k1 key then exists in JavaScript memory while it signs. With a passkey-owned contract account (§3) the P-256 key never leaves the secure hardware.
2. **Never send the response object to a server as-is.** The spec warns that `toJSON()` "will include this `results` output if present" and that "it may be necessary to omit this `results` output if the `PublicKeyCredential` is sent to a remote server" [VERIFIED]. Both RN libraries return `prf.results` inside the response JSON [VERIFIED source], so the usual "post the assertion to the backend" flow would leak the wallet seed unless the field is stripped first.
3. **One passkey, one domain, one key.** A different credential gives a different PRF output, and a credential works only for its RP ID [VERIFIED spec]. Openfort states the consequence: "Credentials created for your domain … cannot be used on other domains." Deleting the passkey, or losing the domain (§1.3), loses the key unless the user exported a backup. Breez's answer is an optional written mnemonic; Yubico's is envelope encryption so that "any of a user's registered YubiKeys [can] unlock the same data vault" [VERIFIED / REPORTED].
4. **Coverage gaps**: iOS 17 and older, Windows before the 2026 updates, Android WebView, and password managers without PRF (§2.2).
5. **An EOA key cannot be rotated.** If the derived key leaks, the address is compromised and funds must move to a new address. A contract account can replace its owner [INFERENCE, general EVM fact].

[Claude's opinion, labelled]
- The security of the wallet becomes the security of the user's Apple or Google account plus the app's handling of the key in memory. That is weaker than hardware-bound signing and comparable to a well-built embedded wallet, without the vendor.
- The strongest argument for PRF is fit: the result is a normal EOA, and everything Kawase has proven on Arc assumes one. Spike 15's on-chain limits were set up by an ordinary local key signing one EIP-7702 authorization and one EIP-712 delegation; a PRF-derived key is exactly that kind of key. Inside the limit the agent acts with no prompt; above it, one Face ID prompt re-derives the key and signs.
- PRF should not be the only copy. Offer an export, or keep a second wrapped copy, before real money is involved.

### 2.6 The simpler variant: a device key in the platform keystore behind biometrics

`expo-secure-store@57.0.4` is already installed in `apps/mobile` [VERIFIED `package.json`].
- Storage: Android "`SharedPreferences`, encrypted with Android's Keystore system"; iOS keychain services as `kSecClassGenericPassword` [VERIFIED docs].
- `requireAuthentication: true` asks for biometrics on read/write; `canUseBiometricAuthentication()` tells whether the device qualifies [VERIFIED typings]. It is "not supported in Expo Go" (missing `NSFaceIDUsageDescription`); the config plugin's `faceIDPermission` sets it [VERIFIED docs].
- Platforms listed: `android`, `ios`, `tvos`. **No web** [VERIFIED docs frontmatter].
- "Keys are invalidated by the system when biometrics change, such as adding a new fingerprint or changing the face profile … After a key has been invalidated, it becomes impossible to read its value." [VERIFIED typings]
- Android: data "**will not be preserved upon app uninstallation**", and SecureStore entries are excluded from Auto Backup because they cannot be decrypted after restore. iOS: data may persist across reinstall, "not guaranteed" [VERIFIED docs].
- Expo's own warning: "it is important not to rely on it as a single source of truth for irreplaceable, critical data." [VERIFIED docs]

What it loses compared with PRF: no sync to a second device, no recovery after a lost phone, an Android reinstall or a biometric re-enrolment, and nothing on web. What it gains: works on every supported OS version today, needs no domain, no association files and no Apple team setup, and the prompt is the same Face ID sheet.

[Claude's idea] The two combine: sign day to day with a device key in SecureStore, and use a passkey's PRF output only to encrypt a backup of that key (Openfort's pattern, without Openfort). The rpId risk then threatens only the backup, not the live key.

---

## 3. Passkey-owned contract accounts on Arc

### 3.1 On-chain check (bytecode size in bytes; 0 = no code)

Run twice today (12:27 and 13:57 UTC) with identical results; two timeouts in the second run were retried [VERIFIED]. Full table of 116 addresses: `.firecrawl/product/17/passkey/getcode-2026-09-30.tsv`. Address provenance (package, file and line) is in `addrs.tsv`.

| Stack | Contract | Address | Mainnet 5042 | Testnet 5042002 |
|---|---|---|---|---|
| control | EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16,035 | 16,035 |
| control | random address | `0x1111…1234` | 0 | 0 |
| **ZeroDev** | Kernel v3.1 implementation | `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` | 22,784 | 22,784 |
| | Kernel v3.1 factory | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` | 989 | 989 |
| | Kernel v3.3 implementation (also the 7702 target) | `0xd6CEDDe84be40893d153Be9d467CD6aD37875b28` | 24,469 | 24,469 |
| | Kernel v3.2 implementation | `0xD830D15D3dc0C269F3dBAa0F3e8626d33CFdaBe1` | **0** | 23,563 |
| | Passkey (WebAuthn) validator v0.0.3, "PATCHED" | `0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69` | 4,739 | 4,739 |
| | Passkey validator v0.0.1 / v0.0.2, "UNPATCHED" | `0xD990…Aa06` / `0xbA45…90Fd` | 0 | 0 |
| | Permission WebAuthn signer v0.0.4 (patched) | `0x65DEeC8fEe717dc044D0CFD63cCf55F02cCaC2b3` | 5,191 | 5,191 |
| | CallPolicy v0.0.5, RateLimit, Timestamp, Gas, Sudo policies | see TSV | present | present |
| **Safe** | Safe 1.4.1 singleton / SafeL2 | `0x4167…461a` / `0x29fc…C762` | 23,579 / 24,421 | same |
| | Safe4337Module v0.3.0 | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | 8,373 | 8,373 |
| | **SafeWebAuthnSignerFactory v0.2.1** | `0x1d31F259eE307358a26dFb23EB365939E8641195` | 2,143 | 2,143 |
| | **SafeWebAuthnSharedSigner v0.2.1** | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` | 2,954 | 2,954 |
| | Daimo P256 verifier / FCL P256 verifier | `0xc2b7…4De4` / `0xA86e…5DBA` | 3,537 / 5,770 | same |
| | Safe 1.5.0 singleton + factory | `0xFf51…a44b` / `0x14F2…5e7b` | present | present |
| **Coinbase Smart Wallet** | Factory v1 | `0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a` | 1,668 | **0** |
| | Factory v1.1 | `0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842` | 1,810 | **0** |
| | Implementations v1 / v1.1 (read from `implementation()`) | `0x000100ab…9E72` / `0x00000110…534d` | 18,002 / 17,694 | **0 / 0** |
| | SpendPermissionManager | `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` | 0 | 0 |
| **MetaMask DF v1.3.0** | HybridDeleGator implementation (EOA + P256/WebAuthn owners) | `0x48dBe696A4D990079e039489bA2053B36E8FFEC4` | 20,203 | 20,203 |
| | SimpleFactory | `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c` | 751 | 751 |
| | DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` | 11,503 | 11,503 |
| | EIP7702StatelessDeleGator | `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` | 11,185 | 11,185 |
| Others | Alchemy ModularAccount v2 WebAuthn factory + WebAuthnValidationModule | `0x5501…1960` / `0x0000…5217` | 4,367 / 9,462 | same |
| | Circle WeightedWebAuthnMultisig plugin (vendor) | `0x0000000C984AFf541D6cE86Bb697e68ec57873C8` | 19,580 | 19,580 |
| | Solady P256 verifier | `0x000000000000D01eA45F9eFD5c54f037Fa57Ea1a` | 2,066 | 2,066 |
| | Porto (Ithaca) Orchestrator, Account Proxy, … | see TSV | 0 | 0 |

Notes:
- Kernel, HybridDeleGator, DelegationManager and EIP7702StatelessDeleGator have the same size on both networks but different code hashes (TSV columns 6–7). `aa-infra-on-arc.md` attributes this to immutables; not proven [INFERENCE].
- The P256 precompile at `0x100` was verified on both networks on 2026-09-29 (`.firecrawl/product/03-wallets/p256-precompile-check.txt`); not re-run today.
- ZeroDev's SDK does not list Arc in its precompile network list (`RIP7212_SUPPORTED_NETWORKS`, 63 chain ids, neither 5042 nor 5042002; `@zerodev/webauthn-key@5.5.0` `_esm/utils.js`) [VERIFIED], so its passkey validator would be initialised with `usePrecompiled = false` and verify P-256 in Solidity, at a higher gas cost [INFERENCE from the code].
- Porto is deprecated: the repo is archived and its README says "Porto is deprecated" (`passkey/porto-repo-status.txt`) [VERIFIED].

### 3.2 Live on both networks?

| Stack | Both networks? | Client side |
|---|---|---|
| ZeroDev Kernel v3.1 / v3.3 + passkey validator v0.0.3 | **Yes** | `@zerodev/passkey-validator` accepts a `webAuthnKey` with a `signMessageCallback`, so a React Native passkey call can be plugged in; its default helper talks to a passkey server URL [VERIFIED source]. Pimlico's public bundler serves both Arc networks (`aa-infra-on-arc.md` §3) |
| Safe 1.4.1 + Safe4337Module + SafeWebAuthnSignerFactory / SharedSigner | **Yes** | `permissionless@0.4.1` `toSafeSmartAccount` carries these addresses [VERIFIED `addrs.tsv`] |
| MetaMask HybridDeleGator with a P256/WebAuthn owner | **Yes** | `@metamask/smart-accounts-kit@2.0.0`: `WebAuthnSignerConfig = { webAuthnAccount: WebAuthnAccount; keyId: Hex }` [VERIFIED typings]; viem's `toWebAuthnAccount` takes a custom `getFn` and `rpId` [VERIFIED typings]. The kit maps Arc testnet only (spike 4) |
| Coinbase Smart Wallet | **No: mainnet only** | viem `toCoinbaseSmartAccount` exists; no factory on testnet, no SpendPermissionManager on either |

Deployed is not the same as proven. None of these was run with a passkey owner on Arc. The only passkey-adjacent run is spike 4's HybridDeleGator with an **ECDSA** owner on testnet (17/17).

### 3.3 Per-action UX

Each signature by a passkey owner is one WebAuthn assertion, which is one OS biometric sheet [INFERENCE from the WebAuthn model; the account's validator checks a P-256 signature over the operation hash]. So a passkey-owned account means **one Face ID prompt per operation**, unless the account grants a session key or a delegation to another signer: ZeroDev permissions/policies, or MetaMask delegations with caveats (both present on both networks, §3.1; MetaMask's were exercised in spikes 4 and 15 with ECDSA owners).

Other costs on our stack [VERIFIED from earlier spikes, INFERENCE for the conclusion]: a contract account is a second address that must be funded (spike 15: "No separate 'pocket' account and no moving funds" was the gain of the EOA design); revoking needs a UserOp (spike 4 finding 1); Arc's Memo and Multicall3From need EOA callers (spike 3, K3); and §4 lists the EOA-only Circle paths.

---

## 4. Constraints from our stack

### 4a. Does Circle App Kit's viem adapter need an EOA wallet client?

- Spike 3 ran App Kit with an **EOA** (the Circle user-controlled wallet) through `createViemAdapter` from `@circle-fin/adapter-viem-v2/next` plus a custom signing strategy, and found `createCircleUserWalletAdapter` is SCA-only (`plan/spikes/03-app-kit.md`) [VERIFIED there].
- `@circle-fin/adapter-viem-v2@1.18.0` takes `getWalletClient: ({ chain }) => WalletClient` and calls only `sendTransaction`, `signTypedData`, `getAddresses`, `switchChain` and the EIP-5792 trio `getCapabilities` / `sendCalls` / `getCallsStatus` on it (`grep -o 'walletClient\.[a-zA-Z]+' index.mjs`). There is no check on `account.type`; the user-controlled path just uses `walletClient.account` (`index.mjs:25944-25960`) [VERIFIED].
- Factories: `createViemAdapterFromPrivateKey` and `createViemAdapterFromProvider` (EIP-1193). On `/next`, "`createViemAdapterFromAccount` / `createViemAdapterFromWalletClient` are deferred" (README) [VERIFIED].
- So: **a PRF-derived or device-stored key is the adapter's simplest case** (`createViemAdapterFromPrivateKey`) [INFERENCE]. A smart-account client that exposes `sendTransaction` and `signTypedData` would satisfy the interface, but that was not run [UNKNOWN].
- Where an EOA is preferred or required around the adapter:
  - Swap: "If your Circle Wallet is a smart contract account (SCA), set `allowanceStrategy: "approve"`. USDC permit signatures use `ecrecover`, which does not accept the SCA's ERC-1271 signature" (Arc docs, `arc-llms-full.txt:3512-3517`) [VERIFIED docs].
  - Unified Balance / Gateway: contract signers must set `contractSigner: true` (ERC-1271, checked off-chain). `@circle-fin/unified-balance-kit@1.7.0` detects this from bytecode and states "EIP-7702-delegated EOAs are treated as EOAs" (`index.mjs` near l.18380-18430) [VERIFIED code].
  - Gateway Nanopayments: EOA only (4b).

### 4b. x402 / EIP-3009 on Arc USDC: contract signatures or EOA only?

**The token contract** (`0x3600000000000000000000000000000000000000`, same on both networks) [VERIFIED, `usdc-3009-1271-2026-09-30.txt`]:
- A proxy; `version()` = "2"; `implementation()` = `0xc6ad664ac6679f4ce74e10e91449c93ec1ae3ca6` (23,659 bytes, identical code hash on both networks; the bytecode contains the string `NativeFiatTokenV2_2`).
- The implementation has both overloads of each function: `transferWithAuthorization` with `(v,r,s)` `0xe3ee160e` and with `bytes signature` `0xcf092995`; likewise `receiveWithAuthorization` (`0xef55bec6` / `0x88b7ab63`), `cancelAuthorization` (`0x5a049a70` / `0xb7b72899`) and `permit` (`0xd505accf` / `0x9fd5a6cf`).
- It links a library at `0xfcff98b65f9ea559ec0df36f4072c7e3be0520df` (1,741 bytes on both) that contains the ERC-1271 selector `0x1626ba7e`.

**Simulation** (`eth_call` with state overrides; nothing was sent) [VERIFIED on both networks]:

| Case | `from` | Signature | Result |
|---|---|---|---|
| A, B | address with no code | 65 junk bytes | revert `ECRecover: invalid signature 'v' value` |
| C | code that answers every call with the ERC-1271 magic value | 65 junk bytes | **success** |
| D | code that answers `0xffffffff` | 65 junk bytes | revert `FiatTokenV2: invalid signature` |
| F, F2 | plain EOA (throwaway key) | valid EIP-712 signature, `bytes` and `(v,r,s)` overloads | **success** |
| G, G2 | the same EOA with 7702 code → MetaMask `EIP7702StatelessDeleGator` | the same plain EOA signature | **success** |
| G | the same EOA with 7702 code → eth-infinitism `Simple7702Account` | same | **success** |
| G | the same EOA with 7702 code → ZeroDev Kernel v3.3 or Alchemy `SemiModularAccount7702` v1.0.0 | same | revert `FiatTokenV2: invalid signature` |

Reading:
- **Arc USDC accepts ERC-1271 contract signatures for `transferWithAuthorization`.** When `from` has code, the token asks `from.isValidSignature(...)` instead of running `ecrecover`. This matches Circle's statement that "USDC implements EIP-3009 with the EIP-7598 extension, enabling both EOAs and SCAs to authorize transfers" (`circle-llms-full.txt:53409`).
- **A 7702-delegated EOA counts as "has code".** After spike 15's delegation, the user's x402 signatures are validated by the delegate's `isValidSignature`, even through the `(v,r,s)` overload. With MetaMask's stateless DeleGator the ordinary EOA signature still passes. With Kernel v3.3 or Alchemy's 7702 account as the target, a plain EOA signature is rejected; those accounts would need their own wrapped signature format (not tested). **Keep the MetaMask target, or re-run this simulation before changing it.** [VERIFIED simulation with empty account storage; the conclusion is INFERENCE]

**Circle's x402 services** [VERIFIED docs dump of 2026-09-29]:
- Facilitator Service (on-chain `transferWithAuthorization` per payment): "accepts signatures from externally owned accounts (EOAs) and from deployed smart contract accounts through ERC-1271. Smart contract accounts that aren't deployed yet (ERC-6492) are not supported." (`circle-llms-full.txt:62038-62041`)
- Gateway Nanopayments and x402 batch settlement: "require EOA signatures and do not support ERC-1271" (l.62731); "the batched settlement path verifies EIP-3009 payment authorizations offchain using `ecrecover`" (l.64539-64541).
- Other facilitators (the open-source `coinbase/x402` reference code) were not checked: GitHub code search returned nothing for that repo [UNKNOWN].

So a passkey-owned contract account can pay x402 through the on-chain path once deployed, and cannot use Gateway Nanopayments. An EOA (PRF-derived, device-stored, or 7702-delegated to MetaMask's DeleGator) can use both [INFERENCE from the rows above; the nanopayment path for a 7702-delegated EOA rests on off-chain `ecrecover` and was not run].

---

## 5. How the three options compare on our stack

| | A. Device key in SecureStore + biometrics | B. PRF-derived EOA from a passkey | C. Passkey-owned contract account |
|---|---|---|---|
| Wallet type | EOA | EOA | contract (Kernel / Safe / HybridDeleGator) |
| Prompt | Face ID when the key is read | Face ID when the key is derived | Face ID per operation, unless a session key or delegation exists |
| Sync / new phone | none | follows the passkey in iCloud Keychain / Google Password Manager | follows the passkey |
| Web | no | yes (Safari 18+, Chrome 116+) | yes |
| OS floor | any supported | iOS 18, Android 14 (per libraries) | iOS 15 / Android 9 for passkeys |
| Needs domain + Apple team + assetlinks | no | yes | yes |
| Where the signing key lives | OS keystore, read into app memory to sign | re-derived into app memory to sign | never leaves the authenticator |
| Spike-15 limits (7702 + delegation) | fits as tested | fits as tested [INFERENCE] | different design (spike 4), second funded address |
| App Kit viem adapter | private-key factory | private-key factory | interface fits, not run |
| x402 on-chain / nanopayments | yes / yes | yes / yes | yes (deployed) / **no** |
| Bundler needed | no | no | yes, or self-bundled `handleOps` as in spike 4 |
| Main risk | lost phone = lost key without a backup | passkey or domain lost = lost key; key in memory | per-op prompts; more moving parts; nothing proven on Arc with a passkey owner |

All cells restate facts from §1–4 except the ones tagged [INFERENCE].

[Claude's opinion] For the stated goal, "Face ID-grade UX without a wallet vendor", A is shippable now and needs nothing from anyone; B is the better product once a real domain, the Apple team and an iOS 18 device exist; C buys hardware-bound signing at the price of per-operation prompts and an untested path. A sensible order is A this week with the spike-15 limits, then add a passkey as the recovery and sync layer (the hybrid in §2.6), and move to B only after a device spike.

---

## Gaps

- Nothing was built. `react-native-passkeys@0.4.2` was not compiled against Expo SDK 57 / RN 0.86.3 on iOS, Android or web in `apps/mobile`. Android has not been built for this app at all yet (spike 9).
- No passkey was created anywhere: not on a device, not in the Simulator, not in a browser. PRF in the iOS Simulator and on Android emulators is unknown.
- The minimum Android version for PRF comes from library and vendor docs (Android 14 / API 34), not from Google.
- MDN's compat data and Corbado disagree on Safari `get()` with PRF; not resolved by a test.
- Apple's capability table (is Associated Domains available to free accounts?) could not be read; the paid-account requirement rests on one maintainer's report.
- Whether sslip.io has a Let's Encrypt rate-limit exemption; whether Apple's CDN accepts an sslip.io host (no reason found why not, but not tried because the host has no valid certificate yet).
- Related Origin Requests support on iOS and Android native was not checked.
- No passkey-owned account was deployed or used on Arc. No UserOperation was sent. The P256 precompile was not re-tested today.
- ZeroDev's and Safe's passkey validators' behaviour with `usePrecompiled = false` on Arc (gas cost) is not measured.
- 4(b) is a simulation with state overrides. No real ERC-1271 wallet signed a real authorization, and no x402 payment was made from a contract account or a 7702-delegated EOA. The wrapped-signature formats of Kernel v3.3 and Alchemy's 7702 account were not tested.
- x402 facilitators other than Circle's were not checked.
- Who, if anyone, derives an EVM EOA key from PRF in production at scale remains unknown; the vendor docs were searched only through their `llms.txt` dumps.
- Firecrawl credits used: 0.
