# Cross-platform options for iOS + Android + desktop + web

Purpose: compare the ways to ship one AI money agent to iOS, Android, desktop and web in a two-week hackathon, on current (Sep 2026) versions.

Sources:
- npm registry, queried 2026-09-29: `.firecrawl/product/06-platform/npm-versions-2026-09-29.tsv`
- Flutter releases JSON: https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json
- Expo SDK 57 changelog: https://expo.dev/changelog/sdk-57 · SDK 58 beta: https://expo.dev/changelog/sdk-58-beta
- React Native 0.82 blog: https://reactnative.dev/blog/2025/10/08/react-native-0.82
- Expo docs (saved as `.md` under `.firecrawl/product/06-platform/`): EAS Hosting, API routes, internal distribution, notifications, background-task, secure-store, local-authentication, camera, audio, sharing, contacts, linking; the docs index `expo-llms.txt`
- Tauri: https://v2.tauri.app/start/frontend/nextjs/ · https://v2.tauri.app/plugin/notification/ · plugins list via `gh api repos/tauri-apps/plugins-workspace/contents/plugins` · issues tauri-apps/tauri#7926, #6471, plugins-workspace#1698
- Capacitor config: https://capacitorjs.com/docs/config
- LiveKit Expo quickstart: https://docs.livekit.io/transport/sdk-platforms/expo/
- OpenAI Realtime WebRTC: https://developers.openai.com/api/docs/guides/voice-webrtc · `npm view @openai/agents-realtime exports` (saved `.firecrawl/product/06-platform/openai-agents-realtime-exports.json`) · openai/openai-agents-js#133
- Dynamic RN polyfills: https://www.dynamic.xyz/docs/react-native/reference/polyfills
- Circle docs dump `.firecrawl/docs/circle-llms-full.txt` lines 87048-87050 (Modular SDKs), 96716-96765 (React Native SDK)
- react-native-passkey README: https://github.com/f-23/react-native-passkey
- WebKit Web Push: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Verified: 2026-09-29

Note from Abu (via coordinator): arc-agent's Next.js monorepo and Postgres worker are *not* a baseline. Everything below is evaluated fresh.

## 1. Current versions (npm, 2026-09-29) [VERIFIED]

| Package | Version | Note |
|---|---|---|
| `expo` | 57.0.25 | SDK 57, released 2026-06-30, ships React Native 0.86 (changelog). SDK 58 is in beta since 2026-09-15 on RN 0.88 RC; "three to four weeks" of beta, so stable likely lands during or after the hackathon [INFERENCE] |
| `react-native` | 0.87.1 | latest on npm; not the version Expo 57 pins (0.86.x) |
| `expo-router` | 57.0.23 | |
| `react-native-web` | 0.21.3 | |
| `eas-cli` | 24.8.0 | |
| `@livekit/react-native` / `@livekit/react-native-webrtc` | 3.0.0 / 144.2.0 | |
| `react-native-webrtc` | 124.0.8 | |
| `@openai/agents-realtime` | 0.18.0 | `exports` contains a `react-native` condition (`./dist/shims/shims-react-native.mjs`) |
| `react-native-passkey` | 3.6.2 | also `react-native-passkeys` 0.4.2, `expo-passkey` 0.3.15 |
| `@circle-fin/w3s-pw-react-native-sdk` | 2.2.4 | Circle user-controlled wallets RN SDK |
| `@circle-fin/modular-wallets-core` | 1.0.16 | web/JS SDK |
| `viem` | 2.56.9 | |
| `@tauri-apps/cli` | 2.12.0 | |
| `@capacitor/core` | 8.5.2 | `@capacitor/push-notifications` 8.1.2 |
| `electron` | 44.4.5 | `electron-builder` 26.15.3 |
| `react-native-macos` | 0.81.9 | lags RN (0.87) by six minors |
| `react-native-windows` | 0.84.0 | lags RN by three minors |
| `tamagui` | 2.7.7 | |
| `solito` | 5.0.0 | last publish 2025-10-21 (11 months old) |
| Flutter (stable) | 3.47.5 | from Flutter's releases JSON |

## 2. Platform facts that decide the comparison

