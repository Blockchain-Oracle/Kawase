# Kawase build status

Purpose: the resume point. A new session reads memory, then this file, then the current stage file.
Last updated: 2026-09-30 (spikes #2, #3, #7, #8, #10, #13 done; Stage 2 directions ready for Abu's choice)

## Current stage
**Stage 2: Design system and component sourcing** (`stages/02-design-system-component-sourcing.md`), with the Stage 1 spikes that need Abu or mainnet still open.

## Next action
1. **Abu chooses a design direction** (A Tegami, B Chōba, C Koe, or a mix). Comparison page: https://claude.ai/artifact/DRnNKsKaDFB97jY9TfCfAZ (private to Abu); same content in `plan/design/DIRECTIONS.md`; live at `/dev/directions` in the web build. Claude recommends A with C's orb as the voice mode.
2. After the choice: `packages/ui-tokens/tokens.json` from the chosen set, delete the other two and `apps/mobile/src/dev/`, remove the temporary "Directions" tab, finish `DESIGN.md`, then source the remaining surfaces and build the native twins.
3. Open Stage 1 spikes: #1 Circle RN SDK (Abu enters the PIN on the simulator), #5 voice (real phone), #12 x402 and the mainnet halves of #2, #4, #13 (wait for Circle's mainnet approval), a real Telegram delivery (needs a bot token).

## Stage checklist
- [ ] 0 Bootstrap: resume protocol ✅ · monorepo scaffold ✅ · Coolify project + Postgres ✅ · private repo Blockchain-Oracle/kawase ✅ · kickoff transcript ✅ · first commit pushed ✅ · Coolify deploy key ✅ (GitHub App optional later)
- [ ] 1 Day-1 spikes (14): #2 ✅ testnet (LIVE pending) · #3 ✅ testnet (swap + bridge; EOA via own SigningStrategy) · #7 ✅ (local, iOS, and SSE through Coolify Traefik + HTTPS + gzip) · #8 ✅ (iOS + web; Android not run) · #10 ✅ (iOS + web; native passkey open) · #13 ✅ Circle testnet (LIVE pending; Telegram needs a bot token) · #4 ✅ testnet + real UCW owner (mainnet pending) · #6 ✅ · #14 ✅ (TS 6.0.3 per the Expo 57 template) · #9 ✅ iOS (Android via EAS pending) · #11 ✅ partial (PluralRules/RelativeTimeFormat need polyfills; parser fixed)
- [ ] 2 Design system and component sourcing: `DESIGN.md` draft ✅ · 3 directions built ✅ · 10 components installed in `ui-web` ✅ · **Abu's choice ☐** · tokens package ☐ · native twins ☐ · gallery ☐
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
- #13 Webhooks: **PASS for Circle on testnet**, through a real Coolify deploy (deploy key, Dockerfile, port + `https://` sslip.io domain at creation). Signed `transactions.outbound` (DCW) and `transactions.inbound` (UCW) arrive on ARC-TESTNET; Circle retries a failed delivery in 1–3 s with the same `notificationId`; dedupe held (2 deliveries, 1 side effect); order is not guaranteed. **Services on alpine must listen on `::`** (Coolify's health check uses `localhost` → `::1`). Open: LIVE, and a real Telegram delivery (no bot token in `.env`) — `spikes/13-webhooks.md`
- #10 Better Auth: **PASS** (headless 18/18, web passkey 4/4, iOS guest → email OTP upgrade with data kept, session restored after restart). **`onLinkAccount` must move every user-owned table and passkeys in one transaction** (the guest row is deleted afterwards and our FKs cascade); a failed migration loses nothing and a retry completes it; BA 1.7 refuses cookie POSTs without an `Origin`; the CLI is now `npx auth@latest generate`; **native passkeys are open** (browser-only client; needs a native module + an associated domain on the deployed api) so native uses email OTP for now — `spikes/10-better-auth.md`
- #8 UI stack: **PASS** on iOS + web. One card spec → RNR/Uniwind card on native and a 21st.dev DOM card on web (`.web.tsx` twin), one token file, 4 themes (light, dark, testnet, testnet-dark) + RTL; production export under `web.output:"server"` works. **`react-native-web` pinned to 0.21.2** (Uniwind 1.12.0 bug, uni-stack/uniwind#695); web installs live in `packages/ui-web` with `@kawase/ui-web/*` aliases; wrap third-party components with `withUniwind`; SDK 57 "server" output = prerender + API routes, so themes must be CSS-only — `spikes/08-ui-stack.md`
- #7 Streaming chat: **PASS**. useChat + expo/fetch streams; approval round trip via `toolApproval` + `addToolApprovalResponse` + `sendAutomaticallyWhen`; `experimental_toolApprovalSecret` rejects forged approvals; **no polyfills needed on RN 0.86.3**. **SSE streams through Coolify's Traefik (HTTPS, gzip on), incl. expo/fetch on iOS**. Coolify gotchas in `deploy/coolify.md` — `spikes/07-streaming-chat.md`
- #3 App Kit: **testnet PASS 4/4**. Swap 0.5 USDC→EURC (+0.412003) and bridge 2 USDC Arc→Base Sepolia via forwarder (+1.945415), both signed by the UCW **EOA**. `createCircleUserWalletAdapter` is **SCA-only**, so use `createViemAdapter` + our own `SigningStrategy` (`atomicBatch:false`) → 2 PINs per swap/bridge; the strategy is where policy + our idempotency key/refId go; kit ops run in an executor DBOS workflow — `spikes/03-app-kit.md`
- #2 UCW typed data: **testnet PASS 13/13**. PIN user keyed by our id → EOA vault; `KawaseAuthorization` verified with viem (a tamper or the mainnet chainId fails); **#4 rerun with the real UCW owner** (delegation signed via UCW, ops redeem, cap/recipient refused, UCW-signed revoke UserOp). Rules: the device returns the signature (Circle never does); **project the typed-data message onto `types`** (else 156026); the SDK callback is a stream (155704/155112 in-sheet, 155701 cancel); **the PIN sheet shows no payload**, so the confirm card must; the Web SDK needs Node polyfills; 10.x errors are `{code,status}` — `spikes/02-ucw-typed-data.md`
- #4 Delegation: **testnet PASS 17/17** (HybridDeleGator + period/recipient/token/method/value/expiry caveats; leaked-key and attacker reverts on-chain; period reset; revoke). **Revoke = owner UserOp + self-bundled handleOps** (ARCHITECTURE updated). Circle faucet API is 403 → fund from existing wallets — `spikes/04-delegation.md`
- #11 Hermes Intl: NumberFormat OK; **PluralRules, RelativeTimeFormat, formatToParts missing** → formatjs polyfills in Stage 3; money parser made Hermes-safe — `spikes/11-hermes-intl.md`
- #9 pnpm + Expo 57 native: **PASS on iOS** (Expo pins RN 0.86.3; expo-constants override; run expo-doctor after dep changes) — `spikes/09-pnpm-expo57-native.md`
- #14 TypeScript: **6.0.3** (matches the Expo 57 template)
- #6 DBOS exactly-once: **PASS** (use DBOS 5.2.11 + drizzle-datasource 5.2.11) — `spikes/06-dbos-exactly-once.md`

## Blockers / waiting on Abu
- **Git source for Coolify: done with a deploy key** (Abu, 2026-09-30: "lets continue lol why wait for me"). Coolify key `kawase-deploy-key` (`qfzygvoehtclwstqsjcviqwm`), added read-only to `Blockchain-Oracle/kawase`. A GitHub App can replace it later if Abu wants push auto-deploy and Watch Paths without a webhook.
- **Repo pushed:** first commit `be83488` on `main` (2026-09-30). `.env` is git-ignored and the commit was scanned for secrets first.
- Circle **TEST: ready** ✅ (API key, App ID fetched, entity secret recovered from `_archive/arc-treasury-intelligence/.env` and proven by creating the `kawase-testnet` wallet set). Circle **LIVE: not approved yet.** Abu has applied and is awaiting Circle's verification (he said "approved" on 2026-09-30, then corrected it the same day: he was mistaken). The LIVE key returns 403 Forbidden on every Wallets endpoint, which is expected until approval (last check 2026-09-30; TEST returns 200). Nothing for Abu to do but wait. Once approved: re-run the 403 check, then set the LIVE entity secret (`CIRCLE_LIVE_ENTITY_SECRET` is empty) and fetch the LIVE App ID. Waiting behind it: #2 LIVE, the #4 mainnet $1 run, #12, #13 LIVE. (Circle bills MAW, first 1,000 wallets free; Gas Station charges gas + 5%.) OpenAI ✅ (same key in agari/keeperhubv2/stocklana; default gpt-5.6-luna tool-calls correctly).
- Security note 2026-09-29: the Circle TEST entity secret was accidentally printed in the session transcript (a broken macOS sed mask). Low risk (testnet); Abu may rotate via the Circle console using the recovery file from arc-treasury-intelligence. ✅ Received and verified 2026-09-29: API_KEY_21ST, LiveKit Cloud (URL/key/secret), ElevenLabs (TTS + STT work; its voices-list permission is off, which is fine).
- **Telegram bot token missing:** `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are empty in `.env`. Abu creates a bot with @BotFather and adds the token; Claude generates the webhook secret.
- Repo is private for now; flip to public before submission (Oct 10).

## Plan audit (2026-09-30)
- Spike #7's Traefik test was in the plan ("→ Hono via Traefik SSE"). How it was done was off the normal Coolify path: a throwaway Dockerfile-content app, whose quirks were then written up as deploy gotchas. `deploy/coolify.md` now documents the real pattern (git source, Dockerfile build pack, port + `https://` sslip.io domain at creation), checked against the Coolify skill, the live server and the Coolify source.
- Stage 0 was open (no git source in Coolify, no commit, no push); closed later the same day with a deploy key and the first push.
- The "Docs to read first" section was a placeholder in `stages/00` and `stages/01`. From #8 and #10 on, each spike write-up lists the docs read; `stages/01` now lists them too.
- The Stage 1 progress log has entries only for #2, #3, #7. The results for #4, #6, #9, #11, #14 are recorded above and in `spikes/`.
- Version drift from the plan, already recorded above: RN 0.86.3 (plan said 0.87), DBOS 5.2.11 (plan 5.1.10), TS 6.0.3.

## Known leftovers
- `pnpm lint` fails in `@kawase/money` (6 errors) and in the Expo template files under `apps/mobile` (40 errors). Both predate spikes #8/#10; the template files are replaced in Stage 2. Typecheck is green (18/18).
- 2026-09-30: the Mac's disk filled during the iOS rebuild; Docker stopped several dev containers. Claude cleared the npm download cache, restarted `deploy-postgres-1`, `s10-pg`, `s10-redis` and `senryo-ledger-dev`. `s6-12-web` (another project's container) was gone and was not recreated.

## Handoff rule
Before a session ends or the context is cleared, update this file: what was done, what is in progress, the next action, and any blockers.
