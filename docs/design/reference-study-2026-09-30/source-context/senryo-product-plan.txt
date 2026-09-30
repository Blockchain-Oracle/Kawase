# Plan: Senryo 千両, a mobile-first RWA + crypto trading app with a Kinpaku card (Monad Metropolis, Track 01)

## 0. Context
- **What we're building:** Monad's Metropolis hackathon entry for **Track 01, Onchain Finance & Trading**. Submission deadline **14 Oct 03:59 UTC**. **Registration and team formation close 6 Oct 23:59 UTC** (the user does this in the portal).
- **Why this product:** research (`context/06-research`, `07-decision`) shows:
  - RWA perps are the fastest-growing onchain category;
  - Monad has no RWA venue with real liquidity (LeverUp lists 50 RWA pairs, but they route to Hyperliquid with $0 volume);
  - a card on the same collateral makes it a daily-use app.
- **The pitch leads with what is new** (the originality criterion asks "…or is it a faster clone?"): **one risk-accounted balance spanning our gold/silver engine, Perpl crypto perps and a card**, where the same dollar can never be spent twice. The pool engine is a means, not the headline.
- **Product:** one account (Face ID passkey via Mera) and one risk-accounted balance. From it the user can:
  - trade **gold and silver perps** on our own pool engine;
  - trade **crypto perps on Perpl**;
  - fund from **any chain** (Aurora Intents);
  - spend with a card that only uses collateral their positions haven't committed.
- **Target bounties** (each fit-checked against the official text in `context/07-decision/track-and-bounty-fit.md`):
  - Agora Mobile Trading **$10K**: Mera + AUSD + trades via Perpl;
  - Mera-Powered UX **$2.5K**;
  - Aurora Intents **$5K**;
  - Envio **$1K**.
- **Research base:** `context/**` (portal capture, integrations, UX, naming, Coolify, card routes), `references/**` (cloned SDKs), `design/**` (the D2 Desk preview and screenshots).
- **The repo is currently empty.** This plan runs from bootstrap to submission. Stage S0 transcribes this file into the user's `docs/plan/` system, so it survives context clears.

### User rules (binding on every stage)
- **Plan mode only when the user asks.**
- **Tests are not a deliverable.** Only targeted money/security checks; **no UI tests** (an invariant enforces this).
- **UI comes from 21st.dev:** `21st search` → preview → `get` → `add` → re-tokenize, using skills `21st-cli-use`, `21st-ui-build` and `21st-ui-review`. Never invent a component when a curated one exists.
- **Read the official docs before using any tool** (Context7, `references/`).
- **Code quality:**
  - constants, never magic numbers;
  - reusable code;
  - files ≤ 400 lines;
  - pnpm only;
  - integer base units for money.
- **Architect for performance.** Deadlines never justify a mediocre choice. Competition is irrelevant. Don't block yourself: when there's an obstacle, research the route.
- **Deploy on the user's Coolify.** Every server change, deploy, money spend, or outbound sponsor message needs the user's **explicit OK at that moment** (marked **[OK?]** below).
- **Secrets** are never printed or committed.
- **Product, not demo:**
  - onboarding;
  - a starter-funds claim;
  - an iOS feel (haptics, sound, native motion);
  - honest loading, empty and error states.

