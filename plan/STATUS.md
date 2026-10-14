# Kawase build status

Purpose: the resume point. A new session reads memory, then this file, then the current stage file.
Last updated: 2026-10-03 afternoon (security fixes running in 4 worktrees, desktop web in 1; OpenAI credit out; per-area truth in `plan/COVERAGE.md`)

## Now — 2026-10-02 afternoon (Claude Code leads; Codex no longer used)

**Read first:**
- the approved plan `/Users/abu/.claude/plans/noble-nibbling-shannon.md`;
- the product definition `plan/product/` (D36, the how-tree: rules, capability matrix, cards, routes, surfaces, decisions, gaps).

Abu's direction: define every flow end to end, every asset first-class, the whole Arc ecosystem with options (perps via Kawase Margin on Aave V4 + Connect Hibachi, meme coins, Apple Pay buy via Circle Onramp Kit, yield and borrow across protocols, executed bridges, the x402 Agent wallet), sourced 21st.dev components, no screenshot loops, daily TestFlight.

**Landed on main:**
- `d903bd2`: product definition.
- `576182c`, `aff2220`, `628bae8`: **sign-in fixed in Release builds.** The root cause was the `getRandomValues` polyfill loading after Turnkey's crypto. Also new: real error logging, the `POST /client-events` beacon and an OTP countdown.
- `59feaf8`: chat and composer redesign.
- `f28f9d5`: smooth story swipe.
- Docs (`apps/docs`), landing (`apps/landing`, `/demo`, `/live`), `GET /public/stats`, PWA.
- `d1db81a`: worktrees kept out of EAS.
- `67c6af8`: links on **getkawase.xyz** (bought via Namecheap 10-02; DNS A @/www/* → 84.46.247.92).

**Delivery:**
- **TestFlight 1.0.0 (7):** EAS `44fca440`, auto-submit `7bfaa477`.
- **Coolify:** API `aa050ec` live. Serial redeploys run for API, web, docs (`pkfhd3wsjqegxhscwirqjosp`, docs.getkawase.xyz) and landing (`nsnfikr0etw0u2kdltsz8vyf`, getkawase.xyz).
- **The Coolify CLI needs the tunnel:** `ssh -N -L 8001:localhost:8000 agari-box`.

**Builders in worktrees** (`.claude/worktrees/*`; each merges when its slice is done):
- **A:** assets, portfolio, Home/dock, Markets, token page, any-pair swap. Slice 1 `a84df90`.
- **B1:** money rails: margin, Onramp, bridges, yield/borrow. Kyber adapter `ad7f509`, fixes `15c05b8`, slide and ruler `a4560f1`.
- **B2:** x402 Agent wallet, account, business, history.
- **Lane C:** GPT-Live voice, web voice, narration, Settings → Voice (migration 0050).

**Migration ranges:** A 0020–29, B1 0030–39, B2 0040–49, C 0050–59, A3 0060–69, A5 0070–79. Journal order is by `when`, not by number: …0040, 0041, 0030_margin, 0020_wallet_tokens, 0050_voice_prefs, 0031_onramp.

**Evening 10-02 (lead):**
- **Merged:** voice (`43bd3bc`), the SSR fix (`f9a5e46`), A's Alchemy discovery (`a48c08e`), B1's Buy with Apple Pay / card through the Circle Onramp Kit (`8e18523`, a sandbox session verified with test cards), and A's market polish (`c31f189`).
- **Builder A next:** A2 = send, withdraw and add money for every asset, plus the token-rules screen and margin positions on Home.
- **Agent speed (`ddac3ad`):** measured with the real prompt and tools. The model alone took 5–6 s for five words; our prompt added little.
  - OpenAI Fast mode is on for every turn: the first word went from 3.4 s to 2.5 s (median), and whole turns from 2.5–7.8 s to 1.7–4.1 s. It costs about $0.0005 a turn.
  - Voice now reads the capability view together with the wallet, so "what can you do?" spoken takes one step: 5.3–7.6 s → 1.8–3.9 s.
  - The old first-chunk timer measured SDK bookkeeping; it now times the first visible word or tool call. Probe scripts are in the session scratchpad `latency/`.
- **Mainnet switched on:**
  - The Circle LIVE key was verified with read calls, and a fresh LIVE entity secret was registered.
  - The secret and the recovery file are in `~/.kawase-secrets/` (mode 600, outside the repo). **Abu should copy them into a password manager.**
  - Ops wallet `cd79106f-…` `0x2afa6cb26f360adecbd8a014030a8aff17ae8b3b` and relayer `0x18fb4f6679dcb927Ef70b3B9Be8B0440e7836b78` on ARC. **Both have 0 USDC and need a few USDC for gas** before any mainnet setup or redeem.
  - Coolify has `MAINNET_ENABLED=true` and the keys. The server keeps Arc's public RPC (`rpc.mainnet.arc.io`), so the 10 s watchers don't spend Alchemy's free 30M CU/month.

**Night 10-02 → morning 10-03 (lead):**
- **Merged:**
  - B1: bridges and yield/borrow (4a95264); then any asset across chains, TP/SL with health alerts, and launchpads (B1-6).
  - A3: safety, automations 8c and Activity (411cbfb); then pause/cooldown/brake per X30/X31 (389708a).
  - C2: narration, the Tauri desktop app, docs and landing (411cbfb, 82ecd28).
  - A: A2 Withdraw, Add money and any-asset Send; then A-3 (picker in Earn/Automations, My places, withdraw resume and grouping, watchlist, candles, P&L, alerts for any token, memo on Send).
  - A5: A5-2 (scan to pay, splits, /i/<id>, receipts, contacts); then A5-3 (in-app asks, any-asset splits, hide amounts).
  - B2: B2-2 (business and account from chat, any-token invoices, device alerts, Apple Pay into the agent wallet; one payroll per X32); then B2-3 (display currency, Help & trust, gas-free sends through the EIP-3009/7702 relayer, mainnet "getting ready", offline cache).
- **Production fixes from builders:**
  - every one-call 7702 batch was reverting (6c2bf66);
  - Aave V4 account totals were read 1e18 too large (cdc7665);
  - the web origin and links now use app.getkawase.xyz (CORS);
  - the api image starts tsx directly (health-check timeout).
- **OpenAI credit ran out on 10-02 night (`credit_balance_exhausted`):** the agent and GPT-Live voice are down until Abu adds credit. Builders burned it on doc translation and live tests; see memory shared-model-key-budget. A Google provider option was added (1725923), but the shell's Gemini key is free tier and hits its quota.
- **Live:** api + web follow main; docs and landing deployed (Mac .dmg at getkawase.xyz/download). TestFlight 9 (`d40d78b9`) and APK (`e224f315`) were built from main on 10-03 08:40.
- **Running:**
  - A: A-4 (§D surface audit; withdraw as one batch);
  - B1: B1-7 (mainnet acceptance runner, relayed gas for its flows, Aero LP, two-step bring-in);
  - B2: B2-4 (README with the prior-work disclosure, judge walkthrough, push credentials audit).
- **Abu:** OpenAI credit; ~5 USDC each to ops 0x2afa…8b3b and relayer 0x18fb…6b78 on Arc mainnet; back up ~/.kawase-secrets.

**Afternoon 10-03 (lead):**
- **Merged and deployed** (api, web, docs, landing all finished 14:53): A-4 (Home/Markets/token page to plan §D, withdraw as one batch), B2-4 (README, judge walkthrough, /demo anchors), B2-5 (live README screenshots, getting-started recipient, Alchemy over-quota pause), handles containing "kawase" reserved, the rate limiter forgets idle callers.
- **Security review over the money paths:** 5 high, 7 medium, tracked with owners in `plan/reviews/2026-10-03-security-review.md`. **Don't fund the mainnet wallets until the highs are merged.**
- All five builders died together on an API connection drop (ECONNRESET) at ~13:44. Agents from an earlier session can't be resumed, so fresh builders were started in the same worktrees with full briefs:
  - `b2-security` (H1, H5, M7 payouts, M10, SSRF, lows, M12);
  - `a5-security` (H2, M8, M11);
  - `a3-security` (H4 wallet, which also adds the shared on-chain disable helper; M6, M7 pause, M9, practice regex);
  - `b1-security` (commits its relayed-gas WIP, then H3, H4 protection, lows, then the acceptance runner);
  - `a-desktop` (finishes the uncommitted web desktop layout).
- Migration numbers: B2 0049 then 0080–89; A5 0078–79 then 0090–99. **Drizzle applies only entries whose `when` is later than the newest one recorded.** Locally, shared across worktrees, this had silently skipped 0030_margin and 0020_wallet_tokens; repaired 10-03 (applied by hand and recorded with their sha256). Production has all 51.
- **Lead fix `161ade6`:** a Turnkey email counts only if it was proved. `UPDATE_USER_EMAIL`'s `verificationToken` is optional, so anyone could claim a victim's address for contact discovery or lock the real owner out.

**Evening 10-03 (lead):**
- **All five security highs merged** (`8f3534f9`); every row's status is in the tracker. M12 (device stamp on approvals and deletion) is built but off until the new app build is on phones: set `DEVICE_PROOF_REQUIRED=true` on the api then.
- **Relayer limits (H5):** 20 relays a day per person, shared with gas-free sends (revokes don't count); 0.25 USDC of gas per person a day; a global 3 USDC a day on mainnet (50 on testnet).
- **Merged:**
  - A: desktop web (side menu, two-column Home and token page, inline swap ticket, sheets as dialogs);
  - A5-4: reminders for requests and splits, `/i/<id>` for every kind, contact verification, rename/delete conversations;
  - B1: per-position TP/SL grants; the acceptance runner's dry run is 22 done, 0 failed;
  - A3: on-chain revoke on raise and in revoke-all, device-side grant checks, real pause reads, the $100/$200-a-week Face ID rule, practice-mode allowlist.
- **Lead fixes:**
  - Turnkey email trust (`161ade6`);
  - the wallet ↔ delegation package cycle that broke turbo (`44c49f5`): the test moved to `integrations/delegation/test/device-checks.test.ts`;
  - the app.ts merge of A5's reminder ticker with B2's token lookup.
- **Builds:** EAS iOS `91bd583e` (auto-submit `41ed9031`) and an Android APK, both from `c8ec5c54`.
- **Builders now:**
  - A: desktop leftovers, then plan gaps in assets/Home/Markets/token/swap;
  - A3: practice message, then plan gaps in safety/automations/Activity;
  - A5: Block, For-you cards, contacts on other chains;
  - B1: manual close disables grants, executable Aero LP + Merkl, two-step bring-in, then relayed gas for its flows.

**Next for the lead:**
- once the api with B2's fixes is live, tell Abu to fund the ops wallet and relayer, then run `pnpm --filter @kawase/api exec tsx test/mainnet-acceptance.ts --live --skip-openai`;
- turn on `DEVICE_PROOF_REQUIRED` after the new build is installed;
- Circle KYB domain; demo video and submission (deadline 10-10).

## Active repair — 2026-10-02

Abu requested a round-off and continuation by Claude Code because Codex credit is nearly exhausted. The full handoff is `design/CLAUDE-CODE-HANDOFF-2026-10-02.md`; the approved plan is `design/MOBILE-QUALITY-IMPLEMENTATION-2026-10-02.md`. All A–U deliverables remain required. API 998f0b2 and worker 63629f2 are healthy; web 13b5deb deployed healthy. TestFlight **1.0.0 (5)** source 13b5deb finished building and submission efe2a4b8-36be-432a-8399-c8f8271406ed returned FINISHED; Apple availability/device acceptance is unverified. Native signed Release 13b5deb verified onboarding, French language/panel preservation, primary guest continuation and guest chat/compact composer. Keyboard/Stop/gesture/device checks remain open. Audio foundation, persistent switches, race tests and four synthetic GPT-Live fixtures are in the local round-off commit, **not pushed/deployed or included in build 5**. Expo Doctor 21/21 and pods pass; its native rebuild is next. No production voice selected; financial paraphrasing, phone useful latency, listening, cost and provider retention remain open. All three Coolify auto-deploy flags were restored true and services healthy. Exact evidence: `design/review-evidence/2026-10-02/repair-delivery.json`. Continue from the handoff; do not call these repairs the complete product.

## Current stage
**Stage 6 — trading, tokens, bridge, yield** (`stages/06-trading-tokens-bridge-yield.md`): 6a swap, 6b bridge, 6c earn done on testnet; arbitrary tokens/token rules, executing non-CCTP routes and mainnet runs stay open. **Stage 8a (scheduled automations, grant-bounded, unattended) done too; next 8b.** Stages 4–5 are live (agent, sends, requests, inbox); the Lime on Ink revamp (D34/D35) is the design system every new surface uses.

## Next action
00000. **2026-10-01 night (latest).** **Stage 10 voice deployed** (worker `kawase-voice` on Coolify; production e2e passes). **Android/Google Play set up** (`deploy/android.md`): EAS project `@abu.dev/kawase`, `eas.json` (preview APK, production .aab with remote versionCode, submit → Play **internal** track), public config in EAS environments, upload keystore generated on EAS, `.easignore` (archive 71.5 MB → ~6 MB of source), unused permissions blocked; Android copy says "fingerprint or screen lock", never Face ID (`43cd1aa`). The first EAS builds were queued on the free tier at the time of writing — check `eas build:list -p android`. Abu has a Play Console account: the first .aab goes up by hand (Play API limit), then `eas submit -p android --latest`; production needs a 12-tester × 14-day closed test (new personal account), so judges use internal testing or the APK. iPhone: `pnpm --filter @kawase/mobile phone:ios` once Abu's Apple ID is in Xcode. **Voice latency:** the wallet line (balance/allowance answers ~1–1.5 s to first words). **Next:** an Android run on a device, then Stage 9 push/email → Stage 7 x402 → 5c → 11–16; K05/K07 from the review.
0000. **2026-10-01 late.** **Stage 6a — swap — done** (`stages/06-…md` progress log, ARCHITECTURE "As built for swaps"): USDC ↔ EURC through App Kit with the kit's calls captured and checked, then signed by the wallet as **one** EIP-7702 batch (one Face ID); screen, chat card, agent tool, fan action, one "Swapped" activity row; verified by `apps/api/test/swap-testnet.test.ts` and on the simulator with Turnkey + Face ID (`0x4d95…ae39`). **Review Pass 3:** R14/R15 done by one fork (report in), R13/R16 done in code by the other fork, which stopped at the usage limit before reporting; Claude checked it (tsc, eslint, fan and voice overlay on the simulator) and recorded it in `design/REVIEW-RESOLUTION-2026-10-01.md`. The api test script now runs files one at a time (`--test-concurrency=1`): testnet tests share the relayer and ops wallets; the relayer account also got viem's `nonceManager` so concurrent sign-ups never race for a nonce. **6b bridge done the same day** (Arc → Base/Ethereum/Arbitrum/Optimism/Polygon/Avalanche testnets through App Kit's CCTP forwarder, one Face ID, three-step tracking checked on the destination chain, live route comparison with LI.FI/Relay/deBridge/Across facts; device bridges to Base Sepolia and, from chat, Arbitrum Sepolia). The local Docker Postgres died when the Mac's disk filled (ENOSPC, 2026-10-01 ~11:00): restart it with `docker start deploy-postgres-1`; Claude cleared npm/pnpm-metadata/Xcode module caches. **6c earn done the same day** (App Kit Earn: deposit/withdraw/positions on Arc testnet's mock Morpho vaults, one Face ID each, home Earn row, chat). The ops wallet was refilled from Circle's faucet (it had 0.73 USDC left after the testnet runs; drip = 20 USDC + 20 EURC, `POST /v1/faucet/drips` with the TEST key). **Stage 8a done the same day** (`stages/08-…md`): "every day at 14:05 send 0.05 dollars to Bob" in chat → card → Face ID signs the automation's grant (pinned recipient, per-period cap on chain) → it ran by itself at 14:05; exactly-once runs, on-chain cap skips, lifecycle with revoke. **8b Auto-save done too:** "keep 5 dollars in my wallet and save the rest" → one Face ID signs three grants that only move USDC between the wallet and the person's own vault position → it saves above the line, tops up below it, and wakes when money arrives (simulator: saved 7.387205 USDC by itself, `0xb7db…8d65`). **Then J10's review (`plan/reviews/2026-10-01-*`) and Abu's automation breadth:** K01 runs recover from interruption; K02 the model says what actually happened (and can list/pause/cancel automations); K03 drafts survive sign-in/setup/fixes; K04 `CAPABILITY_SCOPE`; K06 readable vaults; and **rules** — balance above/below or money in → bridge to own address (fee bounded on chain) / save / alert. **The current, per-area truth is `plan/COVERAGE.md`** (update it with every slice). **Stage 10 voice has started** (`stages/10-voice.md`): the pipeline runs end to end locally — phone (WebRTC) → LiveKit → worker → the same agent turn as chat → speech and cards. **Next:** deploy the worker, latency and web voice, then Stage 9 (push/email — which also unlocks the attended "Needs you" flow for rules that send, swap or act on price), Stage 7 (x402), 5c leftovers, 11–16; K05 (editable limits, practice) and K07 (bridge provider marks) remain from the review.
000. **2026-10-01 night.** Stage 5a + 5b done and verified (two real accounts: phone requester, web payer; web onboarding with the email-code approval end to end). Review Pass 1–2 done; web pass done. **Order from here (deadline 2026-10-10):** review Pass 3 (R13–R16) in two forks in parallel with Stage 6 (swap/bridge via App Kit with the wallet-signs-each-step strategy from spike 3) → Stage 8 (automations on delegated grants, the standout) → Stage 10 (voice, D5) → Stage 9 (push/email) → Stage 7 (x402 with a testnet demo seller) → 5c leftovers (limits UI, QR scan, batch/split, business) → 11–16. Test inboxes: mail.tm was down; Guerrilla Mail works with Turnkey (`gmcode` in the session scratchpad helper). Metro needs `NODE_OPTIONS=--max-old-space-size=8192`.
00. **Codex mobile UX review (`plan/design/MOBILE-UX-REVIEW-CODEX-2026-10-01.md`), tracked in `plan/design/REVIEW-RESOLUTION-2026-10-01.md`.** Pass 1 (R01–R06, R08, R17) fixed and run on the simulator: offline keeps the account, scope shown before the allowance approval, only an explicit device approval signs, activity per network (and a React Compiler memo bug in the activity store fixed), revoke recovery, web /welcome 200, send drafts corrected, chat sends inside the allowance with no extra tap (D33, documented in DESIGN.md). **Next: Pass 2** — R07 (durable optional steps, continue the initiating action after sign-in), R09 (home by state), R10 (story panels that explain), R11 (interruptible carousel), R12 (promise only what works: Request in the fan/home is still a "coming" toast) — then Pass 3 (R13–R16: accessibility, RTL dock, chat scroll, provenance of the faucet label) and Pass 4 (evidence matrix).
0. **Stage 5a — send with real execution (2026-10-01, see `stages/05-…md` "Build order" and ARCHITECTURE §5 "As built for sends").** Done: migration `0005` (contacts, versioned addresses, trust, intents, drafts, approvals, spend ledger), `packages/policy` (`evaluateSend`), `packages/intents` (`SendDraft` + EIP-712 hash, states), api `/contacts`, `/recipients`, `/sends` (draft → approve → allowance redeem by the ops DCW or a wallet-signed transfer → receipt witness → tracker), the agent's `propose_send` + `find_contacts`, the chat send card, and `apps/api/test/send-testnet.test.ts` passing on Arc testnet (allowance send `0x29f83575…b9e3`, wallet send `0x04f48abc…8335`, double tap → one send, address change freezes, unknown name resumes after saving the contact, tampered signature refused). Then the app: `/send`, `/contacts`, the add-contact sheet, the chat send card, contact names in Activity, strings in all ten catalogs; three real sends from the simulator (screen, chat with resolve-and-resume, EURC with Face ID). **Next:** web sign-in (judges reach Kawase on the web, D10), then 5b (payment requests + share link + `/r/[token]`, the chain-watcher for incoming payments) and 5c (limits UI, batch/split, QR scan, device contacts, business basics).
1. **Audit + Phase C done (2026-10-01, see the long entry at the end of `stages/03-core-platform.md`).** Abu asked to check what was built against the plan, UI, design direction, flows and motion included. Nine gaps were found and closed with real backends: the fund hub (Circle's testnet faucet API as the drip — verified 20 USDC + 20 EURC), real activity from ArcScan (Recent, the Activity tab, receipts), the story onboarding at `/welcome` with M01 motion, the sign-in sheet (email code, Apple, Google), the onboarding bar with the language pill on every onboarding page, the automatic setup stepper + Face ID primer (real biometric check) + completion with the authority receipt, the full settings hub with honest "Coming" rows, Wallet & limits with hold-to-confirm revoke. Run once on the simulator against the local api and Arc testnet.
2. **Building the simulator app:** `ios.entitlements` now has Sign in with Apple, so `expo run:ios` refuses without a signing certificate. Build with `xcodebuild -workspace apps/mobile/ios/Kawase.xcworkspace -scheme Kawase -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<udid>' CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO build`, then `xcrun simctl install` and open `xyz.kawase.app://expo-development-client/?url=http%3A%2F%2F<lan-ip>%3A8081`. Native modules added this session: `expo-local-authentication`, `expo-haptics`.
3. **Stage 4 first slice is live (2026-10-01, see `stages/04-…md`):** the agent (gpt-5.6-luna through the D29 registry) with seven tools on real backends, persisted threads, generative cards in the Chat tab, deployed with `OPENAI_API_KEY` on Coolify. **Next: Stage 5 — send with real execution** (intents + drafts + `policy.evaluate()`, the allowance redeem by the ops DCW, contacts and @handle resolution, the send screens and the agent's send tool together), then web sign-in (the Turnkey web kit; judges reach the product on the web, D10), then the rest in stage order.
4. Open from this pass: Apple and Google sign-in not yet run on a device (need an Apple ID on the simulator and a Google login — Abu, or Codex with the browser), Android, the web run of the new screens, first steps 5–6, fee reserve + banners (Stage 11).
5. **Commit/deploy:** everything is pushed to `main`; the live api runs it (migrations `0002`–`0004` apply on start). The web app (`kawase-web`) has not been redeployed with the new screens.
6. Still open from Stage 1: #5 voice (Abu's phone), #12 x402 and the mainnet halves of #2, #4/#15, #13 (wait for Circle's mainnet approval).

## Stage checklist
- [ ] 0 Bootstrap: resume protocol ✅ · monorepo scaffold ✅ · Coolify project + Postgres ✅ · private repo Blockchain-Oracle/kawase ✅ · kickoff transcript ✅ · first commit pushed ✅ · Coolify deploy key ✅ (GitHub App optional later)
- [ ] 1 Day-1 spikes: #3 ✅ testnet (re-run with the new wallet in #16) · #4 ✅ testnet (caveats carry over; account setup replaced by #15) · #6 ✅ · #7 ✅ · #8 ✅ (iOS + web; Android not run) · #9 ✅ iOS (Android via EAS pending) · #10 ✅ (iOS + web) · #11 ✅ partial · #13 ✅ Circle testnet · #14 ✅ · **#15 ✅ testnet (7702 limits)** · **#16 ✅ iOS simulator + testnet (Turnkey wallet, 9/9; passkey half waits for the domain)** · #1 closed and #2 superseded (D33) · #5 ☐ (real phone) · #12 ☐ (mainnet)
- [ ] 2 Design system and component sourcing: direction C, Koe ✅ (2026-09-30) → **superseded by Lime on Ink (D35), being rebuilt in the revamp** · · `DESIGN.md` ✅ · `packages/ui-tokens` ✅ · 11 components in `ui-web` ✅ · fonts ✅ · `packages/ui-native` with 13 twins ✅ · gallery on iOS + web ✅ · `21st review` clean ✅ · Android ☐
- [ ] 3 Core platform: networks ✅ money ✅ config ✅ env ✅ log ✅ db ✅ api ✅ (live, `https://kawase-api.84.46.247.92.sslip.io`) · app client ✅ · i18n + RTL ✅ (10 catalogs) · story/sign-in sheet/handle/setup/completion/settings hub/limits ✅ (Lime on Ink, simulator) · web ✅ (live, `https://kawase.84.46.247.92.sslip.io`; new screens not yet run on web) · faucet ✅ (Circle's drip) · activity ✅ (ArcScan) · executor/chain-watcher shells ☐ · audit writer ☐ · web sign-in ☐
- [ ] 4 Agent brain, resolve and resume, chat: agent + 7 real tools + threads + cards in the Chat tab ✅ · intents/policy/resume (with Stage 5) ☐ · memory, risk dial ☐ · web chat run ☐
- [ ] 5 Money movement, contacts, business basics
- [ ] 6 Trading, tokens, bridge, yield: 6a swap USDC ↔ EURC (one Face ID, screen + chat) ✅ testnet · 6b bridge Arc → 6 chains via CCTP forwarder + route comparison ✅ testnet · 6c earn (App Kit Earn, Morpho vaults: deposit/withdraw/positions) ✅ testnet · tokens/token rules/prices ☐
- [ ] 7 Marketplace (x402)
- [ ] 8 Automations and delegated authority: 8a scheduled sends (grant-bounded, unattended, lifecycle) ✅ testnet · 8b Auto-save ✅ · rules (balance/money-in → bridge/save/alert) ✅ testnet · send/swap/price rules, templates ☐ · 8c practice/DBOS/editing ☐
- [ ] 9 Notifications and channels
- [ ] 10 Voice
- [ ] 11 Onboarding and trust layer
- [ ] 12 History, reporting, privacy
- [ ] 13 Desktop
- [ ] 14 Docs site
- [ ] 15 Landing / showcase and judge kit
- [ ] 16 Production hardening and submission (deadline **2026-10-10 11:59 PM ET**)

## Spike results
- **Wallet change (D33, 2026-09-30):** the Circle PIN wallet is gone. The user's wallet is a Turnkey-held EOA; the agent's limits are EIP-7702 + MetaMask delegations on that same account; Circle keeps the agent's own wallets and the rest of the platform. `packages/integrations/delegation` runs the whole design on Arc testnet through its own functions: **12/12** (`pnpm --filter @kawase/integrations-delegation test:arc-testnet`): relayed setup of an empty wallet, allowance grant with a decoded receipt, spend inside the cap, over-cap refused, automation grant pinned to one recipient, a grant edited after signing refused, revoke. Spike #1 closed (`spikes/01-ucw-rn-sdk.md`); #2, #3, #4 carry superseded notes.
- #15 EIP-7702 limits (added 2026-09-30): **testnet PASS 13/13**. An ordinary EOA delegates to MetaMask's `EIP7702StatelessDeleGator`; the agent's ops wallet then spends from the user's own account inside an on-chain period cap with no user prompt; over-cap, other methods, native value and post-revoke all fail; revoke is one direct transaction; an empty wallet can be set up through a relayer. The wallet vendor becomes a free choice — `spikes/15-eip7702-limits.md`
- #13 Webhooks: **PASS for Circle on testnet**, through a real Coolify deploy (deploy key, Dockerfile, port + `https://` sslip.io domain at creation). Signed `transactions.outbound` (DCW) and `transactions.inbound` (UCW) arrive on ARC-TESTNET; Circle retries a failed delivery in 1–3 s with the same `notificationId`; dedupe held (2 deliveries, 1 side effect); order is not guaranteed. **Services on alpine must listen on `::`** (Coolify's health check uses `localhost` → `::1`). Open: LIVE. (Telegram was dropped with D31) — `spikes/13-webhooks.md`
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
- **Turnkey**: set up by Codex on 2026-09-30 (ids in `.env`, API key in the root `.env`). Still open: a card on file (25 free signatures a month, 4 used by spike 16), and the passkey domain (`EXPO_PUBLIC_PASSKEY_RP_ID` + association files).
- **A real domain for passkeys** (a passkey is tied to its domain for life). Email-code sign-up works without it.
- **Git source for Coolify: done with a deploy key** (Abu, 2026-09-30: "lets continue lol why wait for me"). Coolify key `kawase-deploy-key` (`qfzygvoehtclwstqsjcviqwm`), added read-only to `Blockchain-Oracle/kawase`. A GitHub App can replace it later if Abu wants push auto-deploy and Watch Paths without a webhook.
- **Repo pushed:** first commit `be83488` on `main` (2026-09-30). `.env` is git-ignored and the commit was scanned for secrets first.
- **Circle LIVE: approved and set up 2026-10-02 evening** (see "Evening 10-02" above; the entity secret is registered, the ops wallet and relayer are created and waiting for gas USDC). The history below is kept for context.
- Circle **TEST: ready** ✅ (API key, App ID fetched, entity secret recovered from `_archive/arc-treasury-intelligence/.env` and proven by creating the `kawase-testnet` wallet set). Circle **LIVE (as of 09-30): not approved yet.** Abu has applied and is awaiting Circle's verification (he said "approved" on 2026-09-30, then corrected it the same day: he was mistaken). The LIVE key returns 403 Forbidden on every Wallets endpoint, which is expected until approval (last check 2026-09-30; TEST returns 200). Nothing for Abu to do but wait. Once approved: re-run the 403 check, then set the LIVE entity secret (`CIRCLE_LIVE_ENTITY_SECRET` is empty) and fetch the LIVE App ID. Waiting behind it: #2 LIVE, the #4 mainnet $1 run, #12, #13 LIVE. (Circle bills MAW, first 1,000 wallets free; Gas Station charges gas + 5%.) OpenAI ✅ (same key in agari/keeperhubv2/stocklana; default gpt-5.6-luna tool-calls correctly).
- Security note 2026-09-29: the Circle TEST entity secret was accidentally printed in the session transcript (a broken macOS sed mask). Low risk (testnet); Abu may rotate via the Circle console using the recovery file from arc-treasury-intelligence. ✅ Received and verified 2026-09-29: API_KEY_21ST, LiveKit Cloud (URL/key/secret), ElevenLabs (TTS + STT work; its voices-list permission is off, which is fine).
- **Telegram and Discord are out of scope (D31, 2026-09-30).** Notifications are the in-app inbox, push and email. No bot token is needed.
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
