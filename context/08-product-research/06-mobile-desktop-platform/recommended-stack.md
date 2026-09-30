> **Partly superseded (2026-09-29):** the voice row is superseded by `../09-voice-decision/README.md` and the wallet row by `../03-wallets-custody-limits/recommended-architectures.md` (Codex review; `../REVIEW-RECONCILIATION.md` #16).

# Recommended stack (mobile + desktop + web), feasibility and risks

Purpose: one opinionated stack for shipping the Arc money agent to iOS, Android, web and desktop by Oct 10, 2026, with a day plan and the risks. Everything here is **[INFERENCE]** built on the [VERIFIED] facts in the sibling files.

Sources: `cross-platform-options.md`, `distribution-and-store-policy.md`, `mobile-capabilities.md`, `backend-jobs-and-automations.md`, `notification-channels.md` (each with its own primary sources); `context/00-hackathon/judging-and-submission.md`; coordinator note that arc-agent's Next.js monorepo + Postgres worker "failed and used the wrong architecture" and must not be the anchor.
Verified: 2026-09-29

## The stack [INFERENCE]

| Layer | Pick | Why (evidence) |
|---|---|---|
| App (iOS, Android, web) | **Expo SDK 57 + expo-router + react-native-web**, TypeScript, pinned (no SDK 58 upgrade mid-hackathon) | One codebase covers all three mandatory surfaces. EAS builds iOS without a Mac. SDK 58 is beta with iOS lifecycle + router changes |
| Dev loop | EAS **development build** from day 1, not Expo Go | WebRTC, FaceID and Android push don't work in Expo Go [VERIFIED] |
| Web / judge link | `expo export -p web` → static host (EAS Hosting free, or Vercel/Cloudflare) | Judges click a link. EAS Hosting free: 100k req/month [VERIFIED] |
| Desktop | **Guaranteed:** the same web app as an installable PWA. **Stretch:** Tauri 2 shell around the static web export (DMG/MSI, ad-hoc/unsigned with README instructions) | Expo has no desktop target [VERIFIED]; RN macOS/Windows lag [VERIFIED]. Tauri passkey bug #7926 open [VERIFIED], so desktop auth must not rely on passkeys |
| Backend API | Standalone **TypeScript HTTP service (Hono)** on Vercel Functions, separate from the app | Keeps the agent, wallets, secrets and webhooks off-device. Hono is a documented Workflow SDK target [VERIFIED] |
| Automations / approvals | **Vercel Workflows (Workflow SDK)**: one durable run per automation, `sleep` until next occurrence, approval via hooks. Fallback: **Inngest** | "Maximum `sleep` duration: No limit", hooks for external events, Hobby 50k events/month [VERIFIED]. Inngest free 50k executions [VERIFIED] |
| Database | Managed Postgres (e.g., Neon/Supabase), plain tables for users, contacts, automations, conversations, channels, delivery log | Workflow state lives in the Workflow engine, so the DB isn't a job queue (avoids the arc-agent worker design) |
| Voice | **OpenAI Realtime over WebRTC** from the app (`react-native-webrtc` + ephemeral key from backend). Spike `@openai/agents-realtime` RN shim on day 1; if it fails, use raw WebRTC. LiveKit as plan C | OpenAI recommends WebRTC for mobile clients [VERIFIED]; RN export condition exists [VERIFIED]; LiveKit Expo SDK documented [VERIFIED] |
| Wallet / signing | Server-side signer with enforced limits for automations (Circle developer-controlled wallets or Circle Agent Wallet per `context/02-circle-agent-stack/agent-wallets.md`). User approvals in-app with biometrics. **Not** passkey Modular Wallets on mobile | Automations can't need the phone [VERIFIED OS limits]; no RN Modular SDK [VERIFIED] |
| Crypto libs | `viem` 2.56.9 on the backend. In-app, only what's needed (formatting, address checksum) with the base64 polyfill if required | Keeps RN polyfill surface minimal |
| Push | `expo-notifications` + Expo push API (`exp.host/--/api/v2/push/send`) + receipt check | [VERIFIED] |
| Channels | Telegram bot (deep-link linking, inline approve buttons, two-way chat) via `grammy` or Chat SDK Telegram adapter; Resend email; Discord incoming-webhook OAuth as stretch | See `notification-channels.md` |
| Device features | expo-secure-store (session), expo-local-authentication (confirm), expo-camera (QR), expo-contacts picker (no bulk import), expo-haptics, RN Share, Universal/App Links | [VERIFIED] per file |
| i18n | `expo-localization` + an i18n lib, agent replies in the user's language | not researched here |

## What *not* to do [INFERENCE]
- Don't run automations on-device (`expo-background-task` is ≥15 min and deferred [VERIFIED]).
- Don't build separate native desktop apps (react-native-macos/windows) or add Solito/Next.js next to Expo.
- Don't make passkeys the only login. They break in Tauri [VERIFIED issue], need domain association on mobile, and Circle's passkey wallet has no RN SDK.
- Don't put swap/trade/meme-coin/token-launch flows in the iOS TestFlight build until the Apple account and 3.1.5 questions are settled (`distribution-and-store-policy.md`).

## Two-week feasibility (today = Sep 29, 12 days left) [INFERENCE]

| Days | Deliverable | Confidence |
|---|---|---|
| Sep 29–30 | Expo app skeleton (tabs: Chat, Activity, Automations, Contacts, Settings), dev build on iOS + Android, web export deployed. Hono API on Vercel. Auth. Voice spike (OpenAI Realtime WebRTC in RN) | High for skeleton; **medium** for voice spike |
| Oct 1–3 | Agent chat + generative cards (transfer, bridge, swap quote), contacts ("send to Alex" → add-address sheet with QR/paste/picker), push. **First TestFlight external build submitted** + Android APK link | Medium |
| Oct 4–6 | Automations on Workflow SDK (create/pause/edit, approval hook, idempotent execution), Circle webhooks → notifications, Telegram linking + notifications + approve buttons | Medium |
| Oct 7–8 | Telegram two-way chat, multilingual, polish, desktop PWA; Tauri shell if time | Medium-low for Tauri |
| Oct 9–10 | Freeze native builds, EAS Update for JS fixes, video, README with install links, submit early | High |

Overall: iOS + Android + web are **feasible** with Expo if the team avoids desktop-native work and keeps the backend small. The two gating uncertainties are Apple review (account type) and voice in RN.

## Risks and mitigations [INFERENCE]

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Apple rejects external TestFlight: 3.1.5(i) requires an **organization** developer for wallets; 5.1.1(ix) prefers a legal entity for financial apps [VERIFIED quotes] | Medium-high if Abu's account is individual | No public iOS link | Ask Abu today which account type he has. Submit by ~Oct 3 with demo account and notes. Conservative iOS feature flags. Fallback: web link + demo video on iOS |
| Voice in RN unstable (agents-realtime RN shim is new; issue closed without linked commit [VERIFIED]) | Medium | Weak demo of a headline feature | Raw WebRTC to `/v1/realtime/calls`; worst case push-to-talk with expo-audio + STT/TTS; voice works on web regardless |
| EAS free build quota (15 iOS/15 Android per month) and low-priority queue [VERIFIED] | Medium | Slow iteration | EAS Update for JS; batch native changes; Starter plan if needed |
| Passkey/domain association misconfig | Medium | Login broken on one platform | Don't depend on passkeys for v1 login |
| Android judges in BR/ID/SG/TH hit developer-verification friction from Sep 30 [VERIFIED] | Low | APK install friction | Web link first; Play internal testing if judges' emails are known |
| Workflow replay semantics (side effects outside steps, 240 s replay cap) [VERIFIED limits] | Medium | Double-send bug | Idempotency key per occurrence; all I/O in steps; test with forced retries |
| Circle webhook coverage for Arc events not confirmed [UNKNOWN] | Medium | Missing "incoming funds" alerts | Poll Arc RPC for balances as fallback trigger |
| Desktop unsigned builds scare judges (Gatekeeper/SmartScreen) [VERIFIED] | High if shipped | Looks broken | Present desktop as PWA install; offer DMG only as extra |
| Store policy on swaps/meme coins (3.1.5(iii)/(iv); Google "certified services in regulated jurisdictions") [VERIFIED quotes] | Medium | Rejection | Region/feature flags; keep those actions web-first |

## Open questions for Abu
1. Apple Developer account: individual or organization (with D-U-N-S)? Google Play account: personal or organization, and created when?
2. Is iOS a *demo* requirement (judges installing) or a *product* requirement (video shows it)? That decides how hard to push TestFlight.
3. Custody model for automations: a backend-signed wallet with limits (enables "every Tuesday") vs. user-signed only (breaks unattended automations).