## 1. Decisions (locked unless the user changes them at approval)
| # | Area | Decision | Evidence |
|---|---|---|---|
| D-001 | Track | Track 01. The card stays subordinate to trading in the first screen, demo and pitch. | codex-evaluation §4 |
| D-002 | Bounties | Agora Mobile, Mera UX, Aurora, Envio. Every other bounty is rejected with a reason. | track-and-bounty-fit.md |
| D-003 | Brand | **Senryo 千両** (app) and **Kinpaku 金箔** (card). Mark: a square seal with 千. Domain **senryo.app** is the rpId; availability to be confirmed at purchase. | 09-product/naming.md |
| D-004 | Design | **D2 Desk.** Pro terminal. Palette `#000`, `#0c0c0d`, hairline `#26272d`, green `#2fe92b`, yellow `#fbfb0f`, down `#ff4d4d`, destructive `#ff5102`, with a light alternate. Fonts: Inter plus JetBrains Mono (tabular numbers). 4 px radius, 120–200 ms motion, "nothing bounces". | design/DIRECTIONS.md |
| D-005 | RWA engine | Our own **LP-pool-as-counterparty** perp engine (GMX-style), at the oracle price. **Gold (XAU) and silver (XAG) first.** FX only once Chainlink Data Streams are available; push FX feeds are too coarse (±15 bp deviation). Tokenized equities are shown as "coming soon". | contracts design; deep-dive-rwa-perps |
| D-006 | Oracle | Chainlink push feeds on Monad mainnet (XAU/USD `0x61dD33A34E47a181EE02e42eE0546a3DA808f1B4`, XAG/USD `0x29bEb7e730f09D33417357dbed020B549fdF7db4`; 8 dec, 3,600 s heartbeat, 0.05% deviation), read in-transaction. **No caller-supplied prices and no signer keys.** Testnet uses a `MirrorAggregator` (no XAU feed exists on 10143). Pyth isn't used for execution at launch (paid). A Pyth trial is one upgrade route in D-020. | chainlink-cre.md |
| D-007 | Accounts | Mera 0.2.0 EOAs. Derivation frozen: PRF → BIP-39 → `m/44'/60'/0'/0/0`. The session policy is our own code. No Privy, Dynamic, or custody backend. | mera.md |
| D-008 | Network | Our contracts go to testnet first, then **mainnet (the demo network)** with low caps. Perpl, Aurora, Laso and XAU are mainnet-only in practice. Testnet is kept for the Immersve sandbox. Every surface is labelled with its network. | agora-ausd-and-perpl §1.6 |
| D-009 | Collateral | AUSD (primary) and USDC (small haircut). Aurora lands USDC, and the Connect recipe calls `depositFor(USDC, {MIN_AMOUNT_OUT}, user)`, crediting USDC as collateral. A recipe can't chain a swap into a deposit, because amounts are opaque. The in-app **Swap** (Uniswap v4, D-021) converts USDC↔AUSD on demand; the Agora flow uses AUSD. **Testnet:** we deploy `MockAUSD` + `MockUSDC` with a practice faucet, because the real testnet AUSD faucet is empty. | aurora-intents.md §5; agora §1.6 |
| D-010 | Perpl | The user's own EOA trades Perpl directly (Path B `execOrder`; Path A API/TP-SL comes later). Perpl equity shows as a fourth bucket, **"In Perpl"**, and is **not** counted in Free to spend (no lien, and Perpl has its own liquidations). Moving funds vault ↔ Perpl is a one-tap action. | contracts design §2.6 |
| D-011 | Web | Next.js 16 **static export** served by nginx on the apex rpId. It serves `.well-known` (AASA and assetlinks) and reuses the 21st D2 components directly. Expo web is not used. | client design §0 |
| D-012 | Mobile | Expo SDK 57 **dev builds** (iOS 18+, Android 9+). **NativeTabs + Liquid Glass at the bottom** (iOS feel), with the D2 top strip as the header. Skia charts via victory-native. The Agari kit is ported. | client design |
| D-013 | Backend | TypeScript on Node 24 with **Fastify** (raw-body HMAC, websockets, rate-limit). Three containers from one image: `card` (latency-critical), `api` (routes + the Aurora key proxy + WS fan-out), and `keeper` (D-035). Postgres ledger. | contracts design §4 |
| D-014 | Indexer | Envio HyperIndex **V3**, **self-hosted** on Coolify, indexing 143 and 10143. Perpl is filtered in handlers. Aggregates are computed in handlers. Display only: the card authorization path never reads the indexer. | envio.md |
| D-015 | Card | Three honest routes: (a) the **Immersve** public sandbox on testnet; (b) the **Lithic ASA** sandbox, "hold-before-approve", with an envelope fallback and p50/p99 measured; (c) a **Laso** real prepaid card via x402. Labelled "Sandbox card" and "Prepaid card (real)". No company is needed. A UK Ltd plus Rain/Immersve live comes later. | company-and-real-integrations.md |
| D-016 | Hosting | Coolify. Images are built in GitHub Actions and pushed to GHCR. Auto Deploy is off. A deploy counts only when the container is healthy and a smoke request passes. | deployment-coolify.md |
| D-017 | Distribution | Web live link, Android APK (EAS internal), iOS **TestFlight internal** (judges added as App Store Connect users). No public App Store release (Apple 3.1.5(iv)). | platforms-and-stores.md |
| D-018 | Tests | Foundry invariant/fuzz on the core. Oracle scenario checks. One mainnet fork test. A card-concurrency check. Session-policy scope checks. A latency harness. Nothing else. | user rule |
| D-019 | License | MIT, plus `THIRD_PARTY_NOTICES.md`. The ported Agari kit is disclosed as pre-existing (rules §4.1), and AI tool use is disclosed in the README. | rules.md |
| D-020 | Price data | **Measured 29 Sep:** Chainlink XAU/USD on Monad updates every ~1–18 min (≈6 min average; 0.05% deviation). Execution stays on Chainlink push: free, no signer key, spread ≥ the deviation. The engine reads prices through a pluggable `IPriceSource`, so a pull oracle can drop in. **Routes to a live price:** (1) Chainlink Data Streams credentials via the Chainlink DevRel mentor (Darb), since Router/Verifier are already on Monad; (2) Pyth Core pull with a free trial (Metals plan $2,500/mo after), a pattern LeverUp already proves on Monad; (3) Stork. **UI honesty:** the ticket shows "Oracle price · updated 3m ago". Charts use Envio-indexed oracle rounds plus our fills; no fabricated ticks. | cast reads of rounds; pyth-and-oracles.md; company-and-real-integrations.md |
| D-021 | Swap | USDC↔AUSD on **Uniswap v4 Monad** (docs.uniswap.org, 29 Sep): PoolManager `0x188d586ddcf52439676ca21a244753fa19f9ea8e`, Quoter `0xa222dd357a9076d1091ed6aa2e16c9742dd26891`, StateView `0x77395f3b2e73ae90843717371294fa97cc419d64`, Universal Router 2.1.2 `0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`. Pool: AUSD/USDC 0.005% (~$3.9M). The pool key is read onchain in S3. | Uniswap docs |
| D-022 | Traction and GTM | This is a workstream, not an afterthought: Founder & Market Readiness is 25% and Traction 20%. Named first user: crypto holders in emerging markets who want gold exposure and daily spending without selling. Recruit real testers (TestFlight, APK, web). Capture metrics from the indexer (users, trades, volume, TTFT) on a public `/stats` page. Collect tester quotes. Keep a waitlist on the web landing. Post portal progress updates. | track criteria (portal) |
| D-023 | Compliance posture | Geofence new risk for Perpl's blocked list (BY, CU, GB, IR, KP, RU, SY, UA, US) plus sanctioned jurisdictions, by IP on web/api and an app-side check. Risk-disclosure sheet before the first leveraged trade. Terms, privacy and risk pages on web and docs (a privacy URL is needed for TestFlight external if ever used). "Cash-settled perps; no ownership of the underlying" copy. | rules §2.2; platforms-and-stores.md |
| D-024 | Assurance before mainnet | Static analysis is not tests: Slither + Aderyn, and Ackee **Wake** detectors (per `03-sponsors/infra-data/ack3-security.md`), run on `contracts/`. Findings are fixed or documented, plus a `security-review` skill pass on services before the S8 mainnet deploy. ack3's scan is a winner or finalist prize. | ack3-security.md |
| D-025 | Observability | pino structured logs in services, with per-stage card latency samples in Postgres. Health endpoints and a daily ops check. Optional Sentry (free tier) for mobile, web and api **[OK?]** account. The Envio `unattributedFills` counter is the Perpl-ordering alarm. | contracts design §4 |
| D-026 | iOS requirement | An Apple Developer membership is **required** for iOS passkeys: Associated Domains and a Team ID in AASA are unverified on free teams. Without it, iOS falls back to the web app, and Android APK + web still ship. | mera.md; platforms-and-stores.md |
| D-028 | Face ID per trade | The user's explicit requirement is Face ID to confirm transactions. Setting **"Confirm every trade with Face ID" defaults to ON**. Native uses a local biometric gate (a SecureStore-gated read, no passkey sheet), taking ~0.3 s during the 500 ms hold. Web asks for a passkey assertion per trade. The Mera signing session still holds the key, so there's no passkey ceremony per trade. Turning the setting off gives the scoped prompt-free session, which is the Mera criterion. The demo shows both. | user; mera.md §5.2 |
| D-029 | Onboarding (one prompt) | With no local hint, the primary button is **Create account** (one passkey ceremony) and the secondary is **I already have an account** (discoverable get). With a hint, sign-in is primary. S6 measures prompts per authenticator (iCloud, Google Password Manager, 1Password) and records them. If create shows 2 prompts, explain with copy between them and report it honestly. | Mera bounty text; mera.md §8 |
| D-030 | Starter funds and gas | **Practice mode (testnet, clearly labelled):** one tap claims mock AUSD plus testnet MON, relayed by the sponsor, so the user needs no gas. **Mainnet:** a sponsor-relayed claim (the user signs EIP-712 `Claim`, `StarterDrip.claimFor` submits it) gives a **gas-only** MON drip, plus AUSD only by **voucher code** (judges and testers; ≥ 12 AUSD so the Perpl 10 AUSD minimum is reachable). **Auto gas top-up** when MON drops below a floor, capped per address per day, with an "Out of gas" blocker copy. A 7702 sponsorship spike is the Mera composability bonus. | mera.md §0.6; agora §1.6; differences §2 |
| D-031 | Watch-only + judge access | "View an account" (address or share link) shows a read-only portfolio, positions and history, for judges who are geo-blocked from Perpl (US/UK) or whose authenticator lacks PRF. The judge guide lists: live trading regions, a pre-funded demo account path, the watch link, and the demo video as proof of the Perpl trade. | Agora deliverable; mera.md §4 |
| D-032 | Card safety | The card operator can place holds **only within a user-signed (Face ID) EIP-712 spend allowance** (daily limit + expiry), verified onchain in `CardModule`. A compromised server can't exceed what the user granted. The allowance applies to the Lithic route. Immersve is funded by a step-up top-up, and Laso by a withdrawal. The Lithic mainnet mode is release-only (**see D-036**, which supersedes the earlier "testnet only" line). | reviewer D4; codex §A |
| D-033 | Mobile UI source | 21st.dev components are React DOM. For mobile, every component is an **RN port of the chosen 21st design** (search 21st first). Each custom RN piece (keypad, leverage detents, gauge, execution trace, session chip, hold button) records its 21st source item in `apps/mobile/.21st/design.json`. Nothing is invented from scratch. | user rule |
| D-034 | Product completeness | Added screens and features:<br>• **withdraw / send / cash-out** (Aurora Swap API to another chain) and **LP redeem**;<br>• **TP/SL trigger orders** on our engine (a `TriggerOrders` module executed by keepers at oracle crossing), plus Perpl TP/SL via Path A;<br>• **price alerts** (UI, table, keeper);<br>• **help/support** (FAQ + contact);<br>• **delete my data** (local + encrypted prefs blob);<br>• **i18n-ready copy** (English first; ES/PT if tester communities need it);<br>• a "Gold market closed" weekend first-run state.<br>Recovery: passkey sync + a second-passkey vault first; a 24-word export only under Settings → Advanced ("export to another wallet"). | reviewer C |
| D-035 | Keepers and ops | `services/keeper` is its own container: liquidations (permissionless anyway), triggers, alerts, sweeps, observe pokes, gas top-ups, relay. Ops alerts go to the user's Telegram/email **[OK?]** channel when the keeper stalls or a wallet is below floor. The Postgres ledger gets a daily `pg_dump` **[OK?]** schedule. | reviewer D5 |
| D-036 | One balance is real on mainnet | The Lithic sandbox card runs against the **mainnet core in "release-only" mode**: holds really encumber the user's mainnet balance live (Free to trade drops while the hold exists), and clearing **releases** instead of capturing, so no funds move. It's labelled "Sandbox card · no charge". Real captures happen only in practice (testnet) and on the Laso route. Pitch wording: *"the same dollar backs your gold position or your card, never both; your Perpl crypto sits in the same account, one tap away."* This supersedes D-032's "testnet only" line. | trace audit §2 |
| D-037 | Face ID default (refines D-028) | **Practice mode:** per-trade Face ID OFF (the prompt-free scoped session is shown, which is the Mera criterion). **Mainnet:** Face ID ON for every trade above `FACE_ID_TRADE_THRESHOLD_USD` and for every card allowance change; below it, the scoped session applies. User-adjustable, including "every trade". TTFT is measured in practice mode, from landing to the first **user-signed, confirmed** transaction (the relayed claim). **Confirm at approval.** | trace audit §2; user ask |
| D-038 | Geo policy (refines D-023) | **Practice mode is never geo-gated** (testnet, no value), so every judge can use the full product apart from Perpl. **Mainnet trading** (our engine and Perpl) is gated for sanctioned jurisdictions plus Perpl's list (Perpl enforces its own). Deposits and withdrawals of the user's own funds are never gated. `GET /v1/geo` sits behind the blocker chain. **Confirm at approval.** | trace audit F90/F95 |
| D-039 | Missing contract primitives | Added to `SenryoCore`:<br>• `withdraw` to the user's own EOA is session-scoped (no step-up); any other destination needs step-up. Vault → Perpl is withdraw-to-self followed by the user's `approve` + `depositCollateral`, with the policy classifying the pair as a "move".<br>• `CollateralSwapper` adapter: `swapCollateral(tokenIn, amountIn, minOut)` through the allowlisted Uniswap v4 Universal Router, risk-checked, emitting `CollateralSwapped`.<br>• `repayCardDebt` + `CardDebtRepaid`.<br>• `VoucherRedeemed` (StarterDrip credits the core via `depositFor`).<br>• `TriggerPlaced/Cancelled/Executed` (TP/SL only; no resting limit orders).<br>• `Freeze` is offchain (Lithic PAUSE) plus an optional onchain allowance revoke.<br>• LP `Deposit`/`RedeemRequested`/`Redeemed` events. | trace audit table |
| D-040 | Missing services and indexer pieces | **api routes:**<br>• `/v1/geo`, `/v1/status` (aggregator), `/v1/config` (min app version, feature flags)<br>• `/v1/prefs` (encrypted blob; untrusted), `/v1/vault` (second-passkey vault JSON, signed)<br>• `/v1/alerts` + `price_alerts` table<br>• `/v1/card/*` (allowance helpers, freeze, PAN reveal via Lithic embed URL, **simulate a swipe** for demos)<br>• `/v1/events` (first-party analytics) + `events` table<br>• Live Activity push tokens + an **[OK?]** APNs key<br>• `push_tokens` with plaintext per-channel flags<br>**Other services:** `aurora_deposits` table + a status-poller job (resume across restarts/devices via `listExecutions`, recovery of an `OPERATION_FAILED` intermediary); keeper `healthWatch` (a warning push on each oracle round).<br>**Indexer:** `OracleRound` + `Candle` (Chainlink aggregator `AnswerUpdated`, following aggregator changes), `CollateralMove`, `FundingAccrual`, `Trigger`, `CardDebt`, `Allowance`, `Voucher`, inbox USDC/AUSD `Transfer` (dynamic registration), LP events, and Perpl `PositionLiquidated` for app users. | trace audit table |
| D-041 | Wallet connectivity | **Mera signs everything.** External wallets fund by **QR / address only** (no wallet connector; wagmi stays banned). A **"Monad" deposit family** shows `inboxOf(user)` and accepts AUSD/USDC sent from any Monad wallet, because Aurora's "EVM" address resolves to Base and would lose a Monad send. Idle AUSD/USDC in the user's own EOA triggers a "Move to Senryo" prompt. There's no fiat on-ramp at launch; the zero-funds mainnet user gets a "Try practice" CTA, stated honestly. | trace audit §1 |
| D-042 | Card demo | A `card/simulate` screen (Lithic simulate API; sandbox only) lets anyone trigger a real authorization, which is the demo path. Foreign-currency authorizations use `cardholder_amount` × an FX buffer constant (`FX_BUFFER_BPS`), with a capture tolerance. | trace audit F31 |
| D-027 | Verified infra facts (29 Sep) | `eth_sendRawTransactionSync` exists on `rpc.monad.xyz` (it returns a tx error, not "method not found"), so the card service can use it, with a fallback of `eth_sendRawTransaction` + WS receipt. Live block time ≈ 302 ms. | curl probes |

