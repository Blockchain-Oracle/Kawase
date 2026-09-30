# Synthesis — what the research says about building the Arc AI agent app

Purpose: the cross-stream conclusions that shape the product and its architecture: facts, conflicts between streams, constraints, candidate options for plan mode, risks, and open questions. It links to evidence; it does not replace it.
Sources: `01`–`09` research folders in this directory; `DECISIONS-FROM-ABU.md`; spot-checks by Claude on 2026-09-29 (LI.FI and Relay chain lists, the `eth_chainId` of `rpc.mainnet.arc.io` = 0x13b2 = 5042, `eth_getCode` of the MetaMask DelegationManager `0xdb9B…7dB3` and EntryPoint v0.7 `0x0000…a032` on both networks, and npm versions of expo, `@livekit/react-native`, ai, `@circle-fin/app-kit`, `@circle-fin/cli`, `@metamask/delegation-toolkit`, `@openai/agents`)
Verified: 2026-09-29

## 1. The ten facts that shape everything

1. **Arc mainnet is live (5042, since 2026-09-16) and already has a real ecosystem.**
   - 14+ DEXes, 13 bridges, and Morpho ($296M) and Aave V4 ($180M) lending.
   - 14+ meme launchpads.
   - 687 x402 services.
   
   "Everything Arc can do" is a large, real surface on mainnet (`01/README`, `02/README`) [VERIFIED].
