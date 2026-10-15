# Kawase build status

Purpose: the resume point. A new session reads memory, then this file, then the current stage file.
Last updated: 2026-10-15 ~13:45 WAT (OPEN LIST at the top is the single to-do; plan breezy-puzzling-starfish)

## OPEN LIST — one place for everything still owed (rebuilt 10-15 ~13:45 WAT from every round below)

Deadline 10-17 11:59 PM ET (Sun 10-18 04:59 WAT). Ordered by priority; tick only with live evidence.

**Now (in flight)**
1. [ ] Abu's mainnet wallet setup lands (account 01a13ed0…, wallet 0x53fD9a…; relayer funded 6.98 USDC) → then the
       mainnet test: a real swap, a send, the agent's long/short in chat, a paid x402 call (Abu's money; he approves).
2. [ ] iOS build 23 built locally (13:42, Privy-only JS embedded, production channel, runtime 1.0.0), uploaded with
       `eas submit` and processed ("Ready to Submit", internal groups). Apple allows one 1.0.0 build in Beta App Review
       at a time, so 21 stays in review; once 21 is approved, add 23 to Public beta (later builds of an approved version
       usually pass at once). Until then a fresh install of 21 runs today's JS from its second launch (OTA).
       Public link https://testflight.apple.com/join/PD3fgXZx.
3. [x] api deploy of the relayer watch + 3 s drain: 239 of 240 half-second probes 200 through the swap (one dropped
       connection), against 15–30 s of 502 before; /health shows `relayers: {testnet: ok, mainnet: ok}`.