## 2. Architecture
```
Mobile (Expo, native)  ┐                           ┌─ Monad mainnet: SenryoCore · SessionOracle · LpVault · StarterDrip
Web (Next static, rpId)┴─ packages/account (Mera) ─┤    · IntentRouter · InboxFactory  +  Perpl Exchange  +  AUSD/USDC
                          packages/chain (viem)    └─ Monad testnet: same + MirrorAggregator (Immersve sandbox)
        │  REST/WS                                  ▲ Chainlink XAU/XAG feeds
services/api (Fastify: markets, account, starter/voucher relay, Aurora proxy, Perpl proxy/fan-out, push, alerts)
services/card (Fastify: Lithic ASA webhook → Postgres reserve → SenryoCore.placeHold (within user allowance) → finalized → APPROVE)
services/keeper (liquidations, TP/SL triggers, observe pokes, inbox sweeps, hold expiry, gas top-ups, testnet mirror relay, ops alerts)
indexer (Envio V3 self-hosted: Postgres + Hasura) ── polled by api → per-address WS deltas to apps
```

### 2.1 Contracts (`contracts/`, Foundry 1.8.x, solc 0.8.31, `evm_version = "osaka"`, `network = "monad"`, OZ 5)
- **SenryoCore** is one deployed unit built from module files, each ≤ 400 lines:
  - **Modules:** `AccountLedger`, `CollateralConfig`, `RiskModule`, `MarketRegistry`, `MarketAccounting`, `PerpModule`, `CardModule`, `LiquidationModule`, `AdminModule`.
  - **Libraries:** `PerpMath`, `Constants`, `Types`, `Errors`, `Events`.
  - **Internal accounts:** POOL, INSURANCE and CARD_FLOAT. Because everything shares one storage space with one lock and one nonce, "the same dollar is never spendable twice" is a single-contract invariant.
- **Separate contracts:**
  - `SessionOracle` + `MarketCalendar`: clamp, circuit, 3-round confirm, reopen window, weekly 15-minute slot bitmap (DST-union), holiday windows.
  - `LpVault`: ERC-4626 on AUSD, with delayed redeem, redeem blocked unless all markets are OPEN, a virtual-share offset, and dead-address seed shares.
  - `StarterDrip`: `claimFor(user, sig)` relayed by the sponsor (the user needs no gas); one claim per address; voucher redemption; onchain daily cap.
  - `TriggerOrders` (module in the core): user-signed TP/SL, executed by any keeper when the oracle crosses.
  - Testnet only: `MockAUSD` / `MockUSDC` with a practice faucet.
  - `IntentRouter`: EIP-712 `OpenOrder`, `depositAndOpen`. An invalid order never reverts the deposit.
  - `InboxFactory`/`DepositInbox`: Aurora persistent-address sweeps.
  - `AccessManager`: Safe 2-of-3 admin; `PARAM_ADMIN` risk increases are timelocked; `GUARDIAN` gets risk-reducing actions only, and every pause auto-expires; `CARD_OPERATOR` gets bounded hold/capture only.
  - `MirrorAggregator`: testnet only; the script asserts `chainid != 143`.
  - `SessionKeyDelegate` (7702): optional bonus.
- **Units:** `usd6` (1e6 = $1), prices and sizes at 1e18, `BPS = 1e4`. Rounding always goes against the account (OZ `mulDiv` with an explicit direction).
- **Risk equations** (codex §C + contracts design §2):
  - `E_init = C_adj + Σmin(uPnL,0) − Σmax(F,0) − cardDebt`
  - `FreeToTrade = E_init − ΣIM − max(envelope, holds) − BUFFER`
  - `FreeToSpend = FreeToTrade + max(envelope − holds, 0)`
  - Liquidatable iff `E_liq < ΣMM`, where `E_liq` counts full uPnL/funding and holds as senior liabilities.
  - Positive uPnL is never spendable before it's realised.
- **Pool economics:**
  - Spread ≥ the feed's deviation band, plus age and impact components (the depth filter).
  - Per-position profit cap; reserve ≤ 80% of pool cash.
  - OI, skew and trade caps as bps of the pool.
  - Skew funding; utilisation borrow fee.
  - Fees split between pool and insurance.
  - Liquidation waterfall: close → card debt (senior) → pool → liquidator fee (capped) → insurance → socialised to LPs.
- **Stale-price exposure** (the feed updates every ~6 min): spread ≥ the feed's deviation band, plus an age spread; a **minimum hold of `MIN_HOLD_BLOCKS`** before closing at a profit (anti-flash); per-trade and skew caps. Two-step next-round execution was rejected because of UX latency; revisit if a pull feed arrives (D-020).
- **Status matrix** (OPEN / REOPENING / CLOSED / STALE / CIRCUIT / HALTED):
  - Only OPEN allows new risk or liquidation.
  - Every other status is reduce-only.
  - When closed: 2× initial margin plus a widening spread.
  - The feed is only ever ratified by a timelocked `acceptFeedPrice()`; nobody injects a price.
- **Events are Envio-friendly** (`address indexed user`): `Deposited`, `Withdrawn`, **`AccountRiskUpdated`** (emitted on every mutation), `PositionUpdated`, `Liquidated`, `HoldPlaced/Increased/Captured/Released`, `CardRefunded`, `MarketStatusChanged`, `StarterClaimed`.
- **Invariants:**
  - I1: conservation.
  - I2: no double pledge.
  - I3: holds are consistent and captured at most once.
  - I4: the reserve can always pay profits.
  - I5: only liquidation, capture and refund move value between accounts.
  - I6: prices enter only through `SessionOracle.observe`.
- **Monad specifics:**
  - Explicit gas-limit budgets in the shared `GAS_LIMITS` constant, calibrated with `forge snapshot --network monad`.
  - Economic decisions use `finalized`.
  - The sponsor and operator keys keep more than 10 MON.
  - Wait 3 blocks after funding a key.
  - `block.number` for anti-flash checks, never timestamp equality.
  - State history lives ~40k blocks, so everything the UI needs is emitted as an event.
  - Verify via Sourcify `https://sourcify-api-monad.blockvision.org`.
- **Initial constants** go in `script/SeedConstants.sol`; every mainnet use is an **[OK?]**:
  - Seeds: LP 250 AUSD, insurance 50, card float 50 USDC.
  - Starter (D-030): mainnet relayed gas-only drip of 0.3 MON per address, with a daily budget cap; AUSD only via voucher (12 AUSD per judge/tester voucher, capped count); testnet practice claim of mock AUSD + testnet MON.
  - Gold market:
    - 10× max leverage;
    - MM 5%;
    - fee 5 bp;
    - clamp 200 bp;
    - OI cap per side `min($150, 60% of pool)`;
    - max hold $250.

