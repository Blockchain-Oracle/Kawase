# Kawase (為替): master build plan

## Context

Abu is building **Kawase**, a voice-first, multilingual AI agent that can do **everything on the Arc ecosystem** (Circle's stablecoin L1: mainnet 5042, testnet 5042002) for consumers and small businesses. It covers send, swap, bridge with a cheapest-route pick, yield, the x402 agent marketplace, tokens and meme coins, wallets, limits, automations ("every Tuesday send $10 to Alex"), two-way voice, the whole app in 10 languages, contacts, push and email notifications, generative-UI cards, history, and a mainnet ↔ testnet toggle that works "like dark mode". It is for the Tameion Agents Hackathon (Canteen × Circle × Arc; deadline 2026-10-10 11:59 PM ET; judged 30% agentic / 30% traction / 20% Circle tools / 20% innovation).

The research phase is complete. It lives in `context/` (the hackathon library, 01–07) and `context/08-product-research/` (streams 01–16, plus synthesis, feature inventory, flows, "resolve and resume", Codex review and reconciliation). **Binding decisions are D1–D28 in `context/08-product-research/DECISIONS-FROM-ABU.md`.** Abu's own words are in `ABU-BRIEF-VERBATIM.md`.

**Intended outcome:** all deliverables built and deployed on Abu's Coolify, working on both networks, with **nothing left behind** (D16): the iOS app, Android app, desktop app, web app, docs site, and landing/showcase page.

### Standing rules (from Abu; apply to every stage)
- **Everything is MVP (D16).** The stage order is only a dependency order, not a scope cut. The deadline never justifies mediocre work (D17).
- **Read the docs before using any library.** Use Context7 first; if its quota is out, use the official docs through WebFetch. Use each tool the way its docs say (D21). Every stage file lists the docs to read first.
- **UI comes from curated, ready-made components** (D19/D28). Use 21st.dev search, `get`, and install, plus the open premium registries. **Never AI-generate and never hand-roll a component a registry already has.** Native gets faithful React Native Reusables rebuilds of the chosen designs. No mediocre design.
- **Constants live in `packages/config` and `packages/networks`. No magic numbers** (ESLint enforced). Code is reusable, and the folder structure is clean (D21).
- **Tests are not a deliverable** (D22). Only integration tests where an integration's behavior is uncertain (listed per stage).
- **Resume across cleared sessions** (D23): the `plan/` folder plus persistent memory. No CLAUDE.md.
- **Deploy** on Coolify: one Application per service, GitHub App, the Coolify-provided domain with HTTPS; don't worry about backups for now (D18/D27).
- Reference projects (arc-agent, keeperhub-copilot-v2, shijima, agari) are **lessons only, never templates** (D7).
- Never write secrets into files. The 21st API key and all Circle keys live only in env.

---

## Resume protocol (D23) — do this first in Stage 0

1. Copy this plan into the repo as `plan/MASTER-PLAN.md`. Create:
   - `plan/STATUS.md`: stage checklist, current stage, **next action** (one line), last updated, spike results.
   - `plan/stages/NN-<name>.md`: one per stage below, containing goal, feature and flow IDs, tasks, docs to read first, 21st sourcing queries, exit criteria, verification, and a progress log.
   - `plan/spikes/NN-<name>.md`: result, evidence (tx hashes, logs), and the decision taken.
   - `plan/ARCHITECTURE.md`: the §Architecture section of this plan, kept current.
2. Update persistent memory (`tameion-arc-agent-product.md`) to say: **"Build in progress: read `plan/STATUS.md` first."**
3. **Handoff rule:** before any session ends or context is cleared, update `plan/STATUS.md` (done, in progress, next action, blockers). A new session reads memory → `plan/STATUS.md` → the current stage file → the relevant `context/` files.

---

## Architecture (becomes `plan/ARCHITECTURE.md` in Stage 0 and is kept current as built)

Architecture assumptions Abu can override:
- the user's wallet is an ordinary EOA held by Turnkey, with EIP-7702 on-chain limits (K3; chosen by Abu on 2026-09-30, D33)
- one shared contact book with per-network trust
- mainnet available to every user behind a one-time sheet
- Expo `web.output:"server"`
- the double-unique occurrence key
- landing as its own app, separate from docs

### Key decisions
- **K1 One brain.** A single `agentTurn()` in `packages/agent` serves chat, voice (the LiveKit `llmNode` override), and read-only automation commands. **Money automations never go through the LLM.** They use the same deterministic draft builders and the same policy engine.
- **K2 The model proposes; code resolves, checks and executes.** No model tool has a `network`, `address` or "approve" parameter. A payment is authorized in one of two ways: **inside the user's allowance**, by the user's signed on-chain delegation (no prompt; the chain enforces the cap); or **above it**, by a fresh **wallet signature over the exact payload**, approved with the user's passkey (Face ID). A local Face ID check in our own app is never the binding by itself (Codex #1).
- **K3 Custody (D33; replaces the Circle PIN wallet).**
  - The user's **wallet** is an ordinary **EOA held by Turnkey** in the user's own sub-organization. Sign-up is an email code, a passkey, or Apple / Google. No PIN, no security questions. One address on both networks.
  - **Agent authority** sits on that same account: EIP-7702 upgrades it in place to MetaMask's `EIP7702StatelessDeleGator`, and ERC-7710 delegations with **caveats built by code** set an everyday allowance (USDC `transfer` only, an amount per period, an expiry) and one grant per automation (plus a pinned recipient). A Kawase ops-redeemer DCW redeems them. Proven on Arc testnet (spike #15).
  - Setup is free for the user: a Kawase relayer sends the one-time 7702 transaction.
  - The **marketplace wallet** is a per-user, per-network DCW EOA; its balance is the hard cap.
  - **Fallbacks:** Privy for the key; or Circle email sign-in with the separate HybridDeleGator account from spike #4.
  - An EOA, because 7702 and the delegation framework need an ECDSA key and Memo/Multicall3From only accept EOA callers (`context/01-arc/gotchas.md`).
- **K4 Automations = DBOS** (`@dbos-inc/dbos-sdk` 5.1.10) in `apps/executor` on the Coolify Postgres. One short workflow per occurrence or intent; a cron tick every minute; `workflowID = occurrence.id`.
- **K5 Postgres is the only bus.** A transactional outbox → `pg_notify` → api SSE and DBOS notify queues. No Redis.
- **K6 The network is server-authoritative session state**, cached in MMKV for instant startup. Every write carries `expectedNetwork`. `intent == session == wallet env == eth_chainId`, or it is a hard stop.

### Verified stack (checked on npm and in the docs, 2026-09-29)

| Area | Choice |
|---|---|
| App | Expo SDK 57 (expo 57.0.26, expo-router 57.0.24, **RN 0.86.3, React 19.2.3** as pinned by Expo; spike 09), dev builds (not Expo Go), `web.output:"server"` via expo-server |
| Chat / agent | AI SDK 7 (`ai` 7.0.122, `@ai-sdk/react` 4.0.125, `@ai-sdk/anthropic` 4.0.68). `useChat` with the `expo/fetch` transport. Server: `streamText` → `toUIMessageStream` → `createUIMessageStreamResponse`. Approvals via `addToolApprovalResponse`; client tools via `addToolOutput`; persistence in `onEnd`. **Provider-agnostic (D29):** AI SDK `createProviderRegistry`; roles in `packages/config/src/models.ts` default to `openai:gpt-5.6-luna` for every role (Abu: cheap GPT-5; upgrade via env, e.g. `openai:gpt-6-sol`), overridable per role via `KAWASE_MODEL_*` (e.g. `anthropic:claude-sonnet-5-5`) |
| API | Hono 4.13.11 + `@hono/node-server` 2.1.3, `hc<AppType>` RPC client; tsdown bundling |
| Auth | Better Auth 1.7.6 (email OTP, `@better-auth/passkey`, anonymous for guests, `@better-auth/expo`), separate from Circle wallet auth |
| Data | Drizzle 0.45.3 + drizzle-kit 0.31.11 on `pg` 8.23; Postgres 17 |
| Automations | DBOS **5.2.11** (+ drizzle-datasource 5.2.11; spike 06) (`registerWorkflow`, `runStep`, `startWorkflow({workflowID})`, `registerQueue` after launch, `createSchedule`, `DrizzleDataSource`) |
| Chain | viem 2.57.0 (`arc`/`arcTestnet` built in; no wagmi). User wallet: Turnkey (`@turnkey/react-native-wallet-kit` 2.3.7 on native, `@turnkey/react-wallet-kit` 2.5.1 on web). `@circle-fin/app-kit` 1.15.3 through the viem adapter with our own signing strategy. Agent wallets: `@circle-fin/developer-controlled-wallets` 10.8.1. `@metamask/smart-accounts-kit` 2.0.0 (the renamed delegation toolkit; mainnet addresses passed manually) |
| Voice | LiveKit Cloud SFU. `@livekit/agents` 1.9.1 Node worker: cascade pipeline STT → **our `agentTurn` via an `llmNode` override** → TTS, with `gpt-live-1` delegation as a per-language upgrade. `@livekit/react-native` 3.0.0 + Expo plugin 1.0.3. RPC `ui.show` delivers cards |
| UI | Web: 21st.dev and the premium registries (shadcn CLI). Native: React Native Reusables (CLI 0.7.1) on Uniwind 1.12 + Tailwind 4.3, `@gorhom/bottom-sheet` 5.2.14, `sonner-native` 0.27, Reanimated 4.7, victory-native, FlashList, Skia. One token file drives both |
| i18n | i18next 26 + react-i18next 17 + expo-localization; 10 locales: en, zh, hi, es, fr, ar, bn, pt, ru, ur; RTL via `I18nManager` + `Updates.reloadAsync`; formatjs polyfills |
| Docs | Fumadocs 16.15 + Next 16.3 (`proxy.ts` i18n, `llms.txt`, standalone Docker) |
| Monorepo | pnpm (pinned via `packageManager`, `catalog:` for shared versions) + Turborepo 2.11.5; JIT internal packages; TypeScript 5.9/6.x (not 7 until spike 14 clears) |
| Deploy | Coolify v4.3.23, Traefik; services `api`, `executor`, `chain-watcher`, `voice-agent`, `web`, `docs`, `landing` + Postgres 17 |

### Monorepo layout

```
kawase/
├─ package.json  pnpm-workspace.yaml (catalog:)  turbo.json  tsconfig.base.json
├─ eslint.config.mjs   # no-magic-numbers; import boundaries (server pkgs banned from mobile/docs/landing)
├─ plan/               # MASTER-PLAN, STATUS, ARCHITECTURE, stages/, spikes/
├─ deploy/             # coolify.md runbook, node-service.Dockerfile (shared ARG APP), compose.dev.yaml (local PG)
├─ apps/
│  ├─ mobile/          # Expo: iOS, Android, web/PWA
│  │  └─ src/app/
│  │     ├─ (onboarding)/{welcome,language,try}
│  │     ├─ (auth)/{sign-in,otp}
│  │     ├─ (app)/
│  │     │  ├─ index (chat)
│  │     │  ├─ voice
│  │     │  ├─ threads
│  │     │  ├─ activity/[intentId]
│  │     │  ├─ needs-you
│  │     │  ├─ wallet/{receive,fund}
│  │     │  ├─ contacts
│  │     │  ├─ automations
│  │     │  ├─ marketplace
│  │     │  └─ settings/{network,language,limits,tokens,notifications,channels,security,devices,voice,privacy,trust,availability}
│  │     ├─ i/[intentId]   # deep-link resume
│  │     ├─ r/[token]      # payment request
│  │     ├─ status
│  │     └─ demo
│  │     # also under src/: features/{chat,voice,approvals,network,…}
│  │     # also under src/: cards/registry.{native,web}.tsx
│  │     # also under src/: lib/{api,query-keys,sse}
│  ├─ api/             # Hono
│  │  └─ src/
│  │     ├─ auth
│  │     ├─ middleware/{session,network-context,idempotency-key,rate-limit,problem-json}
│  │     ├─ routes/*
│  │     ├─ webhooks/{circle,livekit}
│  │     ├─ internal/{agent-turn,thread-events,voice-session}
│  │     ├─ surfaces/{chat}
│  │     └─ realtime/bus
│  ├─ executor/        # DBOS worker: tick, run-occurrence, track-intent, notify, reconcile, faucet-drip, grant-lifecycle, x402-purchase
│  ├─ chain-watcher/   # viem log polling per network (USDC system emitter 0xffff…FFFE, ERC-20, DelegationManager, Memo), Postgres cursor
│  ├─ voice-agent/     # @livekit/agents worker; KawaseAgent.llmNode → api /internal/agent/turn; cascade + gpt-live pipelines
│  ├─ docs/            # Fumadocs
│  ├─ landing/         # Next 16 showcase + /demo + /live + availability
│  └─ desktop/         # Tauri 2 shell over the web app (the PWA ships first)
└─ packages/
   ├─ config           # limits, timeouts, fees, cache, automation, marketplace, faucet, voice, models, locales, queues, events (as const, unit-suffixed names)
   ├─ env              # zod env loaders per app (the only process.env reader)
   ├─ networks         # 2 NetworkContext literals, addresses, providers, capabilities/{registry, preconditions, runtime-overlay}, assert-network
   ├─ money            # branded bigint base units, assets, locale parse, format (no Intl currency for USDC)
   ├─ policy           # pure evaluate(input) → PolicyResult[]: 5 kinds (clarification|precondition|policy|warning|error), reason enum, tiers
   ├─ intents          # A2A state machine, drafts/*, EIP-712 typed data, draft hash, derive/{wallet-tx,appkit,delegation}, readback templates
   ├─ agent            # agentTurn, prompts, tools/*, untrusted-content quarantine + taint
   ├─ workflows        # DBOS workflow names + typed enqueue client; definitions (registered only in executor)
   ├─ db               # drizzle schema/*, repos, withOutbox tx, committed migrations
   ├─ cards            # zod card catalog + actions + version
   ├─ ui-tokens        # tokens.json → web.css, native.css, tokens.ts (generated)
   ├─ ui-web           # 21st/shadcn installs + web card twins
   ├─ ui-native        # RNR/Uniwind rebuilds + native card twins
   ├─ i18n             # locales/<lng>/{common,cards,policy,notifications,voice,legal}.json, typed keys, rtl
   ├─ log
   └─ integrations/    # wallet (Turnkey signer + a local-key signer for tests), circle (keys, dcw, webhooks, gateway, discovery, faucet), appkit, delegation,
                       # routing/{lifi,relay,across,debridge,socket}, goplus, prices, names, earn, x402,
                       # email, push, livekit, speech
```

**Boundaries.**
- Client-safe packages never import server SDKs; lint enforces the import rules.
- `policy` is pure. The agent (drafting), the api (approval) and the executor (execution) all call the same `evaluate()`.
- `intents` is shared by the agent, api, executor and voice read-back.
- `wallet` hides the key provider behind one signer interface (`signAuthorization`, `signTypedData`, `signTransaction`), so the provider can be swapped without touching the rest.
- Everything is a JIT package except `ui-tokens` and `i18n` types, which are generated.

### Runtime flows
- **Chat:** `useChat` → `POST /v1/chat` → `agentTurn(surface:'chat')` → UI message stream. Client tools render forms. Form data goes to real endpoints; `addToolOutput` returns only ids.
- **Voice:**
  1. App → `POST /v1/voice/session` → a LiveKit token, and the agent is dispatched.
  2. The worker's STT output → `llmNode` override → `/internal/agent/turn` → text → TTS.
  3. Cards go to both the thread SSE and `performRpc('ui.show')`; the SSE copy is canonical.
  4. Money read-backs are fixed template copy in the user's language.
  5. There is no approve tool, so a spoken "yes" cannot authorize.
- **Email (D31; Telegram and Discord removed 2026-09-30):** sent by the executor's notify queue through Resend. Links open the app at `/i/{intentId}`; an email never approves or signs anything.
- **Automations:**
  1. DBOS tick → `SELECT … FOR UPDATE SKIP LOCKED` → `INSERT occurrence ON CONFLICT DO NOTHING` → `runOccurrence`.
  2. Re-check → deterministic draft → `evaluate` → one of: attended (outbox approval + `recv` with a timeout), delegated (redeem the automation's grant via the ops DCW with a persisted idempotency key), or practice ("would have…").
  3. Confirm (receipt `status==1` or Circle `COMPLETE`) → outbox.
- **Resolve and resume:**
  1. The policy report's first blocking kind decides what happens: error > policy > precondition > clarification. Warnings go on the confirm card.
  2. Fixes arrive through their own endpoints, each writing `precondition.cleared`.
  3. `resume-intents` re-runs **every check** via `agentTurn(trigger:'resume')`.
  4. Policy refusals are terminal; a rule change is a separate step-up plus signed action, followed by a fresh draft.
  5. There is no split or "rest later".
  6. Network switch: switching to testnet auto-resumes. Switching to mainnet resumes reads only; money requests are re-drafted as a REAL MONEY intent.
- **Approval binding:**
  - **Inside the allowance:** no user signature. The api re-runs `evaluate`, reserves spend, and the ops DCW redeems the user's allowance delegation; the transfer leaves the user's own account. The chain enforces token, method, amount per period and expiry.
  - **Above the allowance, and swap/bridge steps:** the api builds the unsigned transaction from `intent_drafts[v]`; the device signs it with the wallet after a passkey prompt; the api checks the signed bytes against the draft, then broadcasts. A mismatch freezes the intent and raises an alert.
  - **Settings or authority changes:** the wallet signs an EIP-712 `KawaseAuthorization` (passkey).
  - **Grants (the allowance, an automation):** the wallet signs the MetaMask `Delegation` struct (passkey). The "can / can-never" receipt is **decoded from the signed caveats**.
  - **Setup:** one EIP-7702 authorization signed by the wallet, sent by the relayer.
  - **Revoke:** `disableDelegation`, one ordinary transaction from the wallet.
- **Idempotency:**
  - An `Idempotency-Key` header on every mutating POST.
  - Occurrences are `UNIQUE(automation_id, automation_version, scheduled_for)` **and** `UNIQUE(automation_id, scheduled_for)`, so editing an automation can't pay the same Tuesday twice.
  - The UUIDv4 key is persisted **before** any Circle call (ops-wallet redeems). Wallet-signed transactions store `(network, from, nonce)` and `tx_hash` before broadcast. x402 uses `payment-identifier`.
  - An ambiguous outcome becomes `unknown_outcome` and is never auto-retried. A reconcile workflow runs every few minutes, with a Coolify scheduled task as backup.
  - A `spend_ledger` reservation plus an advisory lock per (user, network) prevents concurrent limit bypass.
- **Outbox:** `withOutbox(tx, events)` → `pg_notify` → api SSE (app, web, voice worker) and the executor's notify queue → `deliveries UNIQUE(outbox_id, channel, target_ref)`. Quiet hours and preferences apply; security events can't be muted; `inbox_items` is the in-app source of truth.

### Data model (Drizzle)

Conventions: UUIDv7 ids, money as `numeric(78,0)`, a `network` enum. Better Auth owns user, session, account, verification and passkey.

| Area | Tables |
|---|---|
| Users | `user`+ (locale, reply_language, display_currency, tz, theme, active_network default testnet, risk_mode, practice_mode, is_anonymous, paused_all_at), `devices`, `user_wallet_setup` (per network: 7702 setup, allowance grant), `consents` |
| Wallets | `wallets` (role: user / marketplace / external / ops_redeemer / relayer / faucet_drip; custody: turnkey / circle_dcw / external; address; the user wallet is one address on both networks) |
| Contacts | `contacts`, `contact_addresses` (versioned; source; status pending_cooldown / active / retired / blocked), `contact_address_trust` (per network: first/last paid, verified_method, cooldown, allowlisted, change_hold), `contact_address_events` (append-only) |
| Conversation | `threads` (rolling_summary), `messages` (UIMessage parts jsonb, seq, tsvector), `memory_facts`, `voice_sessions` |
| Intents | `intents` (A2A state, blockers, resume_token_hash, parent_intent_id, practice), `intent_drafts` (immutable versions + draft_hash + quote expiry), `approvals` (tier, route: allowance / wallet_signature, signed payload, signature, status), `api_idempotency` |
| Authority | `grants` (kind: allowance / automation; the full signed delegation + decoded receipt), `limits` (per network, temp raise), `token_rules`, `token_rule_entries`, `marketplace_budgets`, `spend_ledger` |
| Automations | `automations` (rule jsonb/rrule, tz, authority_mode, missed_run_policy, next_run_at), `automation_versions`, `occurrences` (the two uniques above) |
| Execution | `tx_attempts` (idempotency_key v4 UNIQUE, nonce, tx_hash, status incl. unknown), `chain_events` UNIQUE(chain_id, tx_hash, log_index), `indexer_cursors`, `provider_webhook_events` UNIQUE(provider, external_id) |
| Channels | `outbox`, `deliveries`, `inbox_items`, `notification_prefs` |
| Other | `marketplace_purchases` UNIQUE(payment_identifier), `payment_requests`, `faucet_claims` (per day, testnet-only CHECK), `audit_log` (append-only, hash-chained, insert-only role) |

### Agent tools (grouped; R = read, P = propose with a card, X = executes within pre-signed or funded authority, C = client form)
- **Account:** `get_account_status`, `explain_capabilities`, `start_wallet_setup`, `request_network_switch`, `claim_test_usdc` (X), `show_funding_options`
- **Balances:** `get_balances`, `get_portfolio`, `get_price`, `get_fee_reserve`
- **Send:** `resolve_recipient`, `propose_send`, `propose_batch_send`, `propose_crosschain_send`, `create_payment_request`, `share_receipt`
- **Trade:** `search_tokens`, `get_token_safety`, `get_trending_tokens`, `get_swap_quote`, `propose_swap`
- **Bridge:** `compare_bridge_routes` (ranked by net received), `propose_bridge`, `get_bridge_status`
- **Earn:** `list_vaults`, `get_vault`, `propose_earn_deposit`, `propose_earn_withdraw`
- **Marketplace:** `search_marketplace`, `inspect_service` (reads the 402 requirements without paying), `buy_service` (X within budget), `set_marketplace_budget`
- **Automations:** `draft_automation` (read-back + next 3 runs + max exposure), `list_automations`, `get_automation_runs`, `simulate_automation`, `pause_automation`, `skip_next_run`, `pause_all`, `resume_automation`, `edit_automation`, `cancel_automation`
- **Contacts:** `search_contacts`, `get_contact`, `resolve_name`, `request_contact_address` (C), `propose_contact_address_change`
- **Channels:** `get_channel_status`, `create_alert_rule`, `set_notification_prefs` (adding an email goes through the AddEmail card and Better Auth's email code)
- **Settings / limits / memory:** `set_language`, `set_voice_prefs`, `request_permission` (C), `remember_fact`, `forget_fact`, `set_risk_mode`, `get_limits`, `propose_limit_change`, `propose_allowlist_change`, `propose_token_rule_change`, `revoke_grant`, `accept_consent` (C)
- **History / knowledge / status:** `search_history`, `export_history`, `get_weekly_report`, `get_decision_log`, `arc_knowledge`, `get_status`, `feasibility_check`

Tightening a setting is a tap; loosening it requires step-up plus a wallet signature.

### Card catalog (`packages/cards`; web + native twins)
- **Money / state:** Portfolio, Balance, ActivityList, Receipt, TxStatus (the money-ending taxonomy), Chart, LimitUsage, FeeReserve, WeeklyReport, DecisionCard ("why")
- **Proposals:** ConfirmationSheet (always native on mobile), SwapQuote, BridgeRouteComparison, VaultCard, TokenSafety, MarketplaceService, PurchaseReceipt, AutomationPreview, GrantReceipt (can / can-never + worst case), SettingsDiff (Now → After), PaymentRequest, ShareCard, PracticeResult
- **Resolve and resume:** AddContactForm, ContactPicker, ChoiceChips, AddEmail, PermissionPrimer, NetworkSwitch, MainnetFirstSheet, Consent, Fund/Faucet, PolicyRefusal, ReQuote, ErrorCard, StatusCard

### Security
- **No user keys in our environment.** Turnkey holds each user's key in the user's own sub-organization (secure enclave); once a passkey exists, a Turnkey policy requires it for wallet signatures. Circle DCW holds the agent's keys. The agent's reach into a user's account is capped on-chain by the caveats. The relayer holds only a small gas float.
- **Env:**
  - Both Circle keys (TEST/LIVE), the entity secrets and the Turnkey organization credentials live in env.
  - `MAINNET_ENABLED` and the LIVE keys exist only in the production environment; missing keys fail closed to testnet.
  - Previews get TEST keys only.
  - App DB role vs migrator role; `audit_log` is insert-only.
- **Prompt injection:** only the authenticated user's own words can create an intent. Free text is wrapped in an `<untrusted>` quarantine block: notes, token names, memos, ENS text records, x402 bodies, forwarded messages. A tainted turn disables autonomous purchases, and addresses may only come from contacts or verbatim user text.
- **x402:** only listings from the Discovery catalog. Before paying, check `scheme=exact`, the USDC `0x3600…` asset, the chainId, `amount ≤ per_call_max`, and that `payTo` is unchanged. The payment identifier makes purchases idempotent. Responses are size- and type-capped and never chain further payments.
- **Channels:** email and push only. An email address is verified with a code before it receives anything. Links and notification taps open the app and never approve or sign.
- **21st:** the `API_KEY_21ST` lives only on dev machines. Installs are copied source, reviewed like supply-chain changes, with fetch calls and placeholder copy stripped.

### Performance
- Streaming passes straight through Hono with `no-transform` and `X-Accel-Buffering: no` (Traefik SSE is verified in a spike).
- Anthropic prompt caching on the static prefix. Tool list filtered by the network's capabilities. `toModelOutput` compaction. A rolling thread summary.
- Quote LRU + singleflight keyed (network, provider, pair, size bucket) with a 15 s TTL. `Promise.allSettled` fan-out with a per-provider timeout. Always re-quote at approval.
- TanStack Query keys `['net', chainId, …]` keep both networks cached, so the toggle is instant. SSE drives targeted invalidation. MMKV persister.
- The mobile bundle excludes server SDKs (lint). LiveKit and Skia load lazily per route. Circle SDK init is lazy. Hydration completes before render, so there is no wrong-network flash.
- The voice worker prewarms VAD and the turn detector, sends the first sentence to TTS, and says a filler phrase while tools run.

---

## 21st.dev sourcing workflow (used in Stages 2, 4–15)

Verified on Abu's account: paid tier; unlimited search and `get`; AI generation OFF and not to be used; CLI 1.17.1; install URLs need `API_KEY_21ST`.

1. **`DESIGN.md` first** (premium-ui Phase 0 + `21st init --design-context`): real palette (light, dark, and a **testnet hue layer** distinct from error red), a non-Inter font pairing that covers all 10 locales (CJK, Devanagari, Bengali, Arabic/Urdu), spacing, radius, motion, and the blocklist. No install happens before `DESIGN.md` resolves every token.
2. **Pick a direction** with `21st-ui-explore`: 3 directions that differ on at least 2 axes. **Abu chooses one.**
3. **Per surface:** `21st search "<need>" --context auto` (3 results per query, so run several phrasings) → judge by preview, video and `21st get <id>` code (there is no popularity data) → pick → install with `npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"` or the open registries (`@aceternity`, `@magicui`, `@kokonutui`, Motion-Primitives via the 21st mirror).
   - If nothing fits: compose from installed parts and **say so explicitly**. Never generate.
4. **Reskin** to the tokens. Strip placeholder copy and fetches. Keep all states (focus, keyboard, reduced motion, loading, empty, error). Then `21st review <paths>`.
5. **Native twin:** a faithful RNR/Uniwind rebuild of the chosen design, plus `@gorhom/bottom-sheet`, `sonner-native`, victory-native, and the LiveKit visualizer or a Skia orb.

Starting shortlist (verified in today's searches), per surface:
- **Chat input:** Chat Input @Alwurts, AI Chat Input @preetsuthar17, Input Bar/Agent Chat @serafimcloud, Prompt Input @ibelick
- **Messages:** Chat Message @asanshay (AI-SDK parts)
- **Voice orb:** Voice Powered Orb @isaiahbjork, Live Orb @radiumcoders; ElevenLabs Bar Visualizer
- **Wallet balance:** Wallet Card 2 @beratberkayg, Balance Chart @ssychui
- **Transactions:** Transaction List @hari, Audit Log @corr
- **Onboarding:** Step Onboarding Wizard @ziegfiroyt
- **Settings:** Settings Sidebar Layout @felipemenezes098
- **Toggles:** Segmented Control @ddoemonn, Switch @micka_design
- **Drawer:** @wensity (snap points)
- **Toasts:** shadcn sonner
- **Command palette:** @rafa-porto
- **Empty state:** @serafimcloud
- **Alert dialog:** @shadcn
- **Charts:** Chart Area @uiable
- **Contacts:** Item List @bundui
- **QR:** @designali-in
- **Landing:** prisma-hero, glassmorphism-trust-hero, @kokonutui / @aceternity bento

There is **no catalog match** for BridgeRouteComparison, so it is composed from installed parts and flagged.

---

## Stages (dependency order; every feature group A–U and every flow F1–F50 is covered)

| # | Stage | Features | Flows |
|---|---|---|---|
| 0 | Bootstrap, resume protocol, kickoff video | — | — |
| 1 | Day-1 spikes (14) | gates | — |
| 2 | Design system + component sourcing | L (visual), Q5 | — |
| 3 | Core platform | A1–A8, A3b/c, B2, K6, P, Q1–Q3, S19, S21, S25 | F1, F14, F17, F29, F50 |
| 4 | Agent brain + resolve and resume + chat | L, M1–M8, T1–T5, S5, S14, S17 | F27, F30, F31, F44, F48 |
| 5 | Money movement + contacts + business basics | C1–C7, I1–I7, N1–N7, B1, B5, R (invoices, vendor labels) | F3, F4, F5, F11, F16, F25, F26, F33 (part), F41 |
| 6 | Trading, tokens, bridge, yield | B3, B4, D1–D7, E1–E3, F1–F5, T5 | F6, F7, F8, F20, F39, F49 |
| 7 | Marketplace (x402) | G1–G4, U3 | F21 |
| 8 | Automations + delegated authority | H1–H8, S3, S10, S13, S16, S23, R (payroll) | F9, F10, F23, F24, F33 (part), F36, F37, F40 |
| 9 | Notifications + channels | J1–J8, S20, S12 | F12, F13, F22, F28, F45 |
| 10 | Voice | K1–K7, U1 | F18, F19 |
| 11 | Onboarding and trust layer | S1, S2, S4, S6–S11, S18, S22 | F2, F34, F35, F38, F43, F46 |
| 12 | History, reporting, privacy | O1–O3, S15, S24, S26, S27, U2 | F15, F47 |
| 13 | Desktop | Q4 | F32 |
| 14 | Docs site | D20 | — |
| 15 | Landing / showcase + judge kit | S9, D25 | F42 |
| 16 | Production hardening, both-network E2E, submission | all | all |

Services are deployed to Coolify from Stage 3 onward: **deploy early, deploy continuously**.

### Stage 0: Bootstrap
- Create the `plan/` folder, the memory pointer and `plan/STATUS.md` (resume protocol).
- **Transcribe the Tameion kickoff repeat** (https://youtube.com/live/DE0hqGa0CuY): download the audio with `uvx yt-dlp -x`, transcribe locally, save to `context/05-canteen-ecosystem/transcripts/kickoff-repeat-2026-09-29.md`, and check anything new about on-chain limits against this plan.
- Scaffold the monorepo:
  - `git init`, pnpm workspace + `catalog:`, turbo, tsconfig, ESLint boundaries + no-magic-numbers, `.env.example`, `.gitignore`.
  - Empty apps and packages with their `package.json` exports.
- Start `deploy/coolify.md`. Create the Coolify project "kawase" (read the Coolify skill first), install the GitHub App, and create Postgres 17.
- **Exit:** `pnpm install && turbo typecheck` passes on the empty skeleton; `plan/STATUS.md` exists; the transcript is saved.

### Stage 1: Day-1 spikes

Each spike is recorded in `plan/spikes/`, with evidence and a decision.

| # | Spike | Pass | Fallback |
|---|---|---|---|
| 1 | ~~Circle UCW RN SDK 2.2.5 on the dev build~~ **Superseded by #16 (D33).** The SDK built and initialised; the PIN steps were not run | — | — |
| 2 | ~~UCW PIN user; `signTypedData` challenge~~ **Passed on testnet, then superseded by #16 (D33).** Still valid from it: the `KawaseAuthorization` typed data and its verification; the DCW entity secret per environment | — | — |
| 3 | App Kit `createCircleUserWalletAdapter` `onChallenge` for swap, bridge and earn: challenge count, idempotency keys, whether calldata can be prepared | a swap + bridge completes on testnet | Executor-run App Kit op with signal wait + `refId` reconcile |
| 4 | **Delegation** (the kickoff's "limits the agent can't exceed"): passed on testnet with a HybridDeleGator account; the account setup is replaced by #15 (7702 on the user's own EOA), the caveat logic carries over. Original scope: delegation signed by the owner; redeemed by the DCW. Tests: pass, pass, period-exceeded fail, wrong recipient fail, wrong token/method/native-value fail, expiry fail, `disableDelegation`, leaked-worker-key worst case. Testnet first, then **$1 on mainnet**; tx hashes recorded; verify the deployed source and audit scope | every negative test reverts on both networks | Architecture A (DCW allowance + app limits, labelled as such) |
| 5 | LiveKit RN 3.0.0 on RN 0.87; `llmNode` override streaming from the api; RPC round trip; p50 end-of-speech → first audio ≤ 1.5 s; barge-in ≤ 300 ms; en/fr/es/ar/zh test; 20-minute session with reconnect | all met on a real phone | GPT-Live direct → ElevenLabs Agents with a custom LLM → push-to-talk |
| 6 | DBOS 5.1.10: `DrizzleDataSource` on shared PG, `registerQueue` after launch, `createSchedule`, `DBOSClient.enqueue` from the api, app version across a Coolify rolling deploy | exactly-once occurrence under a crash | pg-boss + a hand-written state machine |
| 7 | AI SDK 7 `useChat` + `expo/fetch` → Hono via Traefik SSE; the current approval API name | a streamed tool approval round trip | Adapt to the docs |
| 8 | Uniwind + RNR + 21st `.web.tsx` under Expo web `output:"server"`, one token file for both | a web and a native card render from one spec | RNR on web too; 21st only in docs and landing |
| 9 | pnpm isolated linker + Expo 57 autolinking | builds on both platforms | `node-linker=hoisted` for mobile |
| 10 | Better Auth 1.7.6: email OTP + passkey + anonymous + expo on RN 0.87; guest → account data migration | a guest upgrades without losing data | — |
| 11 | Hermes Intl for the 10 locales; RTL reload | ar/ur render RTL correctly | formatjs polyfills |
| 12 | x402: one real mainnet Discovery purchase from a DCW EOA via EIP-3009; Facilitator status | the purchase settles and a receipt is stored | Read-only marketplace + our own testnet seller |
| 13 | Circle webhooks for Circle wallets on Arc (both environments). (The Telegram webhook was dropped with D31.) | events arrive and are deduped | Reconcile polling only |
| 14 | TypeScript 5.9 vs 6.x across Expo, Drizzle, Hono and DBOS | typecheck green | Pin the lowest common version |
| 15 | **EIP-7702 limits** (added 2026-09-30): an ordinary EOA delegates to `EIP7702StatelessDeleGator`; the ops DCW spends inside an on-chain period cap from the user's own account; relayed setup for an empty wallet | every negative test refused on testnet; mainnet when funded | The HybridDeleGator account from #4 |
| 16 | **Turnkey wallet in the app** (added 2026-09-30): `@turnkey/react-native-wallet-kit` on the Expo 57 dev build and the web kit on Expo web; email-code sign-up; sign a 7702 authorization, an EIP-712 delegation and a transaction on Arc testnet; passkey-required policy; one sign-in with Better Auth; App Kit swap with the new signer | the spike-15 flow runs end to end from the app | Privy with the same signer interface |

The **integration tests we keep** (D22) come from these spikes: the delegation caveats (#4, #15), the wallet signing flow (#16), DBOS exactly-once (#6), the network-mismatch hard stop, and LiveKit RPC (#5).

### Stage 2: Design system + component sourcing
- `DESIGN.md` and the 3 directions → **Abu picks one**.
- `packages/ui-tokens`: tokens.json → web and native CSS + TS; light, dark, and the testnet layer; RTL-safe logical spacing.
- For every surface in the shortlist: search, pick, install into `ui-web`, then build the native twin in `ui-native`. Record every pick (component · author · URL · why) in `plan/stages/02-*.md`.
- **Exit:** a gallery route (`/dev/gallery`, internal) renders every base component on web and native in light, dark, testnet and Arabic RTL; `21st review` is clean.

### Stage 3: Core platform
- `packages/{config,env,networks,money,i18n,db,log}`; Drizzle schema + migrations; the api skeleton (Hono, problem+json, idempotency, rate limits).
- Better Auth: email OTP, passkey, guest.
- Wallet creation at sign-up (Turnkey, one EOA for both networks), the relayed 7702 setup per network, and the default allowance grant with one Face ID. The first-mainnet sheet + consent; the network pill toggle + testnet bar + REAL MONEY eyebrows; server-authoritative network + MMKV cache.
- Capability registry + runtime overlay + the public availability page.
- i18n for 10 locales with RTL reload.
- Settings hub skeleton. Expo app shell (tabs/drawer, routes), web output, PWA manifest.
- Deploy `api` + `web` to Coolify.
- **Exit:** sign up as a guest → pick a language (including ar) → sign up with an email code and get a wallet with no PIN → accept the default allowance with one Face ID → toggle to mainnet (one-time sheet, mainnet setup relayed) and back instantly, same address; balances are separated per network; running on the Coolify domain.

### Stage 4: Agent brain + resolve and resume + chat
- `packages/{policy,intents,agent,cards}`: `evaluate()` with the 5 kinds and the reason enum; the A2A intent state machine + draft versions + EIP-712 hashing + read-back templates.
- `agentTurn` with prompt caching, the network/locale tail, capability-filtered tools, untrusted quarantine + taint, and `toModelOutput` compaction.
- Card registry for native and web.
- Chat UI (composer, message parts, tool-approval UI).
- Threads with history and search. Rolling summary. Visible memory. Risk modes.
- `resume-intents` flow; the `precondition.cleared` outbox events; the `/i/[intentId]` deep-link resume.
- **Exit:**
  - "send 10 to Alex" (unknown) → AddContactForm → resumes.
  - "send 10" → USDC/EURC chips.
  - An over-limit request → PolicyRefusal with the numbers and **no split option**.
  - A mainnet-only request on testnet → NetworkSwitch card with asymmetric resume.
  - Every result renders on native and web.

### Stage 5: Money movement + contacts + business basics
- Send, receive (QR, share link), request money and split bills (C3), batch payouts (Multicall3From), memo, crosschain send; the approval endpoint (lock, fresh evaluate, spend reservation, then the allowance redeem or a wallet signature); post-verification against the draft; `tx_attempts` + reconciliation; the money-ending taxonomy.
- `apps/chain-watcher` (system emitter + ERC-20 + Memo, with cursors) → incoming-payment matching + inbox.
- Contacts: versioned addresses, per-network trust, verification method, 24 h change cooldown + hold, first-time and lookalike warnings, ENS/Basenames/ArcNS ("unofficial"), QR scan, save-from-received.
- Limits (per-tx, daily, weekly, allowlist, new-recipient cooldown, temporary raise with auto-restore, pause-all).
- Business basics (R): business profile, invoices = payment requests with memo matching, vendor labels on contacts.
- Deploy `executor` (reconcile, track-intent) + `chain-watcher`.
- **Exit:** a real send on testnet **and** mainnet (small amount) with receipts; an incoming payment detected; an address change freezes payments; duplicate taps never double-send.

### Stage 6: Trading, tokens, bridge, yield
- Swap via App Kit (LI.FI underneath) + KyberSwap/LI.FI for arbitrary tokens.
- Token search, trending and safety (GoPlus, copycat detection); user token rules (D12) enforced by policy; price impact and slippage caps; the brake behavior.
- `compare_bridge_routes` across CCTP/App Kit, Across, Relay, LI.FI, deBridge and Socket (fresh quotes, net received, trust labels) + bridge execution and status + stuck-transfer recovery.
- Earn vaults (App Kit Earn / Morpho) with APY + TVL + liquidity warnings, deposit and withdraw, positions.
- Prices and charts; portfolio.
- **Exit:** a mainnet swap, a meme-token buy blocked by a default rule then allowed after a signed rule change, a bridge that picks the cheapest route and explains why, an earn deposit + withdraw; testnet shows the mock vaults and correct "mainnet-only" explanations.

### Stage 7: Marketplace (x402)
- Discovery search, `inspect_service`, `buy_service` via the marketplace DCW with budgets (per-call, session, daily), the consent card, the tainted-turn rule, untrusted responses, purchase receipts.
- **Autonomous tool discovery** mid-task (G4).
- Our own testnet demo seller (testnet has 0 listings).
- **Exit:** the agent solves a task by finding and paying for a mainnet service within budget; over budget → policy refusal; on testnet the demo seller works.

### Stage 8: Automations + delegated authority
- `apps/executor` DBOS workflows: tick, run-occurrence, grant-lifecycle.
- `draft_automation` with clarifications (day, time zone, asset), the read-back + dry run + next 3 runs + max exposure, the **delegation grant signed by the user's wallet** (one Face ID) (caveats built by code, receipt decoded from the caveats).
- Scheduled, price-triggered (on the executable quote) and event-triggered (salary received, balance below X) automations; DCA, round-ups, yield sweep, payroll templates (R).
- Lifecycle: pause, resume, edit (narrowing is immediate; widening needs a new grant), skip next, cancel (`disableDelegation`), a 24 h reminder, "skipped because…", underfunded state, missed-run policy.
- Practice mode + the go-live gate. The "Needs you" queue with expiry + re-quote at execution.
- Attended mode (ask every time) for users who prefer it.
- **Exit:** "every Tuesday send $1 to Alex" runs unattended on testnet and mainnet within its caveat; over-cap and wrong-recipient attempts revert on chain; editing never double-pays; practice produces "would have" records.

### Stage 9: Notifications + channels
- The outbox notify queue → push (Expo), inbox, email (Resend).
- **Channels are the in-app inbox, push, and email only (D31).** Telegram and Discord were removed on 2026-09-30: Kawase is a mobile app, so push covers what Telegram would, and email reaches iPhone users on the web app.
- **Email:** receipts, incoming payments, approvals waiting, automation results. A guest has no email, so asking for email notifications shows an "add your email" card (the same resolve-and-resume pattern) and then finishes the request. Email links only open the app (`/i/{intentId}`); nothing is ever approved from an email.
- Preferences per event, channel and network; quiet hours; hygiene rules; missing-channel nudges; Live Activity / widget for in-flight transfers (S12).
- **Exit:** a guest says "email me when I get paid" → AddEmail card → code verified → rule created → a real incoming payment sends a push and an email within seconds, prefixed with the network.

### Stage 10: Voice
- `apps/voice-agent` (the LiveKit worker, `llmNode` → api, cascade pipeline with per-locale STT/TTS from `config/voice.ts`, `gpt-live-1` delegation where it passed the spike).
- Mobile + web voice screen with the orb/visualizer, captions and push-to-talk; the RPC `ui.show` handlers; barge-in.
- Fixed-template money read-backs; "I've put a form on your screen"; mic permission primer + the denied → Settings path.
- Voice settings; accessibility / no-mic completion of every flow (U1).
- **Exit:** in French, by voice only until the confirm tap: "Bonjour" small talk → "envoie 20 à Alex" (unknown) → the form pops up while talking → saved → confirm sheet → signed → spoken result. The same flow works in English and Spanish; Arabic displays RTL.

### Stage 11: Onboarding and trust layer
- Guest look-around with deferred sign-up; a one-tap test USDC faucet with every state (the drip DCW + Circle faucet fallback); an optional sponsored ~$1 on mainnet.
- A first-run tour + first-steps checklist + starter chips per state.
- Fee reserve "~N actions left"; the feasibility pre-check with one-tap fixes.
- Pending-write reconciliation on app open; the status page + "right now" card; the authority "can / can-never" receipt everywhere.
- The exit kit: pause all → revoke the agent → sweep back. The trust page. In-app help. Versioned consent.
- Region hold: a placeholder flag, off by default (it needs legal input).
- **Exit:** a new user goes from install → email code → wallet → funded on testnet → first send with no prompt inside the allowance, in under 2 minutes; the exit kit leaves zero remaining authority, verified on chain.

### Stage 12: History, reporting, privacy
- Activity feed (all kinds, per network) → the decision page ("why": checks, rule, cost, model id); the weekly report with outcome grading.
- CSV + beancount export (balance assertions); share cards + public read-only receipts; payment-request links.
- The drawdown/loss stop for trading automations; automation templates.
- Transcript/audio retention controls, delete/export, email removal.
- **Exit:** every action taken in Stages 5–10 appears with a correct "why", and the export round-trips into beancount with balance assertions passing.

### Stage 13: Desktop
- Installable PWA (service worker app shell, keyboard shortcuts, a ⌘K command palette, QR shown instead of scanned).
- Tauri 2 shell over the web app (read the docs first; passkeys are avoided inside Tauri per bug #7926, so auth uses email OTP there).
- **Exit:** a desktop install on macOS/Windows runs the full chat + voice + send flow.

### Stage 14: Docs site
- `apps/docs`: Fumadocs 16 + Next 16, i18n for the 10 locales (content in en, fr, es first, then the rest), `llms.txt`, a user guide (every feature and flow), a safety/trust model, a network availability matrix (generated from the registry), architecture, an API overview, and a self-hosting/Coolify guide.
- Screenshots come from the shared `ui-web` components, so they can't drift from the product.
- Deploy.
- **Exit:** the docs are live on the Coolify domain, in multiple languages, with `/llms.txt` served.

### Stage 15: Landing / showcase + judge kit
- `apps/landing`: sections built from the 21st/premium registries (hero, bento of capabilities, live demo embed, network toggle demo, voice demo, trust section, "the agent you don't have to bring").
- `/demo`: the video + a dated evidence table of real Arc tx links on both networks.
- `/live`: real action counts.
- A public status page link.
- **Exit:** landing is live; a judge can go landing → web app (guest) → docs without help.

### Stage 16: Production hardening + submission
- A full both-network end-to-end pass of flows F1–F50 on iOS dev build, Android APK (EAS internal link), web, and desktop.
- Security review of the approval binding, injection taint, and notification links; performance pass (bundle size, cold start, voice latency).
- The public GitHub repo README, including the **delta disclosure** of prior work (arc-agent) per the hackathon rules.
- A demo video under 3 minutes (the hyperframes / failure-first-demo-video skills).
- Traction evidence (real businesses/users onboarded, value moved, tx hashes) and the submission form (https://forms.gle/BBWrdfuircrKiG2i6) before **Oct 10, 11:59 PM ET**. It can be resubmitted as progress continues.

---

## Verification (end to end)

- **Per stage:** the exit criteria above, observed on real devices and on the Coolify deployment, with tx hashes recorded in the stage file.
- **Integration tests only where uncertain** (D22): delegation caveats (pass and revert matrix), wallet signature + post-verification, DBOS exactly-once occurrence under a crash + rolling deploy, the network-mismatch hard stop, LiveKit RPC card delivery, the x402 purchase idempotency.
- **Final:** every flow F1–F50 walked on both networks, in en/fr/es and ar (RTL), by chat and by voice. Every feature ID in `FEATURE-INVENTORY.md` ticked in `plan/STATUS.md`. `21st review` is clean on web surfaces. `turbo typecheck lint` is green. All 7 Coolify services are healthy.

## Critical files to read while executing
- `context/08-product-research/{DECISIONS-FROM-ABU, FEATURE-INVENTORY, USER-FLOWS-INDEX, SMART-PRECONDITIONS, REVIEW-RECONCILIATION}.md`
- `context/08-product-research/12-network-toggle/{recommendation, libraries-and-implementation}.md`
- `context/08-product-research/13-deployment-coolify/recommendation.md` and `/Users/abu/.claude/skills/coolify/SKILL.md`
- `context/08-product-research/03-wallets-custody-limits/delegation-session-keys-limits.md` (Arc delegation addresses)
- `context/08-product-research/09-voice-decision/architecture-options.md`
- `context/08-product-research/14-ui-and-docs/{recommendation, component-sourcing, docs-site}.md` and `/Users/abu/.claude/skills/{premium-ui, 21st-ui-build, 21st-ui-explore, 21st-cli-use}/`
- `context/08-product-research/07-automations-contacts-safety/{automations, contacts-and-names, limits-and-safety, user-flows}.md`
- `context/01-arc/{network-config, gotchas}.md`; `context/02-circle-agent-stack/x402.md`
