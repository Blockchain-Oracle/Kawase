# 06: Mobile, desktop and web platform

Purpose: the index and key findings for how to ship the Arc AI money agent to iOS + Android (required), desktop and web within the hackathon (Sep 27–Oct 10, 2026), plus the backend and notification channels that make automations work.

Sources: the six files in this folder, each with its own primary sources and tags. Raw evidence is in `.firecrawl/product/06-platform/` (npm versions TSV, Apple guidelines/TestFlight text, Google Play policy text, Expo docs `.md`, Telegram and Discord API docs, `@openai/agents-realtime` exports).
Verified: 2026-09-29

## Files

| File | What's in it |
|---|---|
| `cross-platform-options.md` | Expo, Expo + Tauri/Electron, RN macOS/Windows, Tauri 2 mobile, Capacitor, Flutter, PWA, Solito/Tamagui: current versions and a capability matrix (voice, viem, passkeys, push, storage, background, release speed) |
| `distribution-and-store-policy.md` | What judges can install (web, APK, TestFlight, Play internal, DMG/EXE), timelines, and exact Apple 3.1.1 / 3.1.5 / 5.1.1(ix) and Google Play blockchain policy quotes |
| `mobile-capabilities.md` | Push, background limits (why automations are server-side), WebRTC voice, biometrics, secure storage, passkeys, deep links, QR, contacts, haptics, share |
| `backend-jobs-and-automations.md` | Vercel Workflows, Cron, Queues, Inngest, Trigger.dev, Temporal, Postgres queues; an automation run shape; Circle webhook subscription and verification |
| `notification-channels.md` | Telegram (deep-link linking, inline approvals, two-way chat, voice notes, streaming drafts), Discord (webhook vs bot DM, OAuth2), Resend, WhatsApp, SMS, Web Push |
| `recommended-stack.md` | The pick [INFERENCE], a day plan, risks and open questions |

## Key findings

1. **Expo SDK 57 (expo 57.0.25, RN 0.86) is the practical way to get iOS + Android + web from one TypeScript codebase.** SDK 58 is still beta (RN 0.88 RC, iOS scene-lifecycle change), so pin 57. [VERIFIED]
2. **Expo has no desktop target.** Desktop means the web export in Tauri/Electron or an installable PWA. `react-native-macos` 0.81.9 and `-windows` 0.84.0 trail RN 0.87.1. [VERIFIED]
3. **Tauri 2 has no official remote-push plugin, and passkeys in its webview are an open bug (#7926).** That rules it out for mobile; it's fine as a desktop shell without passkey login. [VERIFIED]
4. **Automations must run on the server.** `expo-background-task` has a 15-minute minimum and runs when "the system decides so"; iOS often defers to overnight windows. [VERIFIED]
5. **Durable workflows fit "every Tuesday send $10".** Vercel Workflows has no sleep or run-duration limit, hooks for approvals, and 50k events/month on Hobby. Inngest (50k executions free) is the host-agnostic fallback. Vercel Cron on Hobby is once per day, ±59 min. [VERIFIED]
6. **Voice on mobile is doable but new.** OpenAI recommends WebRTC for mobile clients. `@openai/agents-realtime` 0.18.0 ships a `react-native` export. LiveKit's Expo SDK is documented but needs a dev build. [VERIFIED] Spike it on day 1. [INFERENCE]
7. **Circle's passkey (Modular) wallet SDKs are Android/iOS/Web only, not React Native.** Circle's RN SDK (user-controlled, Expo-supported since V2) uses social/email-OTP/PIN. [VERIFIED]
8. **Apple 3.1.5(i): "Apps may facilitate virtual currency storage, provided they are offered by developers enrolled as an organization."** TestFlight external builds must comply too (2.2). Abu's account type is the biggest iOS risk. [VERIFIED quote; risk INFERENCE]
9. **Judge reach:** web link, then Android APK via EAS internal link (anyone with the URL), then TestFlight public link after Beta App Review. Play production is out: new personal accounts need a 12-tester, 14-day closed test. [VERIFIED]
10. **Telegram is the best extra channel.** Linking is one tap (`t.me/<bot>?start=<≤64-char token>`), inline approve/deny buttons (`callback_data` 1–64 bytes), and two-way chat including voice notes and streaming drafts (`sendMessageDraft`). [VERIFIED]
11. **WhatsApp and SMS don't fit two weeks.** WhatsApp needs templates outside the 24-hour window; US SMS needs A2P 10DLC registration. [VERIFIED]

## Gaps
- Electron + WebAuthn behaviour; Circle Modular SDK inside RN; Arc coverage of Circle Wallets webhooks; Discord bot DM to user-installed users without a shared server; Google Play country-specific crypto article; Resend/Twilio endpoints not re-fetched today (tagged [REPORTED]).