### 2.2 Backend (`services/api`, `services/card`, Node 24, Fastify, Postgres 17)
- **Card authorization** (`services/card`):
  1. Verify the Standard-Webhooks HMAC over the raw body, with ≤ 300 s skew.
  2. Idempotency on UNIQUE `(issuer, txn_token, kind)`.
  3. Take a Postgres advisory lock per account, then reserve against `freeToSpend` read at `finalized`.
  4. Pick an operator key sharded by account, and send `placeHold` with `eth_sendRawTransactionSync` to 2 RPCs.
  5. Decide:
     - finalized before 2,800 ms → APPROVE;
     - otherwise the envelope covers it → APPROVE;
     - otherwise DECLINE and release the hold.
  6. Lifecycle webhooks go through an outbox: capture / increase / release / refund.
  - Every stage is logged. Latency target p50 ≈ 1.2 s, p99 < 2.5 s (Lithic's hard limit is 6 s, 3 s recommended).
- **Other card routes:**
  - Immersve (testnet): SIWE login, then `createFundsStorage` from Funds Manager `0x1754AE802dCcc5bd4fe2d2b42ac01e2AB3552086`. A top-up is a step-up withdrawal.
  - Laso: the user withdraws to their own EOA, Aurora bridges Monad → Base, and the Mera key signs the x402 EIP-3009 payment. No custody.
- **api** routes:
  - `/health`, `/ready`, `/v1/markets`, `/v1/account/:addr` (chain + indexer).
  - Starter drip: SIWE challenge, rate limits per IP /24 and per device, Turnstile on web.
  - Aurora proxy: an allowlist; the server computes the inbox recipient.
  - Perpl: context cache 60 s, one upstream WS fanned out; an encrypted Path-A key blob via HKDF from the PRF.
  - Price/session stream.
  - Expo push, sent only on finalized events and idempotent.
  - Keepers run in `services/keeper` (D-035): `observe` poke, liquidation scan (simulate, then send), TP/SL triggers, hold-expiry release, inbox sweep, gas top-ups, MirrorAggregator relay (testnet), price alerts.
  - Indexer bridge: poll Hasura every 500 ms keyed by `_meta.progressBlock`, push per-address WS deltas, conflate to 100 ms.
- **Postgres tables:** `card_auth`, `holds` (RESERVED → SUBMITTED → ONCHAIN → FINALIZED/CAPTURED/RELEASED), `ledger_entries` (double entry), `outbox`, `operator_nonces`, `starter_claims`, `push_tokens`, `latency_samples`.

### 2.3 Indexer (`indexer/`, self-contained, outside the pnpm workspace)
- **Config:** `address_format: lowercase`, `disable_default_cross_chain: true`, HyperSync `https://monad.hypersync.xyz`. Perpl Exchange `0x34B6552d57a35a1D042CcAe1951BD1C370112a6F`, starting at block 54773010, with `where: block _gte APP_LAUNCH_BLOCK` on noisy events.
- **Entities:**
  - `User` (latest `AccountRiskUpdated` plus cumulative stats), `CollateralBalance`, `Market{venue}`, `Position`, `Fill`, `Liquidation`, `CardHold`/`Capture`/`Refund`, `LpPosition`, `LpPoolDaily`, `OracleStatusEvent`, `PerplAccount`.
  - Aggregates: `UserDailyStats`, `MarketDailyStats`, `ProtocolStats`, `ProtocolDailyStats`.
  - `PerplCursor @internal`. Taker fills carry no accountId, so the cursor pairs each fill with the preceding Position event in the same transaction; `unattributedFills` is the monitoring signal.
- **Rules:** side effects only via `createEffect`. A HyperSync pool-analytics script is the "creative HyperSync" item.

### 2.4 Clients (`apps/mobile`, `apps/web`, shared `packages/*`)
- **Packages and boundaries** (enforced by lint + invariants):
  - `config`: env zod, `CONSTANTS`, routes, network ids. The only place chain ids, URLs and the rpId appear.
  - `contracts`: ABIs and addresses per chain id; generated.
  - `tokens`: D2 tokens → CSS vars and an RN palette.
  - `core`: pure. Bigint money, the risk mirror, market-session calendar, blockers, copy, `Reading<T>` (nothing renders a number without a value, so there's never a fake $0.00).
  - `account`: the Mera island. Passkey `.native`/`.web` via export conditions, HD derivation, `SessionManager` + `Policy` + step-up. **Signs, never sends.**
  - `chain`: viem clients. **The only package that sends transactions.** Explicit gas, lifecycle `submitted → proposed → voted → finalized`, a tx journal.
  - `api-client`: zod-parsed clients for our API, Perpl, Aurora and Envio.
  - `query`: TanStack keys, hooks and mutations, `PriceStore` (one rAF flush per frame, per-subscriber Hz budgets, visible-rows-only subscriptions).
  - No zustand; `useSyncExternalStore` stores.
- **Mobile** (Expo 57, expo-router typedRoutes, React Compiler, Reanimated 4.5, FlashList 2, MMKV, victory-native/Skia, `number-flow-react-native`, `sonner-native`, `expo-haptics`, `expo-audio`, `expo-symbols`, `expo-glass-effect`, `expo-widgets`, `expo-notifications`, `react-native-qrcode-svg`, `@expensify/react-native-wallet` gated behind a flag, and `react-native-passkey@3.6.1` + `@category-labs/mera@0.2.0` exact).
  - **Ported from Agari** (`agari-wt/mobile-takeover/mobile`, pinned SHA): `theme/` structure, haptics (extended to 8 events), `BottomDrawer` (the one sheet), states kit, PullRefresh, audio pool, onboarding mechanics, push/AlertsHost, Live Activity and widget patterns, CreditWelcome, WriteRecovery → TxRecovery, polyfills, metro singletons, eas.json profiles.
- **Web:** Next 16 static export, Tailwind 4, shadcn, and the D2 21st components copied and re-tokenized: Vercel Tabs, Balance Chart, Partition Bar, Segmented Control, Market Watchlist, Market Heatmap, Candle Chart, Slider, Gauge, Task Steps, Credit Card, Ratelimit meter, Multi-chain Swap, QR, Copy, Loading, Skeleton, Empty State, Alert Toast, plus Number Flow, a Hold button, and Sonner.
  - Files over 400 lines are split on install.
  - Add the missing `--chart-up`, `--chart-candle-down` and `--surface` tokens.
  - Desktop gets a 3-column "desk"; phone widths match the D2 preview 1:1.
- **Screens** (same paths on web and mobile):
  - welcome · portfolio · markets · trade/[market] · positions/[id] (+ TP/SL) · orders · activity · alerts
  - card (+ wallet, auth/[id], allowance)
  - fund (+ qr/[family], wallet, swap, deposit/[id]) · **withdraw** (+ send, cash-out to another chain) · **lp** (deposit/redeem)
  - account (+ security, recovery, preferences, notifications, help, delete-data, practice-mode toggle) · status · **watch/[address]** (read-only)
  - Sheets: add-money, step-up, risk-explainer, receipt, session, card-reveal.
- **Session policy** (Mera bounty):
  - **No prompt inside a live session:**
    - orders up to caps **derived from the market's OI cap and the account's balance** (never above either), a session-total cap, a rate cap, and a leverage cap;
    - reduce-only actions have no cap;
    - claim, approve, vault↔Perpl moves and swaps ≤ cap.
  - Notional and leverage are **decoded from calldata**, never trusted from the caller.
  - D-028's per-trade Face ID (default ON) sits on top.
  - **Always Face ID (step-up via a real passkey ceremony):** withdraw or send, reveal the card PAN, export the recovery phrase, raise the card limit, Aurora intent / Perpl key / 7702 signatures, loosening session settings.
  - **Timing:** TTL 30 min, idle 5 min, lock on background (with a privacy plate in the app switcher).
  - The UI shows a session chip, and the ticket survives the lock.
- **Flows** (full step-by-step detail with failure paths goes in `docs/plan/specs/flows.md`):
  1. **First launch:** BrandIntro → 3 pages → **Create account** (primary; one passkey ceremony) or **I already have an account** (discoverable sign-in). With a stored hint, sign-in is primary (D-029). "Look around first" browses Markets without an account.
  2. **Claim starter funds:** practice mode (testnet) claims mock funds; on mainnet, a signed claim is relayed by the sponsor (gas-only), plus a voucher code for AUSD. This is the TTFT moment. The balance rolls up, with CreditWelcome. Wait 3 blocks before the first self-sent transaction.
  3. **First trade:** risk explainer → ticket (keypad, leverage detents, gauge, liq distance, session chip, oracle age) → **500 ms hold-to-confirm** → **Face ID** (per-trade setting ON by default, D-028; otherwise only when the session is locked) → execution trace (signed → risk → sent → proposed PENDING → voted FILLED → finalized SETTLED).
  4. **Perpl first trade:** approve → `createAccount` (≥ 10 AUSD) → IOC `execOrder`, with the price bounded by slippage.
  5. **Card:** Free-to-spend meter, holds, PAN step-up, Add-to-Wallet or manual fallback.
  6. **Deposit:** QR persistent address, or Connect from a wallet (optional `depositAndOpen`), shown as a timeline, with a Live Activity and resumable execution.
  7. **Returning user:** instant cached render, `LOCKED` chip.
  8. **Stateless test:** clear storage → passkey → same address → everything rebuilt from chain, indexer and encrypted prefs.
- **Performance:**
  - Cold start < 1.2 s with cached data.
  - Charts at 60–120 fps (Skia shared values; history path rebuilt only when a candle closes).
  - Price renders capped: hero 4 Hz, watchlist rows 1 Hz and visible only.
  - Web landing ≤ 120 KB JS gz; trade route ≤ 250 KB.
  - Face ID → sent < 700 ms (pre-simulate during the hold).
  - One Perpl WS, one engine WS and one chain WS, multiplexed.
- **iOS feel:**
  - **Haptic map:** tick, press, snap, confirm, filled, warn, fail, liquidation. **Sounds:** fill, deposit, send, unlock, liquidation. Sounds respect the silent switch and have a toggle.
  - **Live Activities:** Order, Deposit, Watch (≤ 8 h, P&L shown as %). **Widgets:** Portfolio, Watchlist.
  - **Push channels:** fills, liquidation (time-sensitive), deposits, card, price alerts.
  - Dynamic Type caps, reduced motion and transparency, VoiceOver labels, deep links on the rpId host.

## 2.5 User flows: the complete catalogue
Each flow becomes a section of `docs/plan/specs/flows.md` with happy path, states, failure paths, copy, feedback and analytics event. Here, "FaceID" means the per-trade biometric gate (D-028) on native or a passkey assertion on web; "step-up" means a full passkey ceremony.

### Personas and end-to-end journeys
| Persona | Journey (flow IDs) | What must feel effortless |
|---|---|---|
| **P1 New, no crypto** (the ICP: emerging-market saver who wants gold) | F01 → F03 → F05(practice) → F10 → F20 → F40 | never sees gas, seed phrases or chain names; practice before real money |
| **P2 Crypto holder on another chain** | F01 → F21 (QR/Connect) → F22 swap → F10 gold → F13 Perpl → F30 card | one QR, funds usable in ~30 s, one balance |
| **P3 Returning daily user** | F02 → F11/F12 manage → F30 card spend → F50 alerts | instant cached open, glanceable Live Activity, no re-login |
| **P4 LP / yield seeker** | F02 → F24 LP deposit → F25 LP redeem | clear APR source, risks, redeem delay explained |
| **P5 Judge / reviewer** | F90 judge path: web or APK → F01 → F05 voucher → F10 + F13 → F08 stateless test → F91 watch mode if geo-blocked | reaches the "wow" in < 2 min; nothing breaks on a fresh device |

### A. Account and identity
| ID | Flow | Happy path | States / failure paths (all designed) | Feedback | Platforms | Serves |
|---|---|---|---|---|---|---|
| F01 | **Create account** | Welcome (brand intro, skippable, reduced-motion aware) → 3 value pages → **Create account** → one passkey ceremony → address derived → session starts → Portfolio (empty state = Add-money card) | cancel (silent return); PRF unsupported (provider-specific fix copy); iOS < 18 / Android < 9 (block + web link); `NoCreateOption` (add a Google account); two prompts on some authenticators (interstitial copy); orphaned passkey after a later failure (never create twice → "tap I already have an account"); offline (disabled + reason); geo-blocked region (account allowed, trading gated, F95) | `snap` intro, `confirm` + unlock sound on success | all | Mera one-prompt, TTFT |
| F02 | **Sign in / returning** | Hint present → cached Portfolio renders instantly (`LOCKED` chip) → first signing action unlocks (native biometric, web passkey) | SecureStore invalidated (Face ID changed) → full passkey ceremony + re-persist; stale cache from another address → discard; reinstall mismatch → wipe + re-persist | `confirm` | all | Mera session |
| F03 | **Look around first** | Browse Markets/charts/docs without an account; any action → sheet "Create account to trade" | — | `tick` | all | first five minutes |
| F04 | **Session lifecycle** | Unlock → chip `TRADING UNLOCKED · 29:59` → idle/TTL/background lock → chip `LOCKED` | expiry mid-ticket (the ticket survives, relabelled "Face ID · Long XAU"); background → privacy plate; loosening settings → step-up | `warn` at 60 s left if a ticket is open | all | Mera session design |
| F05 | **Get starter funds** | *Practice (testnet)*: one tap → mock AUSD + testnet MON (relayed) → CreditWelcome. *Mainnet*: the gas drip is claimed right after sign-up. The EIP-712 claim is signed by the already-unlocked session key, so there's no extra prompt, and it's relayed by the sponsor. **Redeem voucher** field → AUSD credited into the core | already claimed; rate-limited (next claim time); budget exhausted (route to deposit); voucher invalid/used/expired; relayer down (retry + deposit alternative); geo-blocked | `filled` + deposit sound | all | product-not-demo, TTFT |
| F06 | **Practice ↔ Real toggle** | Account → Mode; persistent **PRACTICE** banner + testnet label everywhere; positions separated per network | switching with open orders (the other network is simply shown) | `tick` | all | honesty |
| F07 | **Recovery setup** | Settings → Recovery: checks passkey sync (iCloud/Google/1Password explainer), **add a second passkey** (vault), Advanced → export 24 words (step-up, screenshot-blocked on native) | provider without sync → strong recommendation to add a second passkey | — | all (vault web-first) | safety |
| F08 | **New device / stateless** | Fresh device → **I already have an account** → synced passkey → same address → everything rebuilt (skeletons, never $0.00) + encrypted prefs restored | several passkeys listed (dated labels); hybrid QR PRF failure → "sign in on the phone's browser" | `confirm` | all | Mera stateless test |
| F09 | **Sign out / delete data** | Sign out (clear SecureStore/MMKV) · Delete my data (local + encrypted prefs blob; explains that onchain history is public and permanent) | open positions → warning; step-up for delete | — | all | trust |

### B. Trading
| ID | Flow | Happy path | States / failure paths | Feedback | Serves |
|---|---|---|---|---|---|
| F10 | **Open gold/silver position** (our engine) | Markets → XAU → risk explainer (first time, 3 cards, "I understand" hold) → ticket: side, amount keypad + chips (MAX = Free to trade), leverage detents, live notional/fee/liq price/"x% away", margin gauge, session chip, oracle age → hold 500 ms → FaceID → execution trace → receipt (share card) | blocker chain in order: offline → geo → no account → no gas (auto top-up) → insufficient Free to trade ("Add $X") → market CLOSED/weekend (reduce-only, "opens Sun 23:00 UTC · in 14h") → STALE/CIRCUIT ("price paused; closing still works") → leverage above max (clamp + `warn`) → OI/skew/trade cap hit ("Market full; try ≤ $Y") → min position → simulate revert (decoded copy) → FaceID fail ×2 → RPC failover → receipt timeout (journal, "checking onchain", never resend) → proposed-but-not-finalized (roll back, warn) | `tick` keys and detents, `press`, `confirm`, `filled` + fill sound, `fail` + shake | Track 01, Design |
| F11 | **Manage position** | Position detail: PnL (with funding/borrow breakdown), liq distance, **close** (hold), **partial close** (slider), **add/remove margin**, **TP/SL** (F14), share | market closed → reduce-only at the closed spread (explained); `MIN_HOLD_BLOCKS` not reached ("profit close available in N s") | `filled` | Track 01 |
| F12 | **Liquidation risk + event** | Health falls below the warn threshold → push (time-sensitive) + in-app banner "Add margin or reduce"; liquidated → push + post-mortem sheet (price, penalty, what remains) | stale oracle → liquidations paused (explained) | `warn`, `liquidation` haptic + sound | Track 01, trust |
| F13 | **Crypto perp on Perpl** | Markets → BTC (venue label "Perpl") → first time: explain + move AUSD vault → Perpl (≥ 10 AUSD) with approve + `createAccount` inside the trace → IOC order bounded by slippage → trace → receipt; position in the "In Perpl" bucket | geo-blocked (Perpl list) → watch/read-only; below 10 AUSD minimum ("Move at least 10 AUSD"); Perpl API/WS down ("crypto paused; gold unaffected"); `lastExecutionBlock` rules; price moved past slippage (retry at the new price) | same as F10 | **Agora $10K** |
| F14 | **TP/SL and limit orders** | From the ticket or a position: set TP/SL (price or %), preview PnL at trigger; signed trigger order stored onchain; a keeper executes on the oracle crossing; push on fill | trigger during a closed market (queued until open, stated); keeper delay copy | `filled` | Track 01 |
| F15 | **Orders & activity** | Open orders (cancel), activity feed (fills, deposits, card, funding), filters, infinite scroll, export CSV (web) | empty (why + next action); indexer lag badge | `tick` | product |
| F16 | **Vault ↔ Perpl move** | "In Perpl" bucket → Move in/out → amount → trace | Perpl global withdrawal rate limit (explained with ETA) | `filled` | Agora "three integrations together" |

### C. Money in / out
| ID | Flow | Happy path | States / failure paths | Serves |
|---|---|---|---|---|
| F20 | **Add money hub** | Always-available sheet: Voucher/Practice · Deposit by QR · From a wallet · Swap; shown as the empty state of Portfolio | — | first five minutes |
| F21 | **Deposit from any chain** | QR: pick family (EVM/Solana/BTC/Tron/TON) → persistent address + requirements block (assets, min, fee, ETA) → timeline Waiting → Received → Bridging → Credited (Live Activity + push). Connect: pick asset/amount → preview → step-up sign intent → deposit → timeline; optional **deposit & open** | below min (refund explained); refunded/failed (reason + support link with tx refs); expired quote (late deposits still count); in-flight execution (resume); app killed (resume from MMKV); route degraded (incident banner, QR disabled with reason); memo-required chains (blocking checkbox) | **Aurora $5K** |
| F22 | **Swap USDC ↔ AUSD** | Amount → Uniswap v4 quote (rate, fee, min received) → hold → trace | quote moved (refresh); pool liquidity insufficient | Agora AUSD |
| F23 | **Withdraw / send / cash-out** | Amount (≤ Withdrawable, explained) → destination: own address, another address (step-up shows amount + address), or **another chain** via the Aurora Swap API (quote, ETA) → trace/timeline | locked by holds/margin (shows what frees it); address checksum/wrong network; reserve-balance rule for MON sends; geofence | completeness |
| F24 | **LP deposit** | LP screen: pool TVL, APR from fees (historical, not promised), utilisation, risks card → deposit AUSD → sLP shares | pool cap reached; paused | Track 01 (pool) |
| F25 | **LP redeem** | Request redeem → countdown (delay) → claim | blocked while any market isn't OPEN (explained: protects against weekend gaps) | Track 01 |

### D. Card (Kinpaku)
| ID | Flow | Happy path | States / failure paths | Serves |
|---|---|---|---|---|
| F30 | **Card setup** | Card tab intro → choose route: **Sandbox card** (Immersve testnet: SIWE, hosted KYC, virtual card) or **Prepaid card (real)** (Laso) → set **spend allowance** (daily limit + expiry, Face ID sign, D-032) → card appears | KYC pending/failed (Immersve states); region unsupported; allowance expired → prompt to renew | card story |
| F31 | **Spend (authorization)** | Tap at merchant/simulator → hold appears instantly (HOLD, yellow) → push "Card: $4.50 · $812 left" → capture → SETTLED | declined: over allowance / insufficient Free to spend / frozen / oracle stale ("spending paused while prices update") — each with a toast reason and "margin untouched"; issuer outage (last-good values + timestamp) | Track 01 unified balance |
| F32 | **Holds lifecycle** | Hold → capture (partial or over, with tolerance) → release remainder; refund → credit; expiry → auto-release | over-capture beyond collateral → card debt shown with a repay CTA (F33) | correctness |
| F33 | **Card debt repay** | Banner "Card debt $X" → repay from Free to trade | liquidation waterfall explanation | trust |
| F34 | **Freeze / reveal / wallet** | Freeze toggle (instant) · reveal PAN (step-up, auto-hide 30 s, blocked from screenshots) · Add to Apple/Google Wallet (when provisioning is enabled) or manual-add steps · web: "Add on your phone" QR | provisioning unavailable → honest copy, no fake button | iOS feel |
| F35 | **Laso prepaid purchase** | Amount (≥ route minimum) → withdraw to own EOA → Aurora to Base → x402 pay → card details shown (never logged) | international card takes ~24 h (pending state + push when ready); US card US-merchants only (stated before purchase) | real card |

### E. Engagement and system
| ID | Flow | Happy path | States / failure paths |
|---|---|---|---|
| F40 | **Notifications permission** | Primed after the first fill ("Get told when orders fill…") → OS prompt; channels in Settings | denied → in-app only + settings link |
| F41 | **Push tap routing** | Push → deep link (allowlisted paths only) → correct screen, session-gated actions | expired or unknown path → Portfolio |
| F42 | **Live Activities / widgets** | Order, Deposit, Watch (start from a position: "Watch on Lock Screen"); Portfolio + Watchlist widgets | activity limit reached; Live Activities disabled → fallback push |
| F50 | **Price alerts** | Market → bell → price/% threshold → keeper evaluates → push | duplicate/limit reached |
| F60 | **Settings** | Security (session length, idle, per-trade Face ID toggle, per-trade limit, lock now) · Preferences (sounds, haptics, theme, hide balances, language) · Notifications · Recovery · Mode · Help · Status · Legal · Delete data | loosening needs step-up |
| F61 | **Help & status** | FAQ, contact, status page (RPC, Perpl, Aurora, oracle ages, indexer lag, card service) | — |
| F62 | **Offline / reconnect** | Offline banner; cached data marked stale (never "failed"); actions disabled with a reason; reconnect → reconcile | — |
| F63 | **App update** | OTA update on next launch (expo-updates channels); forced update when contracts change (addresses mismatch) | — |
| F90 | **Judge path** | Landing → "Judge? Start here" (judge guide) → voucher → trade gold + Perpl → stateless test → watch mode | geo-blocked → watch mode + demo video |
| F91 | **Watch mode** | Enter address / open share link → read-only portfolio, positions, history | invalid address |
| F95 | **Geo-restriction** | Detected region blocked → trading and Perpl gated with a clear explanation; deposits/withdrawals of own funds stay allowed | VPN mismatch (conservative: gate) |

### F. Flows added after the traceability audit
| ID | Flow | Happy path | States / failure paths |
|---|---|---|---|
| F17 | **Deposit from a Monad wallet** | Add money → "Monad" family → `inboxOf(user)` QR/address (AUSD or USDC) → keeper sweeps → credited | wrong token (not swept; explained); below min |
| F18 | **Idle wallet balance** | AUSD/USDC detected in the user's own EOA → banner "Move $X into Senryo" → deposit (session-scoped) | — |
| F19 | **Zero funds on mainnet** | Empty Portfolio on mainnet without a voucher → "Try practice" + deposit options; states plainly that there's no card/bank on-ramp yet | — |
| F26 | **Collateral swap inside the account** | Swap USDC↔AUSD within the vault via `CollateralSwapper` (minOut) → trace | quote moved; adapter paused |
| F36 | **Simulate a card swipe** | Card → Simulate → merchant + amount → a real Lithic sandbox authorization → hold appears (mainnet release-only or practice capture) | Lithic sandbox rate limit (1 rps) |
| F37 | **Foreign-currency card spend** | Hold = cardholder amount × FX buffer → capture within tolerance → release the remainder | over-tolerance → debt (F33) |
| F43 | **Market holiday** | Banner days ahead ("Gold closed Thu for a holiday"); ticket shows reduce-only | — |
| F44 | **Oracle STALE/CIRCUIT with an open position** | Position card shows "Price paused · liquidations paused"; close is allowed at the conservative price (the rule in `risk-math.md`) | auto-recovery after 3-round confirmation, shown live |
| F45 | **Guardian pause / HALTED** | Global banner with reason + auto-expiry countdown; reduce-only | — |
| F46 | **Contract migration notice** | `/v1/config` flags a new core → banner → one-tap "Move to the new version" (withdraw-to-self → deposit) | positions open → close first |
| F47 | **Rate-limit / abuse states** | Our 429 ("Too many requests · retry in 10 s"), Aurora 429, Turnstile failure (retry), Perpl WS cap | — |
| F48 | **Perpl liquidated the user's Perpl position** | Push + a post-mortem sheet from indexed `PositionLiquidated` | — |
| F49 | **Practice + mainnet together** | The mode toggle shows each network's portfolio; push notifications carry the network and deep links carry the chainId | — |
| F64 | **Web desktop** | 3-panel desk (resizable), keyboard shortcuts (B/S side, 1–5 leverage presets, Space-hold confirm, Esc, ⌘K market search), multi-tab session sync (BroadcastChannel lock) | — |
| F65 | **Desktop without PRF** (e.g. Chrome without Google Password Manager) | Detect → "Use your phone" (QR to the same URL on the phone) or install instructions for a PRF provider | hybrid QR PRF (unverified; measured in S6) |

### Feedback and analytics map (all flows)
| Group | Haptic | Sound | Analytics event (first-party `/v1/events` + onchain) |
|---|---|---|---|
| A Account | `confirm` on sign-in/unlock, `warn` at session expiry, `tick` on toggles | `unlock` on F01/F02/F04 unlock | `account_created`, `signed_in`, `prompt_count`, `session_unlocked/locked`, `claim_done`, `voucher_redeemed`, `stateless_restore_ok`, `recovery_added` |
| B Trading | `tick`, `press`, `confirm`, `filled`, `warn`, `fail`, `liquidation` | `fill`, `liquidation`, optional `error` | `ticket_opened`, `order_submitted`, `order_filled` (venue: ours/perpl), `order_failed{reason}`, `position_closed`, `trigger_set`, `liq_warning`, `liquidated` |
| C Money | `tick` on amounts, `filled` on credit, `fail` on refund | `deposit` on credit, `send` on withdraw | `deposit_started{family}`, `deposit_credited`, `deposit_refunded`, `swap_done`, `withdraw_done`, `lp_deposit/redeem` |
| D Card | `press` on reveal/freeze, `filled` on setup, `warn` on decline | `send` on capture/spend (subtle, toggleable) | `card_setup{route}`, `allowance_set`, `card_auth{result,latency_ms}`, `card_capture`, `card_decline{reason}`, `prepaid_bought` |
| E System | `tick` | — | `push_opt_in`, `alert_set`, `judge_path_step`, `geo_blocked`, `offline` |
| TTFT | — | — | `ttft_start` (landing) → `ttft_stop` (first user-signed confirmed tx), plus the tap count |

### Stage ownership of every flow
| Stage | Flows built |
|---|---|
| S5 | F03 (guest route group), F62, F60 shell |
| S6 | F01, F02, F04, F05 (practice + mainnet relay after S8), F06, F07, F08, F09, F17, F18, F19, F65, F91 |
| S8 | F10, F11, F12, F14 (TriggerOrders is in S2 contracts), F24, F25, F26, F43, F44, F45, F95 |
| S7 (after S8's mainnet core) | F13, F16, F48 |
| S9 | F20, F21, F22, F23 |
| S10 | F30, F31, F32, F33, F34, F35, F36, F37 |
| S11 (web) | F64 + every flow's web variant |
| S12 | F15, F40, F41, F42, F46, F47, F49, F50, F61 |
| S15 | F63 (EAS Update channels + min-version) |
| S17 | F90 judge path + guide |

**Ordering fixes:**
- Wave C runs **S8 (mainnet core) before S7** (the Perpl moves need the core).
- The mainnet `StarterDrip` is deployed in **S8** after the D-024 assurance gate; S6 uses the practice drip on testnet.
- S4 gets a **re-sync step after S8** (mainnet addresses and start blocks).
- **S11 is split:** the web shell and auth go in wave B, and the trading desk goes in wave D (after C).

### Cross-cutting state rules (every screen)
- **Reading<T>:** unknown → skeleton; fresh → value; stale → value + "Updated 14:02 · refreshing"; failed with no cache → ErrorState (why + next action).
- **Never:**
  - a fabricated $0.00;
  - a success toast (success is shown in place);
  - a blind retry of a signed transaction.
- **Every blocker names the first fixable cause and its action**, from `core/blockers.ts`.
- **Network labels:** PRACTICE / MAINNET on every money surface.
- **Accessibility:**
  - Dynamic Type caps, VoiceOver labels ("Gold long, 5×, profit $102.40, liquidation 18% away");
  - reduced motion and transparency;
  - ▲▼ plus a sign with every colour.
- **Analytics** (privacy-respecting, for traction): the TTFT start/stop, funnel steps (F01 → F05 → F10), deposit completion, card auths. Counted server-side and onchain; no third-party trackers.

## 3. Repository layout (repo `senryo`, root `/Users/abu/dev/hackathon/metropolis`)
```
CLAUDE.md README.md LICENSE THIRD_PARTY_NOTICES.md
apps/{mobile,web,docs}        packages/{config,contracts,tokens,core,account,chain,api-client,query}
services/{api,card,keeper}    contracts/ (Foundry, outside workspace)   indexer/ (Envio, own lockfile)
deploy/ (env examples, nginx, traefik)   brand/   scripts/{invariants,env-check,contracts-export,deploy,drive,hypersync,probe}
docs/plan/{00-plan,STATUS,decisions,acceptance,parity,ids-and-txs,references}.md + specs/{contracts,risk-math,services,card,indexer,flows,session-policy,mobile,web,deploy-runbook}.md + stage-NN-*.md
docs/submission/{asks,demo-script,pitch-script,judge-guide,form-answers}.md   .github/workflows/{ci,images}.yml
context/ design/ prompts/ (tracked)   references/ (gitignored, pinned in references.md)
```
- **Tooling:** pnpm with a catalog (version fixed in S0); turbo; `tsconfig.base` strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; Biome for formatting; type-aware ESLint for `no-magic-numbers`, `no-floating-promises` and React Compiler rules; forge fmt/lint plus solhint.
- **Commits:** `<type>(S<n>.<step>/<area>): summary` with a `Stage:` / `Parity:` trailer. Tick the checkbox in the same commit. Never end a session dirty (`wip`). Branches: `stage/S<n>-*` and `slice/*` in `../senryo-wt/`.
- **Gates:**

  | Gate | Command |
  |---|---|
  | Fast | `pnpm typecheck && pnpm lint && pnpm invariants` |
  | Contracts | `forge build && fmt --check && lint && solhint` (+ invariants when changed) |
  | Web | `pnpm --filter web build` |
  | Mobile | `expo export -p ios -p android` |
  | Indexer | `envio codegen && tsc` |
  | Deploy | healthy + smoke request + `.well-known` check |

- **Invariant rules:**
  - **Ported from Agari** (`scripts/invariants`): file-length 400, pnpm-only, design-literals (web/mobile), tight-leading, svg rules, no-web-handoff, time-suffix, **no-float-money (error)**, write-boundary, brand-identity, session-secret-non-persisted, address-drift.
  - **New:** viem-import-boundary (ethers/web3/wagmi banned), explicit-gas, finalized-for-money, no-raw-getlogs, chain-id-literal, rpid-single-source, sol-no-magic-numbers, sol-no-timestamp-equality, **no-ui-tests**, no-secrets-in-tree, public-env-hygiene, motion-import, design-json-present, indexer-isolated, **no-custody-backend**, well-known-shape.

## 4. Stages (each becomes `docs/plan/stage-NN-*.md` with Goal · Open first · Steps · Gate · Evidence · Handoff)
Dates are sequencing aids only, never a reason to cut scope.

| Stage | Goal | Key steps | Gate |
|---|---|---|---|
| **S0** Bootstrap (29–30 Sep) | Plan system + tooling | `git init`; **transcribe this plan and the full designs into `docs/plan/` + `specs/` first**; STATUS/decisions/acceptance/parity/ids-and-txs/references/CLAUDE.md; root pnpm (11.24 as in the user's projects vs 12.8.1 latest: decide + record) / turbo / tsconfig / lint; port invariants (no-secrets first); env-check; Foundry scaffold; CI; record Context7 ids. **[OK?]** create the GitHub repo **public** (rules §7.2: public "throughout and after") and invite `metropolis@hackathon.monad.xyz`. **(user)** register in the portal + form the team (closes 6 Oct 23:59 UTC; target 5 Oct) | fast gate + `forge build` pass; first commit pushed |
| **S1** Brand + design system | Tokens, 21st components | user confirms name + domain; **[OK?]** buy the domain; **[OK?]** Apple Developer membership now (needed for iOS passkeys in S6, D-026); `packages/tokens`; seal mark, icon, splash, logo ≤ 3 MB; `apps/web` shell + `21st add` the D2 set, re-tokenized; `.21st/design.json` ×2 (mobile records the 21st source for each RN port, D-033); sounds (**[OK?]** ElevenLabs credits) | design-literals pass; D2 screens match the screenshots at 390/768/1440 |
| **S2** Contracts (testnet) | Core engine | `specs/contracts.md` + `risk-math.md`; SenryoCore modules; SessionOracle/Calendar; LpVault; StarterDrip; IntentRouter; Inbox; AccessManager roles; MirrorAggregator; invariant/fuzz/oracle checks; ensure-style Deploy.s.sol; export ABIs + addresses; deploy + verify on 10143 | invariants I1–I6 green; testnet verified; address-drift passes |
| **S3** chain/core/api/card | Services | **Capacity decision first:** measure the Coolify box; after akashi deploys ≈ 1.15 GiB free, so expect **[OK?]** a small second VPS for the indexer + keeper, or the tight profile; `config`, `contracts`, `core`, `chain` (explicit gas, finalized confirm, journal, `sendRawTransactionSync` with fallback); `services/keeper` separate (D-035); Uniswap v4 swap helper (Quoter + Universal Router; read the AUSD/USDC pool key onchain); Fastify api + card; Postgres schema; keepers; Dockerfiles; `images.yml` → GHCR; card-concurrency check | images build; keeper liquidates a testnet position (drive script); swap quote matches the pool |
| **S4** Indexer | Envio V3 | config for 143 + 10143; schema + handlers + Perpl cursor; local compose adapted for Coolify; `indexer-client`; HyperSync script | local sync at head; portfolio query returns testnet positions |
| **S5** Mobile foundation | Port the Agari kit | Expo 57 dev build; ported modules; D2 theme; NativeTabs (Liquid Glass on iOS 26, solid fallback on iOS 18–25); query layer; shell screens with honest states; eas profiles; **EAS credentials now** (the keystore SHA-256 is needed in assetlinks for S6); **[OK?]** Android developer registration (free limited tier, D-017) | `expo export` passes; dev build on the user's iPhone + Android |
| **S6** Auth + rpId | Passkeys | `packages/account` + policy + per-trade Face ID gate (D-028); `specs/session-policy.md`; `.well-known` via web; **[OK?]** DNS, Coolify project, `senryo-web` deploy; web + native sign-in with Create-first onboarding (D-029); practice-mode claim + mainnet relayed gas drip (D-030); 7702 spike (D-entry); stateless test; recovery (second passkey; export under Advanced); watch-only mode (D-031); measure TTFT + prompt counts | same address web/iOS/Android; fresh-device rebuild; prompt-free and Face-ID-per-trade both work; withdraw re-prompts; TTFT + prompt counts recorded |
| **S7** Perpl (mainnet) | Agora deliverable | viem Perpl module; **[OK?]** fund the demo account (MON + ≥ 10 AUSD); crypto markets on the same ticket; "In Perpl" bucket + moves; Path A later; indexer links | a real mainnet Perpl trade opened + closed from the phone (tx in acceptance) |
| **S8** RWA mainnet | Gold/silver trading | Pre-deploy assurance (D-024: Slither, Aderyn, Wake, security-review), then **[OK?]** mainnet deploy + **[OK?]** seed the LP/insurance/card float; Markets with session badges + oracle age; ticket + gauge + risk explainer + hold-to-confirm; execution trace; positions; LP view; buckets from the chain; charts from indexed oracle rounds (D-020); geofence (D-023) | assurance findings closed; mainnet deposit → XAU long → close; indexer shows it; a closed session blocks opens |
| **S9** Aurora | Any-chain deposits | **[OK?]** Studio key (frozen before issuing any persistent address); Connect recipe `approve` → `depositFor(USDC, {MIN_AMOUNT_OUT}, user)` (D-009) + `depositAndOpen`; in-app Swap to AUSD; inbox + sweeper; timeline states; cash-out via Swap; **[OK?]** $2–5 live runs from Solana/Base/Arbitrum + one refund | 3 source chains credited; `depositAndOpen` works; refund handled |
| **S10** Card | Three routes | `specs/card.md`; user-signed spend allowance (D-032); Immersve sandbox (**user** does the KYC face scan); **[OK?]** Lithic sandbox + ASA responder (practice: capture on testnet; mainnet: release-only holds, D-036) + `card/simulate` + latency harness; **[OK?]** Laso purchase (international card: $100+ plus 3.8%, ~24 h; the US card works only at US merchants); Kinpaku card screen | Immersve settles on testnet; Lithic p50/p99 + a reversal reconciled; one real Laso purchase (user) |
| **S11** Web Desk | Desktop terminal | 3-column desk; same session policy; static export + nginx + CSP; `21st-ui-review` pass; Lighthouse; **[OK?]** deploy | sign in + trade on the live web |
| **S12** Polish | Product feel | onboarding + chime; NumberFlow; price flash; haptic/sound map; push; Live Activities + widgets; error copy; TxRecovery; share receipt; device pass (silent switch, larger text, offline) | device checklist complete; TTFT re-measured |
| **S13** Docs site | Judges' reading | fumadocs static site: architecture, contracts + addresses, risk math, session design, Aurora flow, Envio schema + public GraphQL, card honesty labels, AI disclosure, `llms.txt`; terms / privacy / risk pages (D-023); public `/stats` page from the indexer (D-022); **[OK?]** deploy `docs.` | build + links pass |
| **S-GTM** Traction (continuous from S6) | Real users + evidence | define the ICP + user story; waitlist on web landing; recruit testers mainly via **web + APK** (TestFlight internal is limited to App Store Connect users; external triggers review under 3.1.5(iv)) **(user outreach; messages [OK?])**; hand out voucher codes (D-030); `/stats` metrics; tester quotes; weekly portal progress updates; feed the results into the pitch | ≥ N real testers with onchain trades recorded (N set with the user) |
| **S14** Deploy train | Everything live on Coolify | capacity baseline; **[OK?]** each: ledger, indexer compose, api, card, web, docs; record UUIDs; deploy-verify each; rollback rehearsal | all healthy; end-to-end run on production URLs |
| **S15** Distribution | Installable builds | (Apple Developer and EAS credentials were done in S1/S5); Play App Signing SHA-256 added to assetlinks if Play is used; APK link + QR; TestFlight internal + judges added (user); judge guide | clean-device installs; passkey works |
| **S16** Sponsor asks | Unblock questions | `docs/submission/asks.md` (Q-list below); each message **[OK?]**; answers → D-entries; portal progress updates | ongoing |
| **S17** Submission (by 13 Oct 18:00Z) | Deliver | README (Monad usage, addresses, tx hashes, GraphQL URL, pre-existing code, **AI disclosure**, **setup instructions + a local-run path on an anvil mainnet fork with mocked sponsor keys**); judge guide (D-031); MIT; demo ≤ 3 min of the live product (script via `failure-first-demo-video` / `walkthrough-demo-script`; edit via `hyperframes`); pitch ≤ 2 min (user), including traction evidence; optional ≤ 30 s ad (`product-launch-video`); logo; bounty fields for all 4 bounties; confirm the repo is public (since S0) and accessible to `metropolis@hackathon.monad.xyz`; user submits | the official checklist is fully ticked |
| **S18** Post-submission | Keep it alive | fix-only deploys (OK each); health + keeper balances daily; answer judges | — |

**Parallel waves** (per the flow-ownership table in §2.5):
- A: S1 · S2 · S5 · S16
- B: S3 · S4 · S6 · S11a (web shell + auth)
- C: S8 (mainnet core first) → S7 · S9 · S10 (worktrees), with the S4 re-sync after S8
- D: S11b (web desk) · S12 · S13 · S14 · S15 · S-GTM ongoing
- E: S17

**Hard money gate:** S8 mainnet waits for green S2 invariants and the testnet liquidation drive.

## 5. Operations (Coolify; the full runbook goes in `specs/deploy-runbook.md`)
- **Access:** `ssh -f -N -L 8001:localhost:8000 agari-box` → `coolify context verify` → baseline `free -h` / `docker stats`.
- **Resources and limits:**

  | Resource | Memory |
  |---|---|
  | web (nginx) | 64m |
  | docs | 64m |
  | api | 384m |
  | card | 192m |
  | keeper | 160m |
  | ledger Postgres | 256m |
  | indexer compose (indexer 800 / postgres 512 / hasura 384) | 1,696m |
  | **Total** | **≈ 2.8 GiB** |

  - The server has 4.0 GiB free today. Once akashi finishes deploying (its reserved ≈ 2.85 GiB), that drops to **≈ 1.15 GiB**, and our stack doesn't fit. The decision happens in **S3**: **[OK?]** a small second VPS (≈ 4–8 GB) as a second Coolify server for the indexer compose + keeper, or the tight profile if measurements allow. Never rely on swap for the card path.
- **Security headers:** static-export CSP uses hashes (no nonces). Mera keys live in JS memory, so there's no third-party script on authed routes.
- **Aurora:** freeze the Studio key and `InboxFactory` before issuing any persistent address; those addresses are permanent per key.
- **Envio:** subscribe only to the Perpl events we need; `where` doesn't reduce the ~9k logs per 100 blocks that are fetched.
- **Env:** `deploy/*.env.example` (names only); `coolify app env sync`; secrets runtime-only; `NEXT_PUBLIC_`/`EXPO_PUBLIC_` never secret.
- **`.well-known` on nginx:**
  - `location =` blocks with `application/json`;
  - `absolute_redirect off`;
  - explicit Dockerfile `COPY`;
  - recheck after every web deploy, including the Apple CDN and Google DAL;
  - list the EAS, Play and debug SHA-256s.
- **Never:**
  - delete volumes;
  - publish host ports;
  - use a custom `container_name`;
  - turn on Auto Deploy;
  - use `latest` tags;
  - touch akashi resources.

## 6. User actions and OKs
- **The user does these themselves:**
  - register in the portal and form the team (before **6 Oct**);
  - confirm the name and domain;
  - the Immersve KYC face scan;
  - install the dev build, APK and TestFlight;
  - add judges in App Store Connect;
  - record the pitch video;
  - make one real Laso purchase;
  - the final form submission.
- **[OK?] at the moment of action:**
  - **Purchases and plans:** domain, Apple Developer, second VPS, EAS or credits.
  - **Mainnet funding:**
    - MON for the deployer, sponsor, operator and keeper keys;
    - AUSD seeds and demo funds (Perpl ≥ 10);
    - Aurora live runs;
    - Laso cards.
  - **Mainnet admin:** contract deploys and param changes.
  - **GitHub:** create the repo, make it public, GHCR visibility.
  - **Infra:** every Coolify resource, deploy, env sync and DNS change.
  - **Accounts and messages:** Lithic, Aurora and Envio accounts; every sponsor or organizer message.

## 7. Open questions (tracked as Q- in decisions.md, with defaults)
| Q | Question | Default |
|---|---|---|
| Q-001 | Organizers: which rubric applies (the track page vs rules §5.2)? The judging/winner dates? Is a mainnet + testnet split OK? | Plan for both rubrics |
| Q-002 | Agora/Perpl: testnet AUSD drip | Mainnet demo |
| Q-003 | Perpl: builder code, web-origin whitelist, native key enrollment (profile prerequisite), geo-block enforcement | Path B |
| Q-004 | Aurora: Custom Actions for persistent addresses, a USDC→AUSD step in Connect, where refunds go | Inbox sweep |
| Q-005 | Monad/Mera: session-design review, Safari PRF `get()` status | Our policy + a 7702 spike |
| Q-006 | Envio: is self-hosting OK for judging? | Self-host |
| Q-007 | Immersve: our own test credentials | Public sandbox |
| Q-008 | Chainlink: Data Streams credentials (FX, equities) | Gold + silver only |
| Q-009 | User: the domain (senryo.app recommended) | Blocks S6 |
| Q-010 | User: Apple Developer membership? | APK + web only |
| Q-011 | User: team members, contact wallet, geofence list | Solo |
| Q-012 | User: mainnet budget. ≈ 60 MON across keys; ≈ 400 AUSD for seeds + demo + vouchers; ≈ $30 for Aurora tests; **Laso ≈ $105+** for one international card; Apple $99; a possible second VPS ≈ €5–10/mo | Asked per spend |
| Q-013 | User: the "Shazam" reference repo link (not found locally; Notion wasn't connected) | Agari used as the product-feel reference |
| Q-014 | Chainlink (Darb) / Pyth: Data Streams credentials or a Pyth trial for sub-minute XAU/XAG (D-020) | Chainlink push + honest "updated Xm ago" |
| Q-015 | User: is any team member part of a listed Metropolis community partner? (Community Team bounty, $5K, all tracks) | Not targeted |
| Q-016 | User: which tester communities can you reach (for S-GTM)? | Ask at S6 |

## 7a. Critical existing files to reuse
- Agari kit: `/Users/abu/dev/hackathon/agari-wt/mobile-takeover/mobile/src/{components/kit/haptics.ts,components/kit/states.tsx,components/drawer/BottomDrawer.tsx,components/toast/*,games/audio.ts,features/onboarding/*,features/alerts/*,components/funding/CreditWelcome.tsx,polyfills.ts,app/_layout.tsx}`, plus `mobile/{metro.config.js,eas.json,app.json}`.
- Agari invariants: `/Users/abu/dev/hackathon/agari-wt/mobile-takeover/scripts/invariants/{run.mjs,rules.mjs,lib/*}`.
- Money formatting: Agari `packages/core/src/units/format.ts` (`formatBaseUnits`, `parseDecimalToBaseUnits`).
- Plan templates: `/Users/abu/dev/hackathon/agari-wt/s5a/{CLAUDE.md,docs/plan/*}`; akashi `docs/plan/specs/deploy-runbook.md`.
- Design source: `/Users/abu/dev/hackathon/metropolis/design/preview/components/directions/d2.tsx`, `app/directions.css` (`.theme-d2`), `components/ui/*`.
- Mera demo derivation: `references/mera/demos/shared/src/hd.ts`. Perpl examples: `references/perpl-api-docs/examples/typescript`. Aurora Aave recipe: `references/intents-swap-widget/apps/intents-connect-demo/src/aave`.

## 8. Verification (end to end)
1. **Contracts:** `forge test --match-path 'test/invariant/*' --network monad` (I1–I6, plus the spend-allowance bound, D-032); oracle scenario suite; a mainnet fork test (real XAU feed + a Perpl IOC + a Uniswap v4 USDC→AUSD quote); Slither / Aderyn / Wake reports (D-024).
2. **Testnet drive** (`scripts/drive`): deposit → XAU long → oracle moves → keeper liquidation; card hold → capture → release.
3. **Auth:** the same passkey gives the same address on web, iOS and Android. Clear storage and rebuild (stateless test). A prompt-free trade inside the session; withdraw forces Face ID. TTFT (taps and seconds) recorded.
4. **Mainnet demo path** (each spend [OK?]):
   - starter claim;
   - Aurora deposit from Solana/Base;
   - XAU long + close on our engine;
   - Perpl BTC trade + close;
   - Lithic sandbox swipe with p50/p99;
   - Immersve sandbox purchase (testnet);
   - a Laso real card purchase.
   - Every tx goes in `acceptance.md`.
5. **Performance:** chrome-devtools Performance trace on web trade (≤ 4 ms scripting per frame at 10 ticks/s); Lighthouse; device profiling for chart fps and cold start.
6. **Deploy:** every Coolify resource healthy, smoke requests pass, `.well-known` served as JSON with no redirect.
7. **Flow walk** (not automated UI tests). At each stage gate, walk every flow that stage owns (§2.5 ownership table) on a physical iPhone, a physical Android and desktop Chrome/Safari:
   - the happy path;
   - every listed failure state that can be forced (offline, geo via config flag, stale oracle via MirrorAggregator on practice, rate limit, declined swipe, refund);
   - the haptic/sound/analytics event fired.
   Record the result per flow ID in `acceptance.md`. `scripts/drive` automates the chain-side parts of F10/F13/F21/F31.
8. **Submission checklist:** `context/00-hackathon/timeline-and-submission.md`, fully ticked.