2. **Testnet is thin.** It has no meme tokens and no x402 listings. Relay, Across, Chainlink feeds, and GoPlus are all absent, and swap rates are poor (100 USDC → 82 EURC). Supporting both networks (D2) means the app must **degrade gracefully per network**: a capability registry keyed by network (`02/README`) [VERIFIED; design INFERENCE].
3. **Circle already ships Arc Portal**, a consumer app with swap, send, earn, onramp, discovery, and "agent wallets with a spending cap." The differentiation is **voice, multilingual, automations, contacts, notifications, generative UI, and agentic decisions**, not the basic actions (`01/README` #1) [VERIFIED].
4. **Bankr already lists Arc** (transfers, token launches; "no aggregator swaps yet"). It is the best-documented reference for agent safety controls. It still lost money to prompt injection in May 2026 (`04/README` #1–5) [VERIFIED docs / REPORTED incidents].
5. **No verified shared keeper network was identified for Arc mainnet** (Chainlink Automation omits Arc; Gelato unknown), so automations run on **our own server scheduler** (`07/README` #1; wording narrowed after the Codex review).
6. **The hard problem is signing authority while the user is away, not scheduling.** No Circle wallet gives an agent a scoped, unattended, limited key on both networks (`03/README` #1).
   - **What is deployed on both networks:** MetaMask Delegation Framework v1.3.0 (period budgets, recipient/target pinning, expiry), ZeroDev Kernel policies, and the Safe AllowanceModule (`03/README` #4–5). Claude re-checked the DelegationManager and EntryPoint v0.7 [VERIFIED].
   - **What has not happened:** nobody has run a funded delegation redemption on Arc [UNKNOWN runtime].
7. **Passkeys can sign on Arc**, because the P256 precompile works on both networks. Circle's passkey (modular) SDK has **no React Native** version; Circle's RN SDK is user-controlled wallets (social/email/PIN) (`03/README` #3, `06/README` #7) [VERIFIED].
8. **Mobile constraints.**
   - Expo SDK 57 (verified `expo@57.0.25`) covers iOS, Android, and web; Expo has **no desktop target**.
   - Phones cannot run scheduled jobs reliably.
   - **Apple 3.1.5(i) requires an organization developer account for wallet apps** (`06/README`) [VERIFIED].
9. **Voice.**
   - **Product safety rule** (not a legal mandate): voice may never authorize a payment. Read-back, then card, then the **wallet/passkey signs the exact payload**. A local Face ID prompt alone is not a binding. Informed by NIST's ban on voice biometrics and PSD2 dynamic linking (`05/voice-safety-confirmation.md`; `REVIEW-RECONCILIATION.md` #1, #10).
   - The mobile voice SDKs are real: `@livekit/react-native@3.0.0` and `@openai/agents@0.18.0` exist on npm [VERIFIED by Claude].
   - Stack: LiveKit Agents with our backend as the single brain; see §2 and `09-voice-decision/`.
10. **Contacts are both a feature and a safety control.** Arc has no official naming service, address poisoning is the top consumer loss vector, and no crypto agent ships a real address book or the "unknown name → add contact" flow (`04/README` #7, `07/README` #6) [VERIFIED].

## 2. Where research streams disagree (to resolve in plan mode)

| Topic | Stream A | Stream B | Current reading |
|---|---|---|---|
| Voice stack | `05`: LiveKit Agents pipeline (per-language STT/TTS, our LLM) | `06`: OpenAI Realtime over WebRTC, LiveKit as plan C | **Resolved in `09-voice-decision/`** [INFERENCE, medium confidence]: LiveKit Agents (Node) with **our backend as the only brain**. Default is a pipeline (ElevenLabs Scribe/Deepgram STT → our LLM → ElevenLabs TTS). The upgrade path is OpenAI `gpt-live-1` in delegation mode inside the same LiveKit worker, only for languages that pass a day-1 test. Rejected: letting a speech-to-speech model do the reasoning ("two brains", keeperhub's main flaw). UI cards reach the phone via LiveKit RPC. Claude verified `@livekit/react-native@3.0.0` (published 2026-09-11) and `@livekit/agents@1.9.1` plus its openai, elevenlabs and deepgram plugins on npm, and found `gpt-live-1` on OpenAI's models page (`.firecrawl/product/llm/openai-models.md`). Nothing has been tested live. OpenAI publishes no language list for its voice models |
| Where limits live | `03`: build A (Circle envelope, limits = balance + app rules) now, spike B (on-chain delegations) in week 1 | `07`: delegation caveats are "deployable today" | Both agree B is **unproven with funds on Arc**. Spike first, then decide |
| Automation runtime | `06`: Vercel Workflows (no sleep limit, approval hooks), Inngest as fallback | `07`: "our own scheduler" (runtime unspecified) | Compatible. The choice goes to plan mode |
| Desktop | `06`: PWA guaranteed, Tauri stretch | — | Tauri passkey bug #7926; Electron+WebAuthn unverified |

## 3. Constraints any architecture must satisfy

- **C1. One agent brain** serves text chat, voice, Telegram, and every platform. Channels are thin clients; the tools and policy live server-side. [INFERENCE from `05` "one brain, two modalities" and `06` channels]
- **C2. The model proposes; deterministic code validates and executes.** Limits, allowlists, and recipients are typed data outside the model and outside free-text memory. (The essay, `04/README` #3, #5–6.)
- **C3. The capability registry is per network.** Each action declares mainnet/testnet availability and provider; the UI and agent never offer an unavailable action. (D2 + `02/README`.)
- **C4. Every write** is idempotent (UUIDv4 per intent), confirmed on screen and device, and logged with a reason.
- **C5. Automations execute server-side** under a pre-approved envelope (cap, recipient, expiry). Channels can deny or pause but never sign.
- **C6. Integer base units everywhere.** Arc USDC 18 vs 6 decimals is one asset. A custom formatter is needed because `Intl` rejects "USDC".
- **C7. Full i18n.** UI strings, agent replies, voice, and number/date formats all follow the user's language. RTL for Arabic/Urdu requires an app restart on native.
- **C8. An indexer is required** for incoming payments, event triggers, and history. The public RPC has no log history; the explorer API is bot-blocked.
- **C9. Reference projects are not templates** (D7). Their documented failures are:
  - never deployed
  - breadth over depth: 94 actions, 57 with no code
  - 8 architecture decisions in 11 days
  - custodial server keys
  - generative UI registry of placeholders
  - god files
  
  (`08/what-was-learned.md`, `08/keeperhub-copilot-v2-review.md`)

## 4. Candidate architecture options (inputs for plan mode, not decisions) [INFERENCE]

- **Wallet and authority:** `03/recommended-architectures.md`
  - **A.** A Circle user-controlled wallet plus a funded agent allowance wallet.
  - **B.** A passkey smart account plus ERC-7710 delegations (on-chain limits).
  - **C.** Turnkey/Privy with provider policies.
- **Client:** `06/recommended-stack.md`, `05/generative-ui.md`
  - An Expo app (iOS, Android, web) with a declarative generative UI catalog rendered natively and on web.
  - Desktop as a PWA or a Tauri shell.
- **Server:** `06/backend-jobs-and-automations.md`
  - An API that owns the agent loop, tools, policy engine, capability registry, and idempotent execution.
  - A durable workflow engine for automations.
  - An indexer or webhooks for chain events.
  - Notification fan-out (push, Telegram, Discord, email).
- **Voice:** `09-voice-decision/`
  - Recommended: LiveKit Agents (Node) with our backend as the only brain (pipeline default, `gpt-live-1` delegation as a per-language upgrade).
- **Execution providers** (all verified for Arc in `02`):
  - App Kit (Send, Bridge, Swap, Earn, Unified Balance)
  - LI.FI, Relay, Across, deBridge, and Socket quotes for route comparison
  - Morpho/Aave direct
  - the x402 Discovery API and Facilitator/Nanopayments
  - GoPlus for token risk

## 5. Biggest risks

| Risk | Why | Mitigation idea [INFERENCE] |
|---|---|---|
| **Scope**: 19 feature groups (~140 features), 50 flows, 3+ platforms, 2 networks, voice, and i18n in 12 days | arc-agent failed on breadth over depth (`08/what-was-learned.md`) | Plan mode must cut to a deep, demoable core; the inventory is the menu, not the order |
| **Unattended authority** | No proven funded delegation on Arc | Day-1 spike (grant → redeem → over-limit revert → revoke) |
| **iOS distribution** | Apple 3.1.5(i) organization requirement; TestFlight review time | Confirm the account type now; web + APK as fallbacks |
| **Voice quality and latency** | Nothing tested live | Day-1 voice spike on a real phone |
| **Hackathon fit** | Judges weight business use + agency at 60% | Abu to decide the framing (open question) |
| **Meme/token safety** | Copycats, wash volume, prompt injection | Allowlist + GoPlus + typed policy; never act on external text |
| **Unverified model names** | Some model IDs in `05/llm-choice.md` (e.g. `gpt-6-sol`, `gpt-live-1`) need independent re-check | Codex review task |

## 6. Open questions for Abu

See `DECISIONS-FROM-ABU.md` → Open questions: Apple account type, hackathon framing (consumer vs RFB 4 business), and the meme-coin token policy. Also:
- **Custody posture.** Is a custodial allowance wallet acceptable, or must the agent's authority be non-custodial and on-chain?
- **Subscription model**, or free for the hackathon?
- **Which platform is the "hero" demo** for judges: web link, Android APK, or iOS TestFlight?
