# Feature inventory — everything the product should have

Purpose: the complete product surface for the Arc AI agent app. It covers what Abu asked for, plus everything good UX implies, with feasibility on each network and a pointer to the evidence. This is the checklist plan mode builds from. It is **not** a scope decision; prioritization happens in planning.
Sources: `DECISIONS-FROM-ABU.md`; research folders `01`–`09` in this directory (each row cites one); `04-analogs-and-competitors/master-feature-inventory.md`; `07-automations-contacts-safety/*`; `08-arc-agent-baseline-and-fit/gap-vs-new-vision.md`
Verified: 2026-09-29

**Legend**
- **Origin:** **A** = Abu asked for it · **R** = research found analogs or needs · **S** = safety requirement from research/essay.
- **Main / Test:** feasible on Arc mainnet / testnet (✅ verified · ⚠️ partial or unproven · ❌ not available · — n/a). Tags follow `RESEARCH-RULES.md`; anything unmarked in the Notes column is [INFERENCE].

---

## A. Onboarding, account, wallet

| # | Feature | Origin | Main | Test | Notes / evidence |
|---|---|---|---|---|---|
| A1 | Sign up / sign in (passkey, email OTP, social) | A (wallets) | ✅ | ✅ | Circle UCW has an RN SDK (social/email/PIN). The Circle passkey (modular) SDK is **not** RN (`06/…README` #7). Passkeys verify on Arc via the P256 precompile (`03/README` #3) |
| A2 | Wallet created automatically; user never handles a seed | R | ✅ | ✅ | Architecture A/B/C in `03/recommended-architectures.md` |
| A3 | **Mainnet ↔ testnet toggle "like dark mode"** (D15): a network pill in the top bar that is itself the toggle; one tap, instant both ways (both networks cached); ≥2 redundant indicators (a coloured testnet bar + pill + TESTNET / REAL MONEY eyebrows on every money card); the network named in every card, spoken read-back and signed `chainId`; a one-time "real money" sheet on the first mainnet switch; new users default to testnet | A (D2, D15) | ✅ | ✅ | `12-network-toggle/recommendation.md` §1. Testnet is thin: most bridges, oracles and risk APIs are mainnet-only (`02/README` #5) |
| A3b | **Per-network data separation**: balances, history, wallets (two Circle identities: TEST and LIVE keys) and drafts are per network; preferences are shared; contacts are a shared book with **per-network trust** (proposed) | A (D15) | ✅ | ✅ | `12-network-toggle/recommendation.md` §2 |
| A3c | **Capability registry = one source of truth** per capability × network, driving the agent's tools, its explanations, UI enable/disable, starter chips and a public availability page | R | ✅ | ✅ | `12-network-toggle/recommendation.md` §5; Agari NEW-G17 |
| A4 | Choose language on first run (auto-detect from the device) | A (D4) | ✅ | ✅ | `05/i18n.md` (expo-localization, i18next/Lingui) |
| A5 | Fund the wallet: fiat onramp (Circle Onramp, MoonPay, Transak), bridge in, receive, or testnet faucet | R | ✅ | ✅ faucet | `01/wallets-and-infra.md` ramps; `circle wallet fund` gives 20 USDC on testnet (`context/02-circle-agent-stack`) |
| A6 | Connect an external wallet (MetaMask / WalletConnect) as a funding source | R | ⚠️ | ⚠️ | MetaMask supports Arc (`01/README`); Reown AppKit on RN in `03/third-party-wallet-infra.md` |
| A7 | Voice or chat welcome tour ("What can you do?") | R | ✅ | ✅ | UX pattern |
| A8 | Device and session management, sign out everywhere, recovery and export | S | ⚠️ | ⚠️ | `03/mobile-security-ux.md` |

## B. Balances and portfolio

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| B1 | One total balance across chains (Gateway unified balance) | R | ✅ | ✅ | Gateway lists Arc domain 26 (`02/README`) |
| B2 | Token list with prices; USDC shown once (18-decimal native vs 6-decimal ERC-20 = one asset) | S | ✅ | ✅ | `context/01-arc/gotchas.md`. `Intl.NumberFormat` rejects "USDC", so it needs a custom formatter (`05/i18n.md`) |
| B3 | Positions: Earn vaults, Morpho, Aave | R | ✅ | ⚠️ mock | `02/yield.md` |
| B4 | Display currency (USD/EUR/local) and P&L | R | ✅ | ⚠️ | Prices: CoinGecko `arc`, Chainlink, RedStone (`02/prices-and-oracles.md`) |
| B5 | Hide dust and spam tokens (address-poisoning defense) | S | ✅ | ✅ | `03/README` #10 |

## C. Money movement

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| C1 | Send USDC/EURC to a contact, address, QR code, or name | A | ✅ | ✅ | App Kit Send. Names: ArcNS is unofficial; ENS/Basenames via ENSIP-11 (`07/contacts-and-names.md`) |
| C2 | Receive: QR code, copy address, share link | R | ✅ | ✅ | Detect incoming native USDC via the system emitter `0xffff…FfFE` (`context/01-arc`) |
| C3 | Request money and split bills | R | ⚠️ | ⚠️ | Whitespace in crypto agents (`04/README` #12). No Arc payment-request standard (`07/README` gaps) |
| C4 | Batch payouts (several recipients in one transaction) | R | ✅ | ✅ | Multicall3From, EOA-only (`context/01-arc/transactions-memo-batching.md`) |
| C5 | Attach a memo or reference to a payment | R | ✅ | ✅ | Arc Memo contract (same file) |
| C6 | Crosschain send (e.g. to a friend on Base) | A | ✅ | ✅ CCTP | `02/bridges-and-aggregators.md` |
| C7 | Payment status tracking and receipts (explorer link) | R | ✅ | ✅ | Blockscout API is Cloudflare-blocked for curl (`01/README`), so use RPC receipts or an indexer |

## D. Trading, tokens, meme coins

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| D1 | Swap any supported pair, with quote, slippage, price impact and fees shown | A | ✅ | ⚠️ poor rates | App Kit Swap = LI.FI underneath, ~0.25% better than LI.FI direct. Testnet 100 USDC → 82 EURC (`02/README`) |
| D2 | Meme-coin trading on Arc (Argus, Tolly, LIFT… via Uniswap v4/KyberSwap/LI.FI) | A | ✅ | ❌ | No meme tokens **listed by LI.FI** on testnet (`02/README`; #13). Whether App Kit Swap executes arbitrary tokens is [UNKNOWN] |
| D3 | **Token safety**: allowlist, copycat detection (two ARGUS, two CRCL), GoPlus risk score, wash-volume warning | S | ✅ | ❌ GoPlus | `01/tokens-and-assets.md`, `02/tx-safety-services.md` |
| D4 | Token discovery (trending, new launches) with risk labels | R | ✅ | ❌ | GeckoTerminal `networks/arc` (rate-limited) (`01/README`) |
| D5 | Limit orders, DCA, TWAP (via automations) | R | ⚠️ | ⚠️ | Trigger on the executable quote, not the 24h-heartbeat oracle (`07/README` #4) |
| D6 | Price-impact cap and fail-closed pricing | S | ✅ | ✅ | Bankr benchmark: 15% cap (`04/README` #3) |
| D7 | Reach meme chains (Solana, Base) via bridge + swap | R | ✅ | ❌ | Relay/LI.FI quotes verified (`02/README`) |

## E. Bridging

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| E1 | **Cheapest-route comparison** across CCTP/App Kit Bridge, Across, Relay, LI.FI, deBridge, Socket, using **fresh executable quotes per intent** (never a baked-in ranking, #13) | A | ✅ | ⚠️ LI.FI + CCTP only | Keyless quote APIs verified. CCTP has $0 protocol fee; Across ~$0.013/100 USDC (`02/bridges-and-aggregators.md`, `cheapest-route-design.md`) |
| E2 | Show time, fee, and route risk per option; recommend one and explain why | A/R | ✅ | ⚠️ | Agentic decision (judging: agentic sophistication) |
| E3 | Bridge progress tracking and stuck-transfer recovery | S | ✅ | ✅ | CCTP attestation flow (`context/03-circle-platform/cctp.md`) |

## F. Yield

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| F1 | Earn on idle USDC/EURC (App Kit Earn = 27 Morpho vaults) | A | ✅ | ✅ 2 mock vaults | Big vaults ~0.3–0.4% APY; ~5% vaults are small (`02/yield.md`) |
| F2 | Show APY together with TVL, liquidity, and risk; warn on small vaults | S | ✅ | ⚠️ | Same |
| F3 | Aave V4 / Morpho direct lending | R | ✅ | ❌ | Aave V4 rates [UNKNOWN] |
| F4 | Auto-sweep idle cash to yield, and redeem when needed | R | ✅ | ⚠️ | Automation (H) |
| F5 | USYC | R | ⚠️ business only | ⚠️ | Non-US, $100k minimum, allowlist, so likely out of scope for consumers (`02/README`) |

## G. Marketplace (x402 paid services)

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| G1 | Browse and search Arc-payable services: **687 catalog listings** on mainnet (callability unproven), 0 on testnet (Discovery API, keyless); plus the Arc Portal agent marketplace and the ERC-8004 agent registry | A (D14) | ✅ | ❌ | `01/README`; confirmed by Abu, Message 9 |
| G4 | **Autonomous tool discovery**: mid-task, the agent searches the marketplace for a service that can do the job, shows the price, and pays within the user's marketplace budget ("I found a service for that: $0.01. Paying now.") | A (D14) | ✅ | ⚠️ own seller | A policy check applies (budget, allowlist); responses are untrusted data (U3) |
| G2 | Agent buys a service (data, search…) under a per-call max and session budget | A | ✅ | ⚠️ own seller | Duplicate-settlement flaws reported (`04/README` #15) |
| G3 | Spending record for marketplace purchases | S | ✅ | ✅ | History (O) |

## H. Automations

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| H1 | Scheduled payments ("every Tuesday send $10 to Alex") | A | ⚠️ | ⚠️ | **Our own server scheduler** (no keeper on Arc mainnet); the authority model is open (`07/README` #1–3, `03/README` #1,4) |
| H2 | Create by chat or voice, then a preview card, then confirm once to set the envelope | A | ✅ | ✅ | `07/automations.md` |
| H3 | Envelope per automation: per-run cap, period cap, locked recipient, expiry. **A period cap is a loss bound, not a schedule**; it doesn't guarantee "Tuesday" or one payment per occurrence (#5) | S | ⚠️ | ⚠️ | On-chain via MetaMask Delegation enforcers (deployed, never run with funds on Arc) or app-enforced (`03/README` #4) |
| H4 | Lifecycle: pause, resume, edit in place, cancel, 24h-ahead reminder, "skipped because…", run history | R | ✅ | ✅ | Fintech-grade pattern (`04/README` #9) |
| H5 | Conditional/price triggers (swap when EURC < X) | R | ⚠️ | ⚠️ | Use the live quote; oracle heartbeat is 24h (`07/README` #4) |
| H6 | Event triggers ("when I receive salary, move 20% to savings"; "when balance < $50, notify me") | R | ✅ | ✅ | Needs an indexer (public RPC has no log history) (`01/README` #7) |
| H7 | DCA, round-ups, yield sweep, bill pay | R | ⚠️ | ⚠️ | Same machinery |
| H8 | Idempotency: never double-pay on retry | S | ✅ | ✅ | Provider idempotency key where the API supports it; **for raw on-chain transfers, reconcile by nonce/tx hash**. DB uniqueness on `(automation_id, version, scheduled_for)`, lease/claim, never blind replay (`REVIEW-RECONCILIATION.md` #6) |

## I. Contacts

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| I1 | Address book: name, aliases, addresses per chain, notes, last paid, and **how each address was verified** (source + out-of-band confirmation, required before unattended recurring payments) (#8) | A | ✅ | ✅ | `07/contacts-and-names.md` |
| I2 | **Unknown contact flow**: "Send to Alex" → "I don't have Alex's address" → add-contact sheet pops up (voice keeps talking) → save → continue the payment | A | ✅ | ✅ | Whitespace: no crypto agent has it (`04/README` #7) |
| I3 | Save a contact from a received payment or QR scan | R | ✅ | ✅ | Never auto-pick recipients from history (poisoning) |
| I4 | Address-change control: cooldown, version history, compare to "last paid" address | S | ✅ | ✅ | The essay's "vendor master change control" (`07/README` #8) |
| I5 | First-time-recipient warning, lookalike-address warning, name match (Wise-style) | S | ✅ | ✅ | `04/README` #7 |
| I6 | Resolve names (ENS, Basenames, ArcNS) with an "unofficial" label | R | ⚠️ | ⚠️ | No official Arc naming service (`07/README` #6) |
| I7 | Import from device contacts (optional, privacy-gated) | R | ✅ | ✅ | `06/mobile-capabilities.md` (expo-contacts) |

## J. Notifications and channels

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| J1 | In-app inbox (the source of truth) and push notifications | R | ✅ | ✅ | Expo Notifications (`06`) |
| J2 | **Connect Telegram** in settings (deep link `t.me/<bot>?start=<token>`). The token is a bearer credential: the app must show the Telegram account and the user confirms it before linking; unlink and stolen-link paths are needed (#7) | A | ✅ | ✅ | `06/notification-channels.md` |
| J3 | **Connect Discord** (bot DM or webhook, OAuth2) | A | ✅ | ✅ | Same; bot DM without a shared server is [UNKNOWN] |
| J4 | Email (Resend) | R | ✅ | ✅ | [REPORTED] endpoints |
| J5 | Event taxonomy with per-event × per-channel preferences, amount thresholds, and quiet hours | R | ✅ | ✅ | `07/notifications.md` |
| J6 | Act from a channel: deny or pause from anywhere; **moving money requires the in-app passkey** | S | ✅ | ✅ | `07/README` #7 |
| J7 | Chat with the agent in Telegram (two-way, voice notes), propose-only | R | ✅ | ✅ | Banana Gun $3M loss via its Telegram layer (`04/README` #11) |
| J8 | Price alerts and watchlist | R | ✅ | ⚠️ | |

## K. Voice and language

| # | Feature | Origin | Main | Test | Notes |
|---|---|---|---|---|---|
| K1 | Two-way natural voice conversation, including small talk ("Hello, how's it going?") | A | — | — | Recommended: LiveKit Agents + our backend as the single brain (`09-voice-decision/README.md`) |
| K2 | Barge-in (interrupt), live captions, push-to-talk vs hands-free | R | — | — | `05/realtime-voice-options.md` |
| K3 | Voice triggers UI mid-conversation (add-contact sheet, confirmation card) | A | — | — | Core requirement for I2 |
| K4 | **Voice never authorizes** (a product rule): read-back, then card, then the **wallet/passkey signs the exact typed payload** (chain, account, recipient, asset, amount, nonce, expiry, draft version). A local Face ID prompt alone is **not** a binding (Codex, `REVIEW-RECONCILIATION.md` #1) | S | — | — | Informed by NIST's ban on voice biometrics; not a legal mandate (#10) |
| K5 | Speak any major language; the agent answers in it | A | — | — | D4 |
| K6 | **Whole-app language switch** (UI text, agent replies, voice, number and date formats), RTL for Arabic/Urdu | A | — | — | `05/i18n.md`: RTL toggle needs an app restart on native |
| K7 | Voice settings: voice choice, speed, auto-speak on/off | R | — | — | |

## L. Generative UI (cards in chat)

| # | Component | Origin | Notes |
|---|---|---|---|
| L1 | Balance / portfolio card | R | |
| L2 | Send confirmation sheet (recipient, amount, network, fee, first-time warning) | A/S | Core safety surface (`04/README` #4) |
| L3 | Add-contact / contact-picker sheet | A | I2 |
| L4 | Swap quote card (route, impact, slippage) | A | |
| L5 | Bridge route comparison (cheapest / fastest, recommended) | A | E1 |
| L6 | Yield vault card (APY, TVL, liquidity, risk) | A | F2 |
| L7 | Automation editor / preview (schedule, envelope, next run) | A | H2 |
| L8 | Token safety card | S | D3 |
| L9 | Marketplace service card (price per call, budget) | A | G |
| L10 | Receipt / transaction status card | R | |
| L11 | Chart (price, balance over time) | R | |
| L12 | "Why I did this" decision card | R/S | Agentic explainability (judging) |
| — | **Approach:** a declarative spec from a fixed catalog, rendered natively on mobile and on web; specs never execute writes | R | `05/generative-ui.md`. AI SDK 7 `useChat` works on Expo and web; json-render is pre-1.0 |

## M. Agent intelligence and memory

| # | Feature | Origin | Notes |
|---|---|---|---|
| M1 | Conversation history: list, search, resume; cards re-render from history | A | `05/memory-and-history.md` |
| M2 | Typed memory (contacts, preferences, limits) held as product data, not free text | S | Memory injection is an attack surface (`04/README` #6) |
| M3 | Optional fuzzy memory that is visible, editable, and deletable | R | |
| M4 | **Risk dial**: Guard (confirm everything) ↔ Autonomous (within the envelope) | R | MetaMask Guard/Beast, Olas Co-Pilot (`04/README` #13) |
| M5 | Proactive suggestions (idle cash → yield, unusual spending, automation failed) | R | Agentic sophistication |
| M6 | Decision log: what, why, which rule, what it cost | S | The essay's "continuous audit" (`context/06-ledgers-and-prior-art`) |
| M7 | Arc knowledge Q&A (what Arc is, Arc House points, "no ARC token has launched; points ≠ airdrop") | R | `01/arc-house-and-community.md` |
| M8 | Prompt-injection defense: only the authenticated user issues money intents; web pages, memos, and other agents are data | S | `04/README` #5 |

## N. Safety and limits

| # | Feature | Origin | Notes |
|---|---|---|---|
| N1 | Per-transaction, daily, and weekly caps | A | Where enforced (contract vs server) is an open architecture question (`03/recommended-architectures.md`) |
| N2 | Pause-all kill switch | S | Bankr benchmark |
| N3 | Recipient allowlist + new-recipient cooldown (e.g. 24h) | S | Same |
| N4 | Temporary limit raise that auto-restores | R | Same |
| N5 | Step-up (passkey/biometric) for settings changes and above-limit actions | S | |
| N6 | Pre-flight checks: `eth_call` / `eth_estimateGas`, `maxFeePerGas` ≥ 20 gwei | S | Arc RPC rejects `eth_simulateV1` (`07/README` #5) |
| N7 | Mainnet/testnet confusion guard (never mix; clear labels) | S | D2 |

## O. History and reporting

| # | Feature | Origin | Notes |
|---|---|---|---|
| O1 | Activity feed (sent, received, swaps, bridges, automation runs, marketplace buys) with statuses | R | `07/history-and-reporting.md` |
| O2 | Tap any item to see why it happened (decision log) | S | |
| O3 | Export CSV / beancount; receipts | R | |

## P. Settings

Profile · Language · Display currency · Network · Notification channels (Telegram, Discord, email, push) and preferences · Voice · Limits and risk dial · Security (passkeys, devices, sessions) · Contacts · Automations · Connected wallets · Theme (light/dark) · Legal/about. Each needs its own screen and a voice/chat equivalent ("turn off Telegram alerts") [INFERENCE].

## Q. Platforms

| # | Platform | Notes |
|---|---|---|
| Q1 | iOS | **Apple 3.1.5(i): wallet apps only from developers "enrolled as an organization"**. Abu's account type is an open question (`06/distribution-and-store-policy.md`) |
| Q2 | Android | APK via internal link is judge-reachable; Play production is out for a new personal account (14-day closed test) |
| Q3 | Web | Not in Abu's words (#14), but **required in practice**: with an individual Apple account (D10), web/PWA is the only way iPhone users and judges can reach the wallet |
| Q4 | Desktop | Expo has no desktop target, so use a PWA or a Tauri/Electron shell (`06/README` #2–3) |
| Q5 | Deep links, QR scanner, share sheet, haptics, biometrics, secure storage | `06/mobile-capabilities.md` |

## R. Business mode (open question: hackathon fit)

Invoices (create, send, get paid), vendor and contractor payouts, payroll as automations, AP/AR matching, idle-cash sweep. This maps the same core onto RFB 4 "Autonomous Business Operator" (`08/hackathon-fit.md`). **Not decided.** See `OPEN-QUESTIONS` in `DECISIONS-FROM-ABU.md`.

## S. From reference-product flows (Shijima, Agari): friction removal and trust

Source studies: `10-reference-flows/agari.md` (NEW-G*) and `10-reference-flows/shijima.md` (NEW-S*), each with `path:line` evidence. Merged and de-duplicated here. Mapping to our product is [INFERENCE].
**Correction to the brief:** Shijima has **no testnet and no faucet**. It runs on mainnet only, and its "try it" path is a sponsored **"Free $1 to try"** card plus a Practice mode (`shijima.md`). Agari does have a devnet faucet flow (`agari.md`).

| # | Feature | From | Main | Test | Notes |
|---|---|---|---|---|---|
| S1 | **Guest / look-around mode + deferred sign-up**: ask, quote and draft with no account; the draft survives; sign-up happens at the confirm step; one-tap "Try on testnet" demo wallet | G1, S4 | ✅ | ✅ | Removes the biggest onboarding wall |
| S2 | **In-app starter funds**: testnet one-tap "Get test USDC" (our drip wallet or the Circle faucet), with states eligible · sending · sent · already claimed · daily limit · drip empty · fallback; optional sponsored ~$1 on mainnet; "You're funded" card on the first credit | G2, S2 | ⚠️ sponsor | ✅ | On Arc, USDC is also gas, so one asset funds everything. Testnet: `circle wallet fund` / faucet.circle.com |
| S3 | **Practice (dry-run) mode**: agent and automations run on real quotes, move no money, and report "I would have…". A go-live gate after N practice runs | G3, S3 | ✅ | ✅ | Strong agentic demo with no risk |
| S4 | **First-run tour + first-steps checklist + starter chips** (fund · first send · first automation · connect Telegram); skippable, reopenable in Settings; follow-up chips per state | S1, S5, G18, G22 | ✅ | ✅ | |
| S5 | **Feasibility pre-check with one-tap fixes, and blocker-as-label**: disabled buttons name the first fixable reason (too small for the route, vault minimum, no fee left); the same wording in UI, chat and voice | G4, S6 | ✅ | ✅ | |
| S6 | **Fee reserve indicator**: "~N actions left"; warns when "send max" would leave no USDC for gas | S7 | ✅ | ✅ | Arc gas is USDC |
| S7 | **Money-ending taxonomy + reconciliation on reopen**: done / nothing sent / on its way / may have been sent; on app open, report the fate of each pending write and **never auto-retry** | G5, S16 | ✅ | ✅ | Pairs with H8 idempotency |
| S8 | **Status**: in-app degraded banner per dependency per network, public `/status`, agent "Right now" card with heartbeat ("has not checked in") | G6, S11 | ✅ | ✅ | |
| S9 | **Judge kit + live proof page**: `/demo` (video + dated evidence of real Arc tx on both networks), `/live` action counts, plus an internal states gallery rendering every card and error | G7, S25, S26 | ✅ | ✅ | Hackathon: traction evidence |
| S10 | **Authority receipt**: a plain "can / can never" list + "worst case in one sentence" on every delegated authority (agent mode, automations, channel bots) | G8 | ✅ | ✅ | |
| S11 | **Exit kit + trust page**: pause all → revoke the agent → sweep to your own wallet; "what the agent can never do"; "your money if we disappear" | S17 | ✅ | ✅ | |
| S12 | **Lock-screen Live Activity / widget**: in-flight bridge or transfer; next automation run | G9 | ✅ | ✅ | iOS/Android native |
| S13 | **Read-back + dry run before saving an automation** ("Here is how I understood you"; first decision shown; unclear points listed) | G10, S23 | ✅ | ✅ | Shijima wrote this copy but never wired it |
| S14 | **Tiered confirmation matrix + control-card grammar**: every card states its tier (tap · biometric · step-up); settings changes show Now → After, who signs, expiry | G11, S15 | ✅ | ✅ | |
| S15 | **Share cards + request links + read-only public pages**: receipts, payment requests that open a pre-filled confirm, bridge savings | G12, G13, S19 | ✅ | ✅ | Complements C3 |
| S16 | **Underfunded-automation state**: "Paused: you have $4, next run needs $10. Top up $6 to resume", in the list, notifications and voice | G14 | ✅ | ✅ | |
| S17 | **Brake + override**: the agent can advise *not* acting (FOMO meme buys, repeated failures); the user can "do it anyway" with step-up, recorded as the user's call | G15, S14 | ✅ | ✅ | Agentic sophistication |
| S18 | **In-app help**: glossary, "I want to…" task table, troubleshooting by stage; the agent answers from it | G16, S20 | ✅ | ✅ | |
| S19 | **User-facing network availability matrix**, generated from the same capability flags the agent uses | G17 | ✅ | ✅ | Implements C3 / D2 |
| S20 | **Notification hygiene**: a quiet pinned status digest per channel; ping only on needs-you / done / failed; batch bursts; identical wording everywhere; "Telegram not connected" nudges | G19, S10, S21 | ✅ | ✅ | |
| S21 | **One Settings hub** (Agari lacked one) | G20 | ✅ | ✅ | P |
| S22 | **Region / sanctions hold on mainnet** (reads open, funded actions disabled with a reason). *Needs legal input; not decided* | G21 | ⚠️ | — | |
| S23 | **"Needs you" queue**: one approvals queue across app, voice, push, Telegram and Discord; expiry; "answered elsewhere" sync; **re-quote at execution**, abort if conditions changed | S8, S9 | ✅ | ✅ | |
| S24 | **Decision page for every action + outcome grading + weekly report** (route savings, quote vs executed, yield earned, skips with the reason) | S12, S13 | ✅ | ⚠️ thin data | Continuous audit (essay) |
| S25 | **Versioned consent** before the first money move; separate meme-coin and marketplace risk sections; localized | S18 | ✅ | ✅ | |
| S26 | **Drawdown / loss stop** for trading automations | S22 | ✅ | ⚠️ | |
| S27 | **Start from a template** (automation templates; configuration only, never money) | S24 | ✅ | ✅ | |

## T. Resolve and resume (cross-cutting; Abu D13 — research-checked in `11-blocked-actions-research/`)

| # | Feature | Origin | Notes |
|---|---|---|---|
| T1 | **Every request that can't proceed is classified** (clarification · precondition · policy refusal · warning · error) and handled per kind: plain explanation, inline fix, and **resume** where the standards say so (clarifications, preconditions); policy refusals are terminal with a fresh check after a rule change | A | Catalogue + mechanisms in `SMART-PRECONDITIONS.md` |
| T2 | Pending intents survive app close and expire safely | A/S | |
| T3 | Same blocker wording and fix in the UI, chat, voice, and Telegram | R | Agari NEW-G4 |
| T4 | Fixes that loosen safety need step-up and are never applied by the agent itself | S | |
| T5 | **User-configurable token / meme-coin rules** (access level, caps, slippage, block list) that the agent cites when blocking | A (D12) | `SMART-PRECONDITIONS.md` §Token settings |

## U. Added after the Codex review (`REVIEW-RECONCILIATION.md` #18)

| # | Feature | Origin | Notes |
|---|---|---|---|
| U1 | **Accessibility and no-mic path**: captions, full keyboard/screen-reader completion of every money action, push-to-talk fallback, reduced motion | S | No money action may be trapped behind speech |
| U2 | **Privacy and retention**: transcript/audio retention choices, delete, export, channel unlink, vendor-retention disclosure | S | `09-voice-decision/README.md` open risk |
| U3 | **x402 execution boundary**: destination allowlist, per-call and session caps, data-disclosure notice, responses treated as untrusted data, receipts, duplicate/timeout reconciliation | S | Listings ≠ proven purchases |

---

## Cross-check against Abu's wishlist (nothing dropped)

Transfers C1–C7 · trades D1–D7 · bridge + aggregator comparison E1–E3 · yield F1–F5 · marketplace G1–G3 · meme coins D2–D4 · wallets A1–A8 · limits N1–N7 · automations H1–H8 · voice K1–K7 · multilingual K5–K6 · contacts + Alex pop-up I1–I7 · Telegram/Discord notifications J1–J8 · generative UI L1–L12 · history M1, O1–O3 · mobile + desktop Q1–Q5 · Arc House / "arcade school" M7 · "very smart" missing-setup handling T1–T4 and meme-coin settings T5 (Message 8) · testnet faucets and onboarding friction removal S1–S4 (Message 5).
