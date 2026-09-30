# Kawase build status

Purpose: the resume point. A new session reads memory, then this file, then the current stage file.
Last updated: 2026-09-30 (spikes #2, #3, #7 done; Coolify runbook corrected; plan audit below)

## Current stage
**Stage 1: Day-1 spikes** (`stages/01-day-1-spikes.md`). Stage 0 still has two open items: a git source for Coolify, and the first commit + push.

## Next action
Continue the Stage 1 spikes: #1 RN SDK on the dev build (needs Abu's PIN), #10 Better Auth, #8 UI stack, #5 voice (real phone), #13 webhooks (needs the api reachable on Coolify, so a git source + first push). #4 mainnet $1 run, #2 LIVE and #12 wait on Circle's mainnet verification (Abu has applied).

## Stage checklist
- [ ] 0 Bootstrap: resume protocol ✅ · monorepo scaffold ✅ · Coolify project + Postgres ✅ · private repo Blockchain-Oracle/kawase ✅ · kickoff transcript ✅ · Coolify GitHub App ☐ (Abu)
- [ ] 1 Day-1 spikes (14): #2 ✅ testnet (LIVE pending) · #3 ✅ testnet (swap + bridge; EOA via own SigningStrategy) · #7 ✅ (local, iOS, and SSE through Coolify Traefik + HTTPS + gzip) · #4 ✅ testnet + real UCW owner (mainnet pending) · #6 ✅ · #14 ✅ (TS 6.0.3 per the Expo 57 template) · #9 ✅ iOS (Android via EAS pending) · #11 ✅ partial (PluralRules/RelativeTimeFormat need polyfills; parser fixed)
- [ ] 2 Design system and component sourcing (Abu picks a direction)
- [ ] 3 Core platform: networks ✅ money ✅ config ✅ (pure packages started early)
- [ ] 4 Agent brain, resolve and resume, chat
- [ ] 5 Money movement, contacts, business basics
- [ ] 6 Trading, tokens, bridge, yield
- [ ] 7 Marketplace (x402)
- [ ] 8 Automations and delegated authority
- [ ] 9 Notifications and channels
- [ ] 10 Voice
- [ ] 11 Onboarding and trust layer
- [ ] 12 History, reporting, privacy
- [ ] 13 Desktop
- [ ] 14 Docs site
- [ ] 15 Landing / showcase and judge kit
- [ ] 16 Production hardening and submission (deadline **2026-10-10 11:59 PM ET**)

## Spike results
- #7 Streaming chat: **PASS**. useChat + expo/fetch streams; approval round trip via `toolApproval` + `addToolApprovalResponse` + `sendAutomaticallyWhen`; `experimental_toolApprovalSecret` rejects forged approvals; **no polyfills needed on RN 0.86.3**. **SSE streams through Coolify's Traefik (HTTPS, gzip on), incl. expo/fetch on iOS**. Coolify gotchas in `deploy/coolify.md` — `spikes/07-streaming-chat.md`
- #3 App Kit: **testnet PASS 4/4**. Swap 0.5 USDC→EURC (+0.412003) and bridge 2 USDC Arc→Base Sepolia via forwarder (+1.945415), both signed by the UCW **EOA**. `createCircleUserWalletAdapter` is **SCA-only**, so use `createViemAdapter` + our own `SigningStrategy` (`atomicBatch:false`) → 2 PINs per swap/bridge; the strategy is where policy + our idempotency key/refId go; kit ops run in an executor DBOS workflow — `spikes/03-app-kit.md`
- #2 UCW typed data: **testnet PASS 13/13**. PIN user keyed by our id → EOA vault; `KawaseAuthorization` verified with viem (a tamper or the mainnet chainId fails); **#4 rerun with the real UCW owner** (delegation signed via UCW, ops redeem, cap/recipient refused, UCW-signed revoke UserOp). Rules: the device returns the signature (Circle never does); **project the typed-data message onto `types`** (else 156026); the SDK callback is a stream (155704/155112 in-sheet, 155701 cancel); **the PIN sheet shows no payload**, so the confirm card must; the Web SDK needs Node polyfills; 10.x errors are `{code,status}` — `spikes/02-ucw-typed-data.md`
- #4 Delegation: **testnet PASS 17/17** (HybridDeleGator + period/recipient/token/method/value/expiry caveats; leaked-key and attacker reverts on-chain; period reset; revoke). **Revoke = owner UserOp + self-bundled handleOps** (ARCHITECTURE updated). Circle faucet API is 403 → fund from existing wallets — `spikes/04-delegation.md`
- #11 Hermes Intl: NumberFormat OK; **PluralRules, RelativeTimeFormat, formatToParts missing** → formatjs polyfills in Stage 3; money parser made Hermes-safe — `spikes/11-hermes-intl.md`
- #9 pnpm + Expo 57 native: **PASS on iOS** (Expo pins RN 0.86.3; expo-constants override; run expo-doctor after dep changes) — `spikes/09-pnpm-expo57-native.md`
- #14 TypeScript: **6.0.3** (matches the Expo 57 template)
- #6 DBOS exactly-once: **PASS** (use DBOS 5.2.11 + drizzle-datasource 5.2.11) — `spikes/06-dbos-exactly-once.md`

## Blockers / waiting on Abu
- **Git source for Coolify (Abu's call).** D27 says GitHub App; none exists yet (`coolify github list` shows only "Public GitHub"). Creating it is a browser flow in the Coolify dashboard (Sources → + Add → GitHub App, install on Blockchain-Oracle/kawase). All six of Abu's other projects deploy with a deploy key, which Claude can set up alone from the CLI. Nothing needs deploying before spike #13 / Stage 3.
- **Nothing is committed or pushed.** The local repo has 0 commits and `Blockchain-Oracle/kawase` is empty (checked 2026-09-30). `.env` is git-ignored. Waiting for Abu's go-ahead to commit and push.
- Circle **TEST: ready** ✅ (API key, App ID fetched, entity secret recovered from `_archive/arc-treasury-intelligence/.env` and proven by creating the `kawase-testnet` wallet set). Circle **LIVE: Abu has applied for mainnet access and is awaiting Circle's verification (this can take a while), so this waits on Circle, not Abu.** Re-checked 2026-09-30: the LIVE key still returns 403 Forbidden on `/v1/w3s/config/entity` and `/v1/w3s/wallets` (TEST returns 200). Waiting behind it: #2 LIVE, the #4 mainnet $1 run, #12. Re-run the same check to see when it flips. (Circle bills MAW, first 1,000 wallets free; Gas Station charges gas + 5%.) OpenAI ✅ (same key in agari/keeperhubv2/stocklana; default gpt-5.6-luna tool-calls correctly).
- Security note 2026-09-29: the Circle TEST entity secret was accidentally printed in the session transcript (a broken macOS sed mask). Low risk (testnet); Abu may rotate via the Circle console using the recovery file from arc-treasury-intelligence. ✅ Received and verified 2026-09-29: API_KEY_21ST, LiveKit Cloud (URL/key/secret), ElevenLabs (TTS + STT work; its voices-list permission is off, which is fine).
- Repo is private for now; flip to public before submission (Oct 10).

## Plan audit (2026-09-30)
- Spike #7's Traefik test was in the plan ("→ Hono via Traefik SSE"). How it was done was off the normal Coolify path: a throwaway Dockerfile-content app, whose quirks were then written up as deploy gotchas. `deploy/coolify.md` now documents the real pattern (git source, Dockerfile build pack, port + `https://` sslip.io domain at creation), checked against the Coolify skill, the live server and the Coolify source.
- Stage 0 was never closed: no git source in Coolify, no commit, no push.
- The "Docs to read first" section is still a placeholder in `stages/00` and `stages/01`. Fill it before each remaining spike.
- The Stage 1 progress log has entries only for #2, #3, #7. The results for #4, #6, #9, #11, #14 are recorded above and in `spikes/`.
- Version drift from the plan, already recorded above: RN 0.86.3 (plan said 0.87), DBOS 5.2.11 (plan 5.1.10), TS 6.0.3.

## Handoff rule
Before a session ends or the context is cleared, update this file: what was done, what is in progress, the next action, and any blockers.