- **React Native is New-Architecture-only since 0.82.** "React Native 0.82 is the first React Native that runs entirely on the New Architecture" (RN blog). Any RN library you pick must support it. [VERIFIED]
- **Expo has no official macOS/Windows target.** The Expo docs index (`expo-llms.txt`) has no desktop, Electron or macOS-app pages (only cache-clearing guides). Desktop from Expo therefore means (a) wrapping the Expo **web** export in Tauri/Electron, or (b) out-of-tree `react-native-macos`/`-windows`. [VERIFIED absence in index]
- **Expo web + server.** Expo Router API routes (`+api.ts`) need `"web": {"output": "server"}` and a WinterCG host; EAS Hosting deploys them with `eas deploy` and runs "within the Cloudflare Workers runtime" (expo-eas-hosting.md, Expo skills text). [VERIFIED]
- **Tauri needs a static frontend.** "Use static exports by setting `output: 'export'`. Tauri doesn't support server-based solutions." (Tauri Next.js guide). [VERIFIED]
- **Tauri has no official remote-push plugin.** Official plugins: autostart, barcode-scanner, biometric, clipboard-manager, deep-link, dialog, fs, geolocation, global-shortcut, haptics, http, localhost, log, nfc, notification, opener, os, … store, stronghold, updater, upload, websocket, window-state. No push plugin. The notification plugin docs only show local notifications. The push-registration request (plugins-workspace#1698) was closed as a duplicate on 2025-11-23. [VERIFIED]
- **Passkeys in Tauri webviews are an open bug**: tauri#7926 "[bug] Allow Passkeys auth support in WebView" (open, updated 2026-04-07) and tauri#6471 (webauthn on macOS, open). [VERIFIED]
- **Capacitor must bundle the web build.** `webDir` "should contain the final `index.html`"; `server.url` is "intended for use with live-reload servers. This is not intended for use in production." So a Next.js app needs a static export (no SSR, no route handlers) inside Capacitor. [VERIFIED]
- **iOS PWA push** works only for "A web app that has been added to the Home Screen" (iOS/iPadOS 16.4+), and permission must follow a user tap (WebKit). [VERIFIED]

## 3. Comparison

Legend: ✅ first-class, ⚠️ works with effort or caveats, ❌ not practical. Tags apply to the row's evidence; cells without a source are [INFERENCE].

| Criterion | **Expo (RN) + web via RN-web** | Expo + desktop shell (Tauri/Electron around Expo web) | Expo + react-native-macos/windows | Tauri 2 (mobile + desktop) | Capacitor around a web app | Flutter | PWA only | Solito/Tamagui + Next.js monorepo |
|---|---|---|---|---|---|---|---|---|
| iOS + Android | ✅ | ✅ (the Expo part) | ✅ | ⚠️ webview app, push missing | ✅ webview app | ✅ | ⚠️ install to home screen; no stores | ✅ (Expo side) |
| Desktop | ❌ none official [VERIFIED] | ✅ static web build in a shell | ⚠️ versions lag RN (0.81 / 0.84 vs 0.87) [VERIFIED]; Expo modules untested there [UNKNOWN] | ✅ strongest desktop story | ⚠️ Electron community platform [UNKNOWN, not checked] | ✅ (macOS/Windows/Linux) | ✅ installable in Chrome/Edge | ⚠️ web app only |
| Web (judge link) | ✅ `expo export -p web` + EAS Hosting or any static host [VERIFIED] | ✅ same build | ✅ | ⚠️ separate web deploy of the same SPA | ✅ the web app itself | ⚠️ Flutter web (canvas; weaker SEO/a11y) [INFERENCE] | ✅ | ✅ Next.js |
| Code sharing | one codebase, three targets | ~100% UI shared; shell adds Rust or Node glue | high, but separate native projects | one web codebase | one web codebase | one Dart codebase, zero reuse of TS libs | one | shared screens via Solito; two routers to keep in sync |
| Native feel | native views, gestures, haptics | web feel on desktop | native | web feel | web feel | own renderer, close to native | web | native on mobile |
| Voice / WebRTC | ✅ LiveKit Expo SDK (dev build, not Expo Go) [VERIFIED]; OpenAI Realtime via `react-native-webrtc` + `@openai/agents-realtime` RN shim [VERIFIED exports] | ✅ browser WebRTC in the shell webview [INFERENCE] | ⚠️ `react-native-webrtc` on macOS/Windows [UNKNOWN] | ✅ webview WebRTC (mic permission prompts per OS) [INFERENCE] | ✅ webview WebRTC | ✅ LiveKit Flutter SDK exists [REPORTED, not checked] | ✅ | ✅ |
| viem / crypto libs | ⚠️ polyfills: Expo SDK 54+ needs only `@react-native-anywhere/polyfill-base64` per Dynamic's docs [REPORTED]; `react-native-quick-crypto` 1.1.7 if hashing is slow | ✅ browser | ⚠️ | ✅ browser | ✅ browser | ❌ no viem; Dart libs (web3dart etc.) [INFERENCE] | ✅ | ⚠️ RN side needs polyfills |
| Circle wallet SDKs | ✅ user-controlled RN SDK "for your Expo or React Native project" [VERIFIED]; **no RN Modular (passkey) SDK**: Modular SDKs are Android, iOS, Web only [VERIFIED] | ✅ Web SDKs | ⚠️ | ✅ Web SDKs, but passkeys broken in webview [VERIFIED issue] | ✅ Web SDKs; passkeys in WKWebView [UNKNOWN] | ⚠️ no Flutter SDK listed [VERIFIED absence in Circle SDK list] | ✅ Web SDKs | mixed |
| Passkeys | ✅ `react-native-passkey`: iOS 15+, Android API 28+, needs Associated Domains + `assetlinks.json` [VERIFIED README] | ❌/⚠️ in Tauri [VERIFIED issue]; Electron [UNKNOWN] | [UNKNOWN] | ❌ open bug | [UNKNOWN] | ⚠️ plugins exist [UNKNOWN] | ✅ browser WebAuthn | ✅ on web |
| Secure storage | ✅ `expo-secure-store` (Keychain / Keystore) [VERIFIED] | ⚠️ web storage; Tauri `stronghold`/`store` plugins [VERIFIED list] | ✅ | ⚠️ stronghold | ⚠️ plugin | ✅ | ❌ browser only | ✅ mobile |
| Remote push | ✅ `expo-notifications` + Expo push service → APNs/FCM [VERIFIED] | ⚠️ desktop OS notifications only while running [INFERENCE] | ⚠️ | ❌ no official plugin [VERIFIED] | ✅ `@capacitor/push-notifications` 8.1.2 [VERIFIED npm] | ✅ via FCM plugin [INFERENCE] | ⚠️ iOS only after home-screen install [VERIFIED] | ✅ |
| Background tasks | ⚠️ `expo-background-task`, min 15 min, system decides [VERIFIED] | n/a | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ |
| Build/release speed | ✅ EAS Build cloud (no Mac needed for iOS), EAS Submit, EAS Update OTA [VERIFIED] | + desktop signing work | slow: separate native toolchains | needs Xcode/Android Studio locally [INFERENCE] | needs Xcode/Android Studio | Flutter toolchain; no EAS equivalent used by Abu | ✅ instant | slower: two apps' build configs |
| Fit with Abu's TS skills | ✅ TypeScript, React 19 | ✅ | ⚠️ | ⚠️ Rust for native glue | ✅ | ❌ Dart | ✅ | ✅ |

## 4. Notes per option

**Expo (SDK 57) with expo-router and react-native-web.** One TypeScript codebase for iOS, Android and web. EAS Build builds iOS in the cloud; "EAS Submit works on macOS, Linux, and Windows, so you don't need a Mac to ship iOS builds" (expo-submit-ios.md) [VERIFIED]. Native modules (WebRTC, passkeys, push on Android) need a **development build**, not Expo Go: LiveKit is "not compatible with the Expo Go app"; remote push "is unavailable in Expo Go on Android from SDK 53"; FaceID is not supported in Expo Go [VERIFIED]. Pin SDK 57 during the hackathon. SDK 58 changes iOS lifecycle (SceneDelegate) and router internals (changelog), which is upgrade risk you don't need [INFERENCE].

**Expo + desktop shell.** Export Expo web as a static SPA and load it in Tauri 2 (small binaries) or Electron. This is the cheapest real desktop app. Limits: no SSR or API routes inside the shell, so the backend must be a separate URL [VERIFIED for Tauri]; passkeys are broken in Tauri webviews [VERIFIED issue]. If the app signs in with passkeys, use Electron or open the system browser for auth [INFERENCE].

**react-native-macos / react-native-windows.** These are native, but they trail React Native (0.81.9 / 0.84.0 vs 0.87.1) [VERIFIED] and aren't part of Expo's toolchain. Too slow for two weeks [INFERENCE].

**Tauri 2 everywhere.** It covers desktop and mobile from one web frontend, but has no official remote-push plugin and the passkey bug. For a notifications-heavy product, missing push is disqualifying on mobile [INFERENCE from VERIFIED facts].

**Capacitor.** Wraps any web app and has an official push plugin. A Next.js app has to be statically exported. It's a webview UX. Apple guideline 4.2 ("Minimum Functionality") is a known risk for thin web wrappers [INFERENCE; 4.2 text not quoted here].

**Flutter 3.47.5.** Strong mobile and desktop, but it's Dart, and there's no viem and no Circle Flutter SDK in Circle's SDK list [VERIFIED absence]. Two weeks isn't enough to switch languages [INFERENCE].

**PWA.** Fastest to ship and the best judge link. On iOS, push requires "Add to Home Screen". There's no store presence and no Keychain. Good as the web and desktop fallback, but it doesn't meet "iOS + Android app for sure" [INFERENCE].

**Solito + Tamagui + Next.js.** This buys a Next.js web app next to Expo, but it means two routers and two build systems. Solito's last npm publish was 2025-10-21 [VERIFIED]. Expo Router already renders web, so the extra layer earns little in two weeks [INFERENCE].

## 5. Gaps

- Electron + WebAuthn/passkeys on macOS/Windows: not checked.
- Whether `@circle-fin/modular-wallets-core` runs inside React Native with `react-native-passkey` as the WebAuthn provider: [UNKNOWN] (Circle lists only Android/iOS/Web SDKs).
- Whether the iOS app can run on Apple-silicon Macs through TestFlight/App Store as a zero-effort "desktop" build: not verified.
