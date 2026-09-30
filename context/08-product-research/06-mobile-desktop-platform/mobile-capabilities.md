# Mobile essentials for the Arc money agent

Purpose: for each device capability the product needs, the current library, the constraint that matters, and the Expo-specific gotcha.

Sources:
- Expo docs saved as Markdown in `.firecrawl/product/06-platform/`: `expo-notifications.md`, `expo-push-setup.md`, `expo-push-send.md`, `expo-background-task.md`, `expo-securestore.md`, `expo-local-authentication.md`, `expo-camera.md`, `expo-audio.md`, `expo-sharing.md`, `expo-contacts.md`, `expo-linking.md` (from https://docs.expo.dev/…/*.md)
- npm versions: `.firecrawl/product/06-platform/npm-versions-2026-09-29.tsv`
- LiveKit Expo: https://docs.livekit.io/transport/sdk-platforms/expo/
- OpenAI Realtime WebRTC: https://developers.openai.com/api/docs/guides/voice-webrtc
- `@openai/agents-realtime` exports: `.firecrawl/product/06-platform/openai-agents-realtime-exports.json`; issue https://github.com/openai/openai-agents-js/issues/133
- react-native-passkey README: https://github.com/f-23/react-native-passkey
- Circle docs dump `.firecrawl/docs/circle-llms-full.txt:96716-96765`, `:87048-87050`
- Telegram deep links: https://core.telegram.org/bots/features (`tg-features.txt`)

Verified: 2026-09-29

All `expo-*` packages below are at 57.0.x on npm (2026-09-29) [VERIFIED].

## Push notifications
- **Library:** `expo-notifications` 57.0.21. Expo's push service abstracts FCM and APNs: "This allows you to treat Android and iOS notifications in the same way" [VERIFIED].
- **Send:** `POST https://exp.host/--/api/v2/push/send`, a single message or "an array of up to 100 message objects" [VERIFIED].
- **Receipts:** check them to detect `DeviceNotRegistered`. Expo recommends "checking push receipts 15 minutes after sending"; "push receipts are cleared after 24 hours" [VERIFIED].
- **Gotchas:** remote push "is unavailable in Expo Go on Android from SDK 53. A development build is required" [VERIFIED]. Testing works on physical devices, an Android Emulator with Play services, or an iOS Simulator with Xcode 14+ on macOS 13+/iOS 16+ [VERIFIED]. EAS prompts to set up APNs/FCM credentials on the first dev build [VERIFIED].
- `getDevicePushTokenAsync` returns a native FCM/APNs token or a web `PushSubscription`, so the backend could skip Expo's relay [VERIFIED].
- **Product use [INFERENCE]:** "Automation ran: sent $10 to Alex", "Incoming 25 USDC", "Approval needed: bridge above your limit". Actionable notifications (Approve/Deny) deep-link into a confirm screen. Never approve money movement from the notification alone.

## Background execution: why automations must run server-side
- `expo-background-task` 57.0.20 uses Android WorkManager and iOS BGTaskScheduler. "The task may not run immediately after it is scheduled, but it will run at some point in the future if the system decides so." [VERIFIED]
- Minimum interval is 15 minutes, the default is 12 hours, and "Tasks won't run exactly on schedule. On iOS, short intervals are often ignored—the system typically runs background tasks during specific windows, such as overnight." [VERIFIED]
- On iOS, "the system can interrupt the process at any time." [VERIFIED]
- **Conclusion [INFERENCE from VERIFIED limits]:** "every Tuesday send $10" can't depend on the phone. The phone may be off, the app force-quit, or iOS may defer the task by hours. Schedules, triggers (price, balance, inbound tx) and execution must live on the server, with a wallet the server can sign for under a policy (developer-controlled wallet or agent wallet with limits; see `context/02-circle-agent-stack/agent-wallets.md` table). The phone only creates, edits and approves automations and receives push. See `backend-jobs-and-automations.md`.

## Voice / WebRTC
| Option | Status | Notes |
|---|---|---|
| **OpenAI Realtime over WebRTC, direct** | ✅ | The client gets an ephemeral secret from your server (`POST https://api.openai.com/v1/realtime/client_secrets`) and posts SDP to `https://api.openai.com/v1/realtime/calls`. OpenAI: "When connecting to a Realtime model from the client (like a web browser or mobile device), we recommend using WebRTC rather than WebSockets". Current model in examples: `gpt-realtime-2.1` [VERIFIED]. In RN, WebRTC primitives come from `react-native-webrtc` 124.0.8 (+ `@config-plugins/react-native-webrtc` for Expo, per LiveKit's install list) [VERIFIED]. |
| **`@openai/agents-realtime` (Agents SDK) in RN** | ⚠️ new | 0.18.0 ships a `react-native` export condition → `dist/shims/shims-react-native` [VERIFIED npm]. Issue #133 "The Realtime SDK does not work with React Native" was closed 2026-08-07 with no linked commit [VERIFIED]. Whether the RN path is officially documented and stable: [UNKNOWN]. Spike it on day 1. |
| **LiveKit RN SDK** | ✅ | `@livekit/react-native` 3.0.0 + `@livekit/react-native-expo-plugin` + `@livekit/react-native-webrtc` + `@config-plugins/react-native-webrtc` + `livekit-client`. "Not compatible with the Expo Go app"; call `registerGlobals()` [VERIFIED]. It adds a LiveKit server/cloud and an agent worker, but gives turn detection and multi-provider STT/TTS [INFERENCE]. |
| **`expo-audio`** | ✅ for playback/recording | Android/iOS/web/Expo Go. `enableBackgroundRecording` adds an Android foreground service and the iOS `audio` background mode [VERIFIED]. A fallback for push-to-talk (record → upload → STT) and for playing TTS, not for full-duplex conversation [INFERENCE]. |

Voice gotchas [INFERENCE]: on iOS, set the audio session to play-and-record with speaker output, or the voice comes out of the earpiece. Echo cancellation comes from WebRTC. Voice should *propose* money actions and confirm them visually (card + biometric), never execute on speech alone.

## Biometrics
- `expo-local-authentication` 57.0.3: Android Biometric Prompt, iOS Face ID/Touch ID. "FaceID authentication for iOS is not supported in Expo Go"; set `faceIDPermission` [VERIFIED].
- Use it as the confirm step for sends above a threshold and to unlock the app. Biometrics gate the *client*. The limit itself must be enforced server-side or on-chain (the hackathon FAQ: "put the limit somewhere the agent cannot reach", `context/00-hackathon/judging-and-submission.md`) [INFERENCE].

## Secure storage
- `expo-secure-store` 57.0.4. iOS Keychain (`kSecClassGenericPassword`), Android Keystore-backed [VERIFIED].
- Caveats: iOS values "will persist across app uninstallations" when reinstalled with the same bundle ID. `requireAuthentication` data "will become inaccessible if there are changes to the user's biometric settings". Some iOS versions reject values above "roughly 2048 bytes". Not in Expo Go when biometrics are available [VERIFIED].
- Store session tokens / refresh tokens here, never private keys you don't need [INFERENCE].

## Passkeys
- `react-native-passkey` 3.6.2: "Native Passkeys on iOS 15.0+ and Android API 28+". Requires an iOS Associated Domain (`webcredentials:`) and Android Digital Asset Links at `https://<yourdomain>/.well-known/assetlinks.json` with the signing cert SHA-256 [VERIFIED README]. Alternatives: `react-native-passkeys` 0.4.2, `expo-passkey` 0.3.15 [VERIFIED npm].
- Circle's passkey wallets are Modular Wallets, whose SDKs are **Android, iOS, Web only**. There's no React Native Modular SDK [VERIFIED docs list]. Circle's RN SDK is for **user-controlled** wallets, with "social login (Google, Facebook, Apple), email OTP, and PIN with security questions" and "Expo support … introduced in V2" [VERIFIED].
- **Gotchas [INFERENCE]:** passkeys need a real domain, and the Android `assetlinks.json` must include the EAS-managed signing key fingerprint (and the Play App Signing key if you use Play). Budget half a day. Passkeys for *login* (e.g., via your own WebAuthn server) are separate from passkeys as *wallet signers*.

## Deep links (Telegram connect flow, notifications)
- Expo supports custom schemes, iOS Universal Links and Android App Links (expo-linking.md) [VERIFIED].
- **Telegram connect:** the app opens `https://t.me/<bot>?start=<token>`. The bot receives `/start <token>`. The parameter allows "A-Z, a-z, 0-9, _ and -", "can be up to 64 characters long", and base64url is recommended [VERIFIED]. The bot's reply carries a button back to `https://<yourdomain>/settings/notifications?linked=telegram` (Universal Link) or `yourapp://…` [INFERENCE]. Details in `notification-channels.md`.

## QR scanning (address capture)
- `expo-camera` 57.0.5: `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}` and `onBarcodeScanned`. There's also a system `launchScanner` UI [VERIFIED].
- Parse `ethereum:` (EIP-681) URIs and bare `0x` addresses. Show a checksummed address and ask for a contact name before saving [INFERENCE].

## Contacts import (privacy)
- `expo-contacts` 57.0.6. Needs `NSContactsUsageDescription`. Supports iOS limited access (`accessPrivileges: 'all' | 'limited' | 'none'`), `ContactAccessButton` (iOS 18+), and `presentContactPickerAsync()` [VERIFIED].
- **Recommendation [INFERENCE]:** don't bulk-import the address book. A phone contact has no wallet address, and uploading contacts to a server raises privacy review questions. Use the **picker** to prefill a name/phone/email when the user adds an Arc contact ("send to Alex" → "I don't have Alex's address" → sheet with picker + QR + paste). Keep the Arc address book server-side so the agent can resolve names across devices and in Telegram.

## Haptics
- `expo-haptics` 57.0.3 [VERIFIED npm]. Use success/warning/error haptics on confirm, send-complete and rejection [INFERENCE].

## Share sheet
- `expo-sharing` 57.0.22: Android/iOS/web. On web it relies on the Web Share API with "very limited browser support", so check `Sharing.isAvailableAsync()` [VERIFIED]. For text/links (a receipt URL, "pay me" link), RN's built-in `Share` API is enough [INFERENCE].

## Gaps
- App Store review stance on WebRTC voice agents: nothing specific found.
- Whether Expo push (exp.host) is acceptable for money alerts versus direct APNs/FCM: a trust choice, not researched.