**Needs Abu's call**
- [ ] Mainnet wallet history ("All money", the weekly report) reads Alchemy first, then the explorer. Alchemy's free
      monthly quota is spent (429), and explorer.arc.io answers 403 behind Cloudflare's bot check ("Just a moment…"),
      which Kawase must not dodge. So mainnet history is empty until one of: a new/paid Alchemy key (Abu's account),
      or Blockscout's keyed API. Kawase's own timeline (its database) is unaffected. The screen now says so honestly.

**Verify (built, not yet seen live)**
4. [x] Agent wallet redesign seen signed in on prod (Abu's session in the pane, viewing only): hero, spent-today bar,
       cells, Almost empty, top-up, rules, categories, empty Spending. Fixed from it: "asks for Face ID once" (wrong
       on the web) → "asks you to confirm once"; the card button truncated → "Buy with Apple Pay or card".
5. [ ] Apple sign-in on iOS through the web flow, on Abu's iPhone via iPhone Mirroring (stop at Apple's page).
6. [ ] The 1 crash TestFlight logged on build 21 (Xcode Organizer → Crashes).
7. [ ] Native Markets on testnet: "Switch to mainnet" has its button (10-14 open item; fixed on web).

**Build (owed from earlier rounds)**
8. [ ] Sweep checklist on every screen, signed in, phone + desktop (STATUS sweep rules below).
9. [x] The + fan's first open (10-14 "~1 s"): measured on the live web in a fresh tab, no long task, worst frame 17 ms.
       Native: check on the device pass (item 12).
10. [ ] RouteList polish (10-14). Venue honesty exists: rows carry `executable`, the best route is chosen among
       executable rows only, and quoted-but-not-executable venues sit under "Also checked" with their reason.
       Found in the sweep: Swap/Bridge hid the quote when the balance was short (now quoted for any amount, so you see
       what it gets before Add money); the phone pill's "Balanc…" line dropped (the pad shows the balance + Max).
11. [ ] Dev-mode run with tx hashes: bridge, send, earn (10-15 morning).
12. [ ] Real-device pass on Abu's iPhone (iPhone Mirroring; phone-harness optional).

**Submission**
13. [ ] README "Where it stands" refreshed with the mainnet evidence; docs check.
14. [ ] Demo script + video.
15. [ ] Secret scan of the whole history (gitleaks) → ask Abu → repo public.
16. [ ] Submit with a 2 h buffer.

Done today and checked live (details in the rounds below): Turnkey out; Apple sign-in on the web; voice picker hello
(seen live: greeting arrives); voice over pushed pages; Marketplace entry + links; Markets retry + deploy 502 cause;
Long or short on testnet; relayer funded; public TestFlight group submitted.

## 2026-10-15 — Abu's signed-in review (Privy, @ajweb3)

Live: web `c8e3963e` (app.getkawase.xyz/version.txt), api `c8e3963e` (deploy `wo9i7xkb…`). Plan: `~/.claude/plans/breezy-puzzling-starfish.md`.

- **Setup stuck at step 2 (Privy web):** `useEmbeddedWallet` only matched `walletClientType === "privy"`; Privy's newer
  enclave wallets are `privy-v2`, so no signer, so the auto-run never fired. Both types match now (the user's own wallet
  address breaks a tie). An 8 s watchdog turns a missing signer into "Your wallet didn't connect" + Retry and posts a
  `signerMissing` client event. Not yet confirmed with Abu's real sign-in.
- **Mainnet "couldn't load your wallets" / margin 500s:** rpc.mainnet.arc.io rate limits + Alchemy quota spent →
  `arcTransport` falls back across Blockdaemon, dRPC, QuickNode, then Alchemy (`c85be4ec`).
- **Add money drawer** split the window and didn't close on outside clicks: Fund/Buy/Sign-in providers sat above the sheet
  layer. A root `SheetPortalProvider layer="apart"` + `<SheetLayer/>` inside the three providers.
- **Swap/Bridge select-first:** ticket alone until there is an amount; race column only when the page fits both
  (`TWO_COLUMNS_MIN`); Bridge = From/To `TicketPill`s + flip + chain picker sheet; "To whom" after a chain.
- **Receipt slip** (`receipt/receipt-slip.tsx`, Senryo's trade slip): brand, hanko, facts, perforated stub, QR to the
  explorer, theme-following on the page and in the shared image; Why shows it first + "Sent by" with Save.
- **Feed:** held long/short reads "Short cirBTC with 10 USDC"; trending row has the token logo and "+x% today · $y liquidity".
- **Activity:** borderless report panel, Kawase timeline on plates, open positions first.
- **Long/Short live:** api `LiveTicker` (Coinbase public WS; Pyth Hermes now needs a key) → `GET /markets/live/prices`
  NDJSON; terminal tabs/hero/chart head and Markets → Long/Short rows move live; Long/Short plates per market. Chart
  range follows the candles; far levels (2× liquidation) pinned to the edge with an arrow (no more squashed candles).
- **Voice:** measured 0.6 s session + 2.0 s join + 2.4 s greeting (`apps/voice-agent/test/join-latency.ts`). Code
  preloads and a session is minted at idle (free; dispatch happens on join); `/threads` hides empty threads.
- **Small:** compact rail network capsule fits (bare), ticket header Testnet chip readable, EAS channels added.
- **Builds:** EAS free plan is out of iOS builds until 11-01 → iOS built locally (`eas build --local`) then `eas submit`;
  Android preview APK `30b900fe` queued on EAS.
- **Still open:** Abu's Privy sign-in to confirm setup + mainnet; agent long/short tried live in chat; a dev-mode
  bridge/send/earn tx run; README/docs (Turnkey → Privy); demo video; repo public (ask first).

### 10-15 midday — second round (live web `dfe9e8d9`)

Abu's notes, all built and checked on the dev build or production:
- **Run card (Home + chat):** a Done/failed chip, the token pair's marks, venue marks on the fold, and a receipt ledger
  (You paid / You got with marks, via + venue mark), with View on ArcScan, Share (the themed slip) and Open swap.
  Venues that didn't quote fold into greyed breadcrumbs.
- **Failure card:** a calm plate, "No money moved" shown as a shield chip; an expired-while-blocked intent shows its
  real fix.
- **Chat composer:** Home's look (為替 mark, live mini orb, raised). The action chips now respond (insert on press-in).
- **Connect at the end:** Swap and Bridge on a phone show "You get ≈ X via <venue> · best of N" under the amount, guests
  included; "Sign in to swap/bridge" comes only at the end. The token picker opens on "Popular on Arc".
- **Activity:** received money is on the timeline; This week leads with P&L + % + a sparkline; detail sheets have
  marks and padding, and say From for money that came in. The feed restores from the device on a cold open.
- **Receipt slip:** a wide ticket from 600 px (stub beside), the asset mark by the amount.
- **Token page:** the logo beside the name; BasedBot/DexScreener/ArcScan pills under the chart; desktop action row +
  ticket drawer (no empty column); More as grouped icon tiles with real disabled states. The Live chart draws from
  on-chain trades when history (GeckoTerminal, ~10 calls/min) is busy.
- **Long/Short:** a "Long or short" board atop Markets (mainnet markets for every session) with Owarine-style live
  lines vs the hour's open; the ticket uses leverage chips, a 3-cell strip and folded TP/SL; the phone sheet has a live
  mini chart; prices come from the api's Coinbase ticker relay (`/markets/live/prices`).
- **Builds:** iOS built locally (EAS free plan out of iOS builds until 11-01) and submitted (`42b1c9eb`); it carries
  the `production` channel, so `eas update --channel production` ships JS to it. Android preview APK `30b900fe`.

### 10-15 evening — third round (Abu's list, open until each is checked live)

Turnkey goes completely (Abu: no patches, nothing kept behind), and nothing Turnkey did is lost; each capability maps
to Privy or to our own api:
- [x] Turnkey out of api, client, db, env, wallet package, app, tests, docs (DB reset done 10-15; live fd1616bb).
- [x] Web owner's check: an emailed code again (our api + Resend), as the buttons say ("…with an email code").
- [x] Sign out a device / everywhere: that device's Privy session (`sid`) is refused from then on.
- [x] Device proof (M12) on the web too, signed by the Privy wallet.
- [x] Apple sign-in: Services ID xyz.kawase.app.signin (auth.privy.io + Privy callback), key N6866U8F33; Abu pasted
      the signing key 10-15 and Privy reports apple_oauth on. Live web: "Continue with Apple" reaches Apple's own
      page for "Kawase sign-in" with our client id and Privy's callback (Claude stops there; Abu signs in). iOS uses
      the web flow on the same client id (APPLE_WEB_FLOW); [ ] check it on the simulator.

UI and agent, from Abu's screenshots:
- [x] Composer chips above the field do nothing on click (the blur closed the composer first).
- [x] Sign-in modal centred on the window, not the content beside the sidebar.
- [x] "What Kawase can do" tiles do nothing when tapped.
- [x] Desktop: a typed-chat door beside "Talk to Kawase" (voice); both reachable directly.
- [x] Voice agent: "list the marketplace" finds nothing while "DeFi Llama" finds 31.
- [x] Languages carry no flag (a language is not a country); display currencies do carry flags.
- [x] Receive flashes "Set up your wallet" before the address.
- [x] Add money rows reshuffle while opening.
- [x] Feed items dismissible (held → cancel, found → dismiss; swipe on a phone, × on the web; done money is not).
- [x] Marketplace: in the main navigation (desktop), every service's logo, a narrower category column, recently
      called tools; Try-it: "Pay 0.001 USDC" with the USDC mark in one button that fits, a neutral top-up plate.
      Phone: still reached from Markets and the agent wallet.
- [x] Budget ring "$0 of $200" centred; token page Buy/Sell icon + label centred.
- [x] Apple Pay / Google Pay marks readable on dark plates.
- [x] Display currency with flags (circle-flags 2.8.0, MIT, in packages/identity with provenance).
- [x] Voice picker: a speaker on each voice chooses it and opens voice mode, where Kawase says hello in it live
      (session `greet`; five of the six voices exist only in GPT-Live, so no recordings). Found on the way: a waiting
      session kept the old voice for 5 min after a change (now dropped on save), and on a phone voice opened under
      pushed pages (Chat, Settings) because the overlay lived in the tabs; it now sits above every page. fc1a4c13.
      Checked live 10-15: the speaker opens voice and the hello arrives (mic blocked in the test browser, so the
      fallback voice spoke; with a microphone GPT-Live speaks in the chosen voice).
- [x] Agent wallet page past mediocre (bd64bf5a: hero balance, today's spend against the daily budget, Gateway and
      on-hand cells, two columns on desktop). [ ] check signed in (dev mode).
- [ ] Test on mainnet production, not only the local testnet api.
- [x] Markets on testnet: "Kawase is having trouble / Couldn't load markets" (Abu 10-15). Root causes, measured:
      (1) every api deploy answered ~15–30 s of 502 with no CORS header: Coolify's rolling update stops the old
      container while the proxy still routes to it, and the api closed its port on SIGTERM while open live-market
      streams kept it alive until Docker killed it (~38 s). The api now serves 3 s more, then ends every connection
      and exits (3.6 s, tested locally). (2) The screen showed its error after one failed read and nothing retried:
      now two quiet retries, and a good poll clears it. (3) Found on the way: /margin/markets and the launchpad
      curve answered for the session's network over the one asked, so a testnet guest's Long or short board was
      empty and a mainnet token's curve missing; the asked network now wins (margin test covers it).
- [ ] Discoverability (skill run 10-15): on a phone the Marketplace is three taps deep under a chip called
      "Services" (Markets → Services → See all) or behind Settings → Agent wallet's empty history. Fix: a
      Marketplace entry with real logos on Markets, a Marketplace row in Settings beside Agent wallet, and every
      tool named in a chat card or in the agent wallet's history opens that tool (the api now sends `tool`).
- [ ] Mainnet wallet setup (Abu, 10-15): /wallet/setup/request answers 503 network_not_ready because Kawase's mainnet
      relayer 0x18fb4f6679dcb927Ef70b3B9Be8B0440e7836b78 (sponsors every setup and gas-free send) holds 0 USDC (min
      0.05). Abu funded both 10-15 ~13:40 WAT: relayer 6.98 USDC, ops 0x2afa6cb26f360adecbd8a014030a8aff17ae8b3b
      (gas for budgeted agent actions) 2.98 USDC. [ ] his setup lands on prod (watching); later: a log/health line
      when a relayer runs low (~1 cent a setup, so 7 USDC ≈ 700 setups).
- [ ] Real-device testing on Abu's iPhone through macOS iPhone Mirroring (computer use), not only the simulator:
      Apple/Google sign-in on a real Apple account (Claude stops at the provider's own page), device-only bugs. Look
      at github.com/ShawnPana/phone-harness for a skill that sets this up (no separate harness agent; Claude Code
      only). Note: EAS free plan's iOS builds are used up until Nov 1, so new iOS binaries are local builds
      (`eas build --local`); JS ships by OTA to TestFlight build 19 (production channel). The old simulator build
      had no channel (fixed in eas.json for the next one) so it ran 10-14 JS with native Apple sign-in.
- [x] Public TestFlight (10-15): external group "Public beta" with build 21, submitted to Beta App Review (contact
      and feedback: Blockchainoracle.dev@gmail.com; no sign-in needed, guests "Look around"). Public link, open to
      anyone once the build is approved: https://testflight.apple.com/join/PD3fgXZx. Later JS reaches it by OTA.
      [ ] TestFlight shows 1 crash on build 21 (Abu's iPhone 17 Pro, iOS 27.2): read it.
- [ ] (was) Public TestFlight: an external group with a public link (Beta App Review once per version; JS ships by EAS
      Update without review). Lower priority than working features and the web (Abu, 10-15).

**Sweep checklist (run on every screen before calling a round done):** every token/venue/chain/person shows its mark;
anything that can't be done looks disabled and says why; empty pickers and lists offer something; loading is the
content's own shape and never a block that later vanishes; a guest sees quotes and figures before any sign-in; a
desktop window uses its width (no empty columns); every action has an icon; no chip stretches in a column; copy
never contradicts itself (one cause per failure).

## 2026-10-14 — revamp underway (deadline 10-17 11:59 PM ET = Sun 10-18 04:59 WAT)

**The plan:** `/Users/abu/.claude/plans/compressed-dreaming-yao.md`. Decisions D37–D43 are in `context/08-product-research/DECISIONS-FROM-ABU.md`. Research is in `plan/research/2026-10-14/`, docs packs per lane in `plan/docs-packs/`.

**Stage 0 (lead) done on main:**
- Salvage merges `a08e`, `a835`, `a48b`, `affd`, `a276`. Conflicts resolved by keeping both sides. affd's `0078_blocks` was re-stamped to `when` 1791000103000.
- Shared base `909b9f2f`:
  - six i18n namespaces ×10 languages;
  - the `RouteQuote`/`RouteRace` type;
  - the `prompt-budget.ts` hook;
  - a native batch (react-native-webview 13.16.1, Privy expo/react-auth/node, Coinbase cdp-sdk, Inter + Roboto Condensed);
  - Expo 57 patch updates and an expo-constants pin to 57.0.21;
  - expo-doctor 21/21, typecheck 31/31.
- Not merged (left in their worktrees): a48b's "relayed gas" WIP (the budget design supersedes it) and affd's "contacts on other chains" WIP (the Routes lane finishes it in Stage 3).
- Keys from Codex #1 are in `.env`: Privy (app id, secret, client id), Uniswap, 0x. Codex #2 (Coinbase CDP + Circle KYB read) and #3 (Resend) briefs are in `plan/prompts/`.
- Local Postgres: OrbStack had stopped. Started `deploy-postgres-1` (5433).

**Afternoon:**
- Business removal is merged and reconciled with the salvage (`2689e86e`; migration 0090 re-stamped after 0078; all 56 migrations apply to a fresh DB). It is pushed and deployed: the api applied the migrations, and web returns 404 at /business. Docs and landing were redeployed.
- A session restart stopped Stage 2 and 2b mid-build. All work was saved on the lane branches `lane/{look,budget,routes,buy-market,wallet,front-door,desktop}-s2`. Budget's and Look's uncommitted work, lost by a force-remove, was replayed from the agent transcripts (see memory never-force-remove-worktrees).
- **Running:** resume workflow `wf_26527e44-8e8`, script at the session scratchpad `stage2-resume.js`. It runs 7 lanes, all Opus, builder → reviewer → fixer. Each continues from its branch after `git merge main`. To resume after another restart: `Workflow({scriptPath, resumeFromRunId: "wf_26527e44-8e8"})`, after saving any loose worktree work one lane at a time.
- Coinbase CDP keys are in `.env` (Codex #2): trial is 25 tx × $5. Circle shows bank transfer before KYB once the domain is registered: Codex brief `plan/prompts/codex-2026-10-14-circle-domain.md`. Resend (Codex #3) is still pending.

**Night (lead works directly: no workflows or background agents, per Abu):**
- Stage 3 lanes were stopped by a restart. Each lane's loose work was saved one at a time, then I reviewed and merged all 7 myself (`lane/*-s3`).
  - Checks: typecheck 31/31, lint 31/31, i18n 5/5, 61 migrations on a throwaway native Postgres. OrbStack stays stopped.
  - 14 stale worktrees were removed (no --force).
- Fixed after reviewing live (in-app browser + iOS Simulator):
  - budget migration 0101 re-stamped (Drizzle would have skipped it);
  - App Kit gets 12 s in a race;
  - light-first theme: migration 0102 (users default light, old dark default moved);
  - composer: Enter sends on web; at rest it fills the row; "Tell Kawase what to do";
  - a guest can look around mainnet;
  - TokenMark remembers logos (Home trending and drafts were showing lettered discs); Kawase's demo seller gets the Kawase mark;
  - brand: icon, splash, Android and favicon are a black tile, white 為替, magenta ring.
- Verified in production: the welcome story; guest Home; "swap 2 USDC to EURC" races 6 venues → App Kit → a one-tap Sign in that resumes; RouteList with logos; Markets + Services; the + fan; the native app on the iPhone 17 Pro simulator.
- Builds: TestFlight 12 (`74f56eca`, Turnkey sign-in). Queued: TestFlight 13 (`aec92e84`) and simulator (`94c591e8`) with all fixes. api and web deploys are queued at HEAD.
- Open:
  - Privy proof needs the Codex #5 test accounts, then flip EXPO_PUBLIC_WALLET_PROVIDER;
  - native Markets "switch to mainnet" card has no button;
  - the + fan's first open takes ~1 s;
  - landing/docs still carry the old lime brand;
  - mainnet funding + acceptance run (Friday);
  - repo public, demo video, submission.

**Owner:** run the Codex #2 and #3 briefs; back up `~/.kawase-secrets`; fund mainnet ops and relayer by Friday.

**10-14 late — Abu's live review, acted on (commits 95fa3b00 → 889bb66f):**
- The + is back as it was before Stage 3 (quiet glass circle at the trailing edge, actions rising in a column) and the
  voice orb is back in the dock's centre. Lesson saved in memory: keep-what-abu-liked.
- Home's composer is Senryo's launcher: a capsule beside the + in the dock's material, words that walk through what
  Kawase can do, the mic inside, tucked behind the dock while reading down and back on scroll up; tapped, a calm
  typing bar. The shared composer (Chat) lost its glow and ringed voice button.
- Live markets: the api reads DexScreener (Arc = "arc", 5 s fresh, 30 tokens a call) for Markets rows, token pages and
  portfolio values; GeckoTerminal keeps candles, served stale or retried, never "no price history". Token pages poll
  every 5 s (Live pip, 5 m change, buys/sells), lists every 8 s, the 1H/1D line follows the live price. Heat map gone.
- Mainnet "not available": a new guest never learned the available networks (fixed in session-provider).
- Sounds are Senryo's kit at Senryo's levels; the old recorded placeholders are gone.
- **Dev mode** for end-to-end testing (local only): `EXPO_PUBLIC_WALLET_PROVIDER=dev` against an api with
  `KAWASE_DEV_AUTH=true` (refused in production and beside mainnet). Any `@kawase.test` email, any code; a throwaway
  testnet key in the browser signs the api's nonce and is the wallet; approvals pass by themselves.
  - Run it: throwaway Postgres in `.dev-pg/` (port 55432, dbs kawase_dev + kawase_dbos, `db:migrate`), the api with
    `NODE_ENV=development PORT=3000 MAINNET_ENABLED=false KAWASE_DEV_AUTH=true DATABASE_URL=… DBOS_SYSTEM_DATABASE_URL=… npx tsx src/main.ts`,
    the web as a static export (`EXPO_PUBLIC_WALLET_PROVIDER=dev EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo export --platform web --clear`)
    served by `server/web.cjs` (`.claude/launch.json` "kawase-web-dev"). The Expo dev server OOMs at 4 GB; the export doesn't.
  - Verified with it on Arc testnet: sign-up → 7702 setup → weekly budget step → first job on Home (faucet) → swap
    2 USDC → EURC inside the budget with no slide and no prompt → contact → send → scheduled send on → Arabic.
- Found and fixed with it: the agent's weekly budget was never bound in app.ts (every step asked); setup still offered
  the old 5,000 USDC/day any-recipient allowance (now the budget step); the first job opened old Chat (now Home);
  Send redesigned (search first, one row of Paste · Scan · Add contact, the review names the person, a new address is
  said once, the budget's verdict replaces the old allowance line); text fields drew a square magenta focus ring;
  Settings cut the budget value off; drafted automations appeared off-screen; Bridge chain names were cut off.
- Builds: TestFlight 15 `a5d0f5eb` (submitted), simulator `5703e0bf` (checked on the iPhone 17 Pro simulator: new
  splash, + fan, orb dock, composer riding the keyboard). Coolify deploys are slow: agari-box is out of RAM and swap
  during a web build (memory: coolify-skill-and-live-server-first).
- Later the same evening:
  - Bridge: chain picker as two columns of whole names; hero figure in cents beside its symbol; USDC/EURC get
    Circle's mark on any chain. Verified Arc testnet → Base Sepolia over CCTP in dev mode.
  - Add money → From a wallet (A6, web): EIP-6963 browser wallets pay USDC on Arc into Kawase, every state drawn.
  - Markets rows show one fact (market cap, else volume) and flash up/down when a refresh moves the price.
  - The agent now gets the budget's numbers every turn (budgetSummary was never filled), and a "ready" step inside
    the budget is described as going ahead.
  - Privy: `app.getkawase.xyz/?wallet=privy` tries Privy in that browser; the api accepts Privy and Turnkey
    (WALLET_PROVIDER=privy on Coolify). Privy's allowed domains include app.getkawase.xyz and localhost:8081.
    Needs one real sign-in (Abu or the Codex #5 test account), then flip EXPO_PUBLIC_WALLET_PROVIDER for everyone.
    Why it matters: Turnkey's free plan (25 signatures a month) was used up on 10-03.
  - Charts: GeckoTerminal 429s at 20 calls/min; back to 9 with a minute's back-off, 5-minute snapshots, warmed day
    charts, 503 instead of 500.
  - Landing and docs use the new mark; Arabic hero arrow; Face ID reason and notification colour updated.
- Still open: RouteList polish; Privy proof and flip; mainnet funding and acceptance run; README (stale, 10-03);
  repo public; demo video; submission.

**10-14 night — production unblocked:**
- Abu's live try failed on Turnkey's quota (429 "Signing is disabled … over its allotted quota") because app.getkawase.xyz
  still served the 13:34 UTC build `0ec04289`; two later web builds had been cancelled on the starved agari-box
  (8 GB RAM, swap full, disk 97%).
- **Web now ships from the Mac:** `apps/mobile/scripts/publish-web.sh` exports with `deploy/web.public.env` and rsyncs to
  agari-box `/data/kawase-web/releases/<sha>` (a link into Docker volume `jq8rxr24…-kawase-web-releases`, mounted at
  `/srv`); kawase-web builds `apps/mobile/Dockerfile.prebuilt` (the Node server only, ~1 min). Check
  `https://app.getkawase.xyz/version.txt` after every publish.
- **Privy is the web default** (`EXPO_PUBLIC_WALLET_PROVIDER=privy`); verified live: no override, Privy's embedded-wallet
  frame loads, no Turnkey calls. `apps/api/test/privy-signer.live.ts`: an app-owned Privy wallet behind `privySigner`
  signs the 7702 setup and the relayer lands it on Arc testnet (`0x5e7c89bb…`, delegated), message and transaction
  signatures recover, an unlimited grant is refused. A Turnkey-era account signing in with the same email keeps its
  account; the Turnkey wallet is retired and the Privy one registered (`registerUserWallet`).
- The desktop rail scrolls between its pinned header and footer.
- Still Turnkey: the native builds (EAS env), so the next TestFlight/APK needs `EXPO_PUBLIC_WALLET_PROVIDER=privy`.
- **Voice runs on LiveKit Cloud** (agent `CA_QF67rYjca7Hy`, eu-central; free Build plan: 1,000 agent minutes, 5
  concurrent, 10–20 s cold start). On agari-box its job processes were OOM-killed. Deploy:
  `apps/voice-agent/scripts/deploy-livekit.sh` (stages the worker + config/money/networks, `Dockerfile.livekit`).
  Secrets (OPENAI_API_KEY, ELEVENLABS_API_KEY, KAWASE_API_URL) via `lk agent update-secrets`. The Coolify voice app is
  stopped. A session with no live microphone starts on the pipeline engine (typed text + TTS); GPT-Live can't answer
  typed requests without audio.
- **Voice mode redesigned:** full screen, a fluid magenta orb (web WebGL + native Skia, same shader), live captions
  (Kawase's answer large), "Try saying" chips that send typed text into the session, one round dock (type, mute, stop,
  End). Verified live on the web: the pipeline greets and captions.
- **Live markets:** `apps/api/src/market/live.ts` subscribes once to every Uniswap v2/v3/v4 Swap log on Arc mainnet
  (`wss://rpc.mainnet.arc.io`; v4 PoolManager `0x8366…0951`) and decodes trades for watched pools;
  `GET /markets/live?tokens=` streams NDJSON (snapshot of the last ~30 min, then trades). Prices match DexScreener to
  4 digits (`apps/api/test/live-swaps.live.ts`). The token page opens on Live; Markets/Home rows take each trade.
  Token pages link to BasedBot, DexScreener and Arc's explorer ("Look closer").
- Composer hint no longer spills; mic is a mini live orb; a fade under Home's bottom controls; handle field has one
  ring; the phone header is avatar · solid network chip · Sign in. Web publishes reload in place (SIGHUP, no 502s).
- **First load halved:** tree-shaken web exports, LiveKit and the dev pages load on demand, Turnkey's web kit is stubbed
  out of Privy builds, and one language loads (not ten). Initial script ~3.6 MB gzipped (was ~6.8).
- Prices: `$0.0₄2606` notation; compact money on phones (Hermes has no compact Intl).
- **Verified tonight:**
  - web: voice mode live (pipeline greets, a typed suggestion runs);
  - iOS simulator build `8963346c`: Privy sign-in sheet, voice mode (race card + spoken answer), Live token chart, rows
    flashing per trade;
  - dev mode on Arc testnet: "swap 1 USDC to EURC" on Home → race → done inside the budget with no prompt (1.231845
    EURC, receipt + explorer), budget ring $23 of $200.
- **Builds:** TestFlight 19 (`3e223970`, auto-submitted), APK `619f5486`, web `a99d260f`.
- **Waiting on Abu:** one real Privy sign-in (no attempt in the api logs yet); mainnet funding by Friday.
- **The plan now:** `/Users/abu/.claude/plans/breezy-puzzling-starfish.md`: the open parts of `compressed-dreaming-yao.md`
  merged with Abu's 10-14 design review (voice mode, composer, live markets with on-chain ticks, BasedBot links, logos,
  lime purge, mobile header), in order A money path → B voice → C composer → D live markets → E sweep → F mainnet/submit.

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
