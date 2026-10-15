# Kawase (為替)

Kawase is an AI money agent for Arc: you chat with it or talk to it in any of ten languages, and it sends, swaps,
bridges, earns and runs automations from your own wallet. What it may do on its own is written on chain as signed
delegations with caps, so it acts freely inside them, and anything outside them waits for your Face ID.

<p align="center">
  <img src="docs/media/phone-welcome.png" width="300" alt="Kawase's first screen: 'Send 10 USDC to @amina' becomes an exact payment card on Arc Testnet, with the language pill and 'Try it first, sign in later'" />
</p>

<table>
  <tr>
    <td><img src="docs/media/phone-home.png" width="200" alt="Home as a guest: Your money agent on Arc, Try in chat, and what is trending on Arc" /></td>
    <td><img src="docs/media/phone-markets.png" width="200" alt="Markets: search, trending tokens on Arc and the heatmap" /></td>
    <td><img src="docs/media/phone-token-argus.png" width="200" alt="ARGUS's token page on Arc mainnet: price, chart, stats and safety" /></td>
    <td><img src="docs/media/phone-help.png" width="200" alt="Help and trust: what Kawase can and cannot do with your money and where it lives" /></td>
  </tr>
  <tr>
    <td align="center">Home (guest)</td>
    <td align="center">Markets</td>
    <td align="center">A token page (ARGUS, mainnet)</td>
    <td align="center">Help &amp; trust</td>
  </tr>
</table>

Screenshots of the live web app, taken as a guest on 2026-10-03 with live prices (more, at phone and desktop width, in
[`docs/media`](docs/media)).

Built for the [Tameion Agents Hackathon](https://tameion.thecanteenapp.com/) (Canteen with Circle and Arc,
2026-09-27 to 2026-10-10). The repository's history starts on 2026-09-30, inside the event. What existed before and what
was reused is listed under [Prior work](#prior-work-and-what-was-reused).

## Try it

| What                                                    | Where                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web app (start as a guest, no sign-up)                  | **[app.getkawase.xyz](https://app.getkawase.xyz)**                                                                                                                                                                 |
| Judge walkthrough (5 minutes on testnet, then mainnet)  | [docs.getkawase.xyz/docs/judge-walkthrough](https://docs.getkawase.xyz/docs/judge-walkthrough)                                                                                                                     |
| Demo video and every testnet transaction behind a claim | [getkawase.xyz/demo](https://getkawase.xyz/demo)                                                                                                                                                                   |
| Live usage counts                                       | [getkawase.xyz/live](https://getkawase.xyz/live)                                                                                                                                                                   |
| Showcase                                                | [getkawase.xyz](https://getkawase.xyz)                                                                                                                                                                             |
| Docs, in ten languages                                  | [docs.getkawase.xyz](https://docs.getkawase.xyz)                                                                                                                                                                   |
| iPhone                                                  | TestFlight public link: **[testflight.apple.com/join/PD3fgXZx](https://testflight.apple.com/join/PD3fgXZx)** (opens once Apple's beta review passes)                                                               |
| Android                                                 | [APK, EAS build e644e19d](https://expo.dev/accounts/abu.dev/projects/kawase/builds/e644e19d-72ca-4afd-b212-cf35a98b56ed)                                                                                           |
| Mac                                                     | [Desktop preview](https://getkawase.xyz/download/Kawase-mac.dmg) (Apple silicon, not notarized yet)                                                                                                                |
| Public API                                              | [`/health`](https://api.getkawase.xyz/health), [`/capabilities`](https://api.getkawase.xyz/capabilities), [`/public/stats`](https://api.getkawase.xyz/public/stats), [`/status`](https://api.getkawase.xyz/status) |

New accounts start on **Arc testnet**, where money has no value; claim test money from the faucet card on Home. On the
web an email code stands in for Face ID.

### Where it stands (2026-10-15)

- **Sign-in and the wallet are Privy's** (an email code, Apple or Google): the key is split up in Privy's secure enclaves and
  never reaches Kawase. On the web an emailed code stands in for Face ID before anything binding is signed; the
  [judge walkthrough](https://docs.getkawase.xyz/docs/judge-walkthrough) says step by step what runs today.
- **Testnet:** every flow below has been run end to end with real Arc testnet transactions, recorded as it was built.
  44 of them are on [/demo](https://getkawase.xyz/demo), grouped by what they prove, each with its explorer link and
  the build log or test that produced it.
- **Mainnet:** switched on in the api and the app (consent, setup, a USDC 500 daily allowance). Kawase's mainnet
  relayer and agent wallet have not been funded yet, so a mainnet wallet setup answers "Kawase is getting mainnet
  ready". **No real money has moved through Kawase on mainnet yet.** Mainnet-only features (any-token trading, Kawase
  Margin, Aave V4) are built against mainnet contracts and live quotes.
- **Usage:** the production api counts 2 accounts and 78 guest sessions, and no completed money movements of its own yet
  ([/public/stats](https://api.getkawase.xyz/public/stats)). The testnet evidence above came from API tests and the iOS
  simulator against Arc testnet.

## What it does

Generated from the capability registry ([`packages/config/src/capabilities.ts`](packages/config/src/capabilities.ts),
with the precise scope of each in [`capability-scope.ts`](packages/config/src/capability-scope.ts)). The app, the agent
and the docs' [availability page](https://docs.getkawase.xyz/docs/availability) all read that registry, and the agent
reads it before it says something can be done.

| Area                     | What it does (built and proven on testnet; see the pauses above for the live app)                                                                                                                                                                                                                                                                                                                                                         | Mainnet                                                    | Testnet                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| **Send and withdraw**    | Any token on Arc to a saved contact, an @handle, a typed or scanned address, with a recipient check on every payment (token contracts and look-alikes refused). USDC to someone on Base, Ethereum, Arbitrum, OP Mainnet, Polygon or Avalanche. Withdraw one token or everything to an exchange, your own wallet or your bank through an exchange. A wallet with no gas still sends USDC or EURC (EIP-3009; Kawase's relayer pays the fee) | ✓                                                          | ✓ (no exchanges)                                               |
| **Requests**             | Payment requests and links in any token, split bills.                                                                                                                                                                                                                                                                                                                                                                                     | ✓                                                          | ✓                                                              |
| **Contacts**             | Pay by name or @handle; warnings for a changed or look-alike address                                                                                                                                                                                                                                                                                                                                                                      | ✓                                                          | ✓                                                              |
| **Swap and markets**     | Buy, sell or swap any token on Arc, meme coins included, at the best quote of KyberSwap, Circle App Kit and LI.FI, one slide to confirm. GoPlus checks, a copycat rule for stablecoin look-alikes, and your own token rules. Markets, a page per token, launchpad bonding-curve progress                                                                                                                                                  | ✓                                                          | USDC ↔ EURC only                                               |
| **Buy**                  | USDC or EURC with a debit card, Apple Pay or Google Pay through Circle's Onramp, delivered to your own wallet                                                                                                                                                                                                                                                                                                                             | ✓ (Apple Pay and Google Pay wait on Circle's domain check) | Circle's sandbox, test cards                                   |
| **Bridge**               | Any asset from Arc to the six chains above over CCTP, Across, Relay, LI.FI or deBridge, ranked by what arrives after fees, tracked until delivered. Bring USDC to Arc with one signature                                                                                                                                                                                                                                                  | ✓                                                          | CCTP only                                                      |
| **Earn**                 | Morpho vaults from Circle's App Kit Earn, compared with Aave V4 supply and Aero campaigns, ranked by what can be paid back now                                                                                                                                                                                                                                                                                                            | ✓                                                          | Arc testnet's mock vaults                                      |
| **Lend and borrow**      | Supply, withdraw, borrow and repay on Aave V4 with a live health gauge, a liquidation price and alerts under 1.5 and 1.2                                                                                                                                                                                                                                                                                                                  | ✓                                                          | not available (Aave V4 is mainnet only)                        |
| **Long and short**       | Kawase Margin: a leveraged long or short through your own Aave V4 account as one batch, take-profit and stop-loss, health alerts                                                                                                                                                                                                                                                                                                          | ✓                                                          | not available                                                  |
| **Automations**          | Scheduled sends pinned on chain to the recipient and amount; Auto-save and round-ups; rules on a balance, money arriving or a price (bridge, save, alert, send); DCA. Practice runs first, edit in place, skip, pause; cancelling revokes the grant on chain. Anything it may not do alone waits in **Needs you**                                                                                                            | ✓                                                          | ✓                                                              |
| **Agent wallet (x402)**  | Kawase pays per call for services in Circle's x402 catalog (search, news, prediction-market odds, yields, prices) from its own agent wallet, inside a daily budget and a per-call cap you set; Gateway nanopayments and EIP-3009                                                                                                                                                                                                          | ✓ Circle's catalog                                         | Kawase's own demo seller (the catalog has no testnet listings) |
| **Voice**                | Talk on iPhone, Android or the web in your language; it answers aloud and shows the same cards as chat. A spoken "yes" never approves a payment                                                                                                                                                                                                                                                                                           | ✓                                                          | ✓                                                              |
| **Memory and insights**  | Remembers what you ask it to (editable, forgettable), searches every past conversation, "For you" cards on Home, Arc questions answered with sources, a "why" behind every movement                                                                                                                                                                                                                                                       | ✓                                                          | ✓                                                              |
| **Test money**           | About 20 USDC and 20 EURC a day from Circle's faucet                                                                                                                                                                                                                                                                                                                                                                                      | not available                                              | ✓                                                              |

Across the app: ten languages from the first screen (Arabic and Urdu right-to-left), a display currency (28 fiat
currencies), the network shown three ways at all times, an inbox with push and email, Help & trust with live status,
and a wallet you can export.

**Not yet:** swaps that run unattended (every swap or DCA buy waits for your tap), limit orders, refunds from x402
sellers (x402 has no refund standard), Hibachi perps, Aave V4 and margin on testnet, voice inside the desktop app, and
passkeys as the wallet's signing factor.

## How the agent decides

- **One brain.** `agentTurn()` in [`packages/agent`](packages/agent) serves chat and voice alike, with the same tools,
  limits and thread. The model only **proposes**: no tool takes a network, an address or an "approve" flag. Code resolves
  the recipient, runs the policy, builds the transaction and executes it.
- **A pure policy engine** ([`packages/policy`](packages/policy)) turns facts into errors, refusals, preconditions,
  clarifications and warnings, plus the route (the allowance or your signature). It runs when a card is drafted, again
  on approval with fresh facts, and again at execution.
- **Acting alone, inside limits it cannot reach.** Inside your everyday allowance Kawase sends without asking and tells
  you. Automations run unattended inside their own grants, on a schedule or when a rule's condition is met (money
  arriving, a balance line, a price), and park anything outside the grant in Needs you.
- **Never paid twice.** Each run is claimed once; an unclear outcome becomes "still checking" and is re-checked, never
  re-sent. Every movement has a "why" page and every automation run a story.

## Architecture

```text
 iPhone / Android / Web / Mac (Expo, Tauri)         LiveKit Cloud (WebRTC)
        │  chat (SSE), screens                              │ audio
        ▼                                                    ▼
 ┌────────────────────────────────┐          ┌──────────────────────────────┐
 │ apps/api — Hono on Node        │◀────────▶│ apps/voice-agent             │
 │  agent turn · policy · intents │   turn   │  GPT-Live, same agent turn   │
 │  runners: automations, watch,  │          └──────────────────────────────┘
 │  notifications, reconciliation │
 └──────┬──────────────┬──────────┘
        ▼              ▼
   Postgres 17     Arc mainnet / testnet · Circle (Wallets, App Kit, CCTP, Gateway, Onramp, faucet) · Privy
```

- **Your wallet** is an ordinary EOA whose key **Privy** keeps split up in secure enclaves (no seed phrase, no PIN), one
  address on both networks. Kawase upgrades it in place with **EIP-7702** to MetaMask's `EIP7702StatelessDeleGator`; you sign
  one authorization and Kawase's relayer pays the fee.
- **The agent's authority** is **ERC-7710 delegations** from your account (MetaMask Delegation Framework,
  [`packages/integrations/delegation`](packages/integrations/delegation)), redeemed by Kawase's agent wallet, a Circle
  developer-controlled wallet. Caveats carry the token, function, period cap, recipient, redeemer and expiry.
- **Wallet-signed actions** (above the allowance, swaps, bridges, earn, margin): the api builds the exact calls (App
  Kit's are captured and checked), wraps them into one EIP-7702 batch, the device signs, and the api verifies the
  signed bytes against the draft before broadcasting.
- **Gas.** Arc's fees are paid in USDC. A relayer EOA per network pays wallet setups, relays EIP-3009 transfers for
  wallets with no gas, and sends batches through a one-time delegation.
- **Voice**: a LiveKit Agents worker. OpenAI's GPT-Live holds the conversation and hands every money request to the same
  agent turn as chat; a fallback pipeline uses ElevenLabs speech-to-text and text-to-speech.
- **Data**: Postgres 17 with Drizzle is the only store and the only message bus (an outbox, `pg_notify`, server-sent
  events). Money is exact base units; ids are UUIDv7.
- **Hosting**: everything (api, web app, voice worker, docs, showcase, Postgres) runs on a **Coolify** server behind
  Traefik and Let's Encrypt, one Dockerfile per service built from the monorepo root.

### Circle and Arc pieces in use

| Piece                                 | What Kawase does with it                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Circle Wallets (developer-controlled) | the agent wallet that redeems your delegations; the x402 agent wallet                                     |
| App Kit                               | swaps, CCTP bridges and Earn vaults; the kit's calls are checked, then signed by your wallet as one batch |
| CCTP                                  | USDC to and from six chains, tracked burn → attestation → mint                                            |
| Gateway                               | x402 nanopayments from the agent wallet                                                                   |
| USDC and EURC                         | every balance; EIP-3009 `transferWithAuthorization` for gas-free sends; USDC as gas                       |
| Onramp                                | buying with a card, Apple Pay or Google Pay                                                               |
| Faucet API                            | test money for new testnet accounts                                                                       |
| Arc Memo                              | the on-chain reference a payment can carry (an order number)                                              |

Kawase uses its own relayer rather than Circle's Paymaster, and does not use USYC.

### Repository map

| Path                                                                         | What it is                                                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`apps/api`](apps/api)                                                       | Hono API: auth, the agent's chat stream, intents and approvals, the runners (automations, watchers, notifications), webhooks |
| [`apps/mobile`](apps/mobile)                                                 | Expo / React Native app for iOS, Android and the web                                                                         |
| [`apps/voice-agent`](apps/voice-agent)                                       | LiveKit Agents worker                                                                                                        |
| [`apps/docs`](apps/docs), [`apps/landing`](apps/landing)                     | the docs (Fumadocs) and the showcase with `/demo` and `/live` (Next.js)                                                      |
| [`apps/desktop`](apps/desktop)                                               | Tauri window around the web app                                                                                              |
| [`apps/x402-seller`](apps/x402-seller)                                       | Kawase's testnet x402 demo seller                                                                                            |
| `apps/executor`, `apps/chain-watcher`                                        | placeholders from the scaffold; their jobs run inside `apps/api` today                                                       |
| [`packages/agent`](packages/agent)                                           | the single agent: turn, prompts, tools                                                                                       |
| [`packages/policy`](packages/policy), [`packages/intents`](packages/intents) | the pure policy engine; versioned, EIP-712-hashed drafts                                                                     |
| [`packages/integrations/*`](packages/integrations)                           | delegation (7702 + 7710), App Kit, KyberSwap, bridges (Across, Relay), Aave V4, x402                                         |
| [`packages/config`](packages/config)                                         | every constant: limits, the capability registry, fees, locales, models                                                       |
| [`packages/db`](packages/db)                                                 | Drizzle schema and committed migrations                                                                                      |
| [`packages/i18n`](packages/i18n)                                             | the ten languages' catalogs                                                                                                  |
| [`packages/networks`](packages/networks), [`packages/money`](packages/money) | the two Arc networks and verified addresses; exact money types                                                               |
| [`plan/`](plan), [`context/`](context)                                       | the build plan and logs; the research behind it                                                                              |

## Security model

- **Inside the everyday allowance** (USDC only, `transfer` only, a daily period cap, only Kawase's agent wallet may
  redeem it, 90-day expiry, no native value) Kawase sends without asking. The **chain** refuses anything outside it;
  this was tested on Arc testnet, including a leaked agent key, which the chain reverted.
- **Above it**, and for every swap, bridge, vault move, EURC payment, look-alike address or limit change, you confirm
  with Face ID (fingerprint on Android, an email code on the web) over the exact transaction.
- **Automation grants** are pinned on chain: a scheduled payment can only pay its one recipient up to its amount per
  period; Auto-save can only move between your wallet and your own savings; bridge rules only to your own address with
  the fee capped. Cancelling revokes the grant in the same step.
- **Policy limits** on top: per transaction, daily, weekly and monthly, per recipient, a cooldown for new recipients,
  token rules for unverified tokens, and checks for look-alike and contract addresses. Two taps at once cannot both fit
  under the same limit.
- **Pause all** stops everything the agent does without asking. The **exit kit** pauses, revokes every permission in one
  transaction and helps you move the money out. You can **export your wallet** and leave without Kawase; the docs show
  how ([withdraw without Kawase](https://docs.getkawase.xyz/docs/withdraw-without-kawase)).
- **The agent can never** invent an address, choose the network, approve a payment because of a spoken "yes", or mark
  something paid without a receipt containing the exact transfer.

Full detail: [safety](https://docs.getkawase.xyz/docs/safety) and
[limits and control](https://docs.getkawase.xyz/docs/features/limits-and-control).

## Run it locally

Requirements: Node 24 or later, pnpm 11, Docker.

```sh
pnpm install
docker compose -f deploy/compose.dev.yaml up -d   # Postgres 17 on localhost:5433
cp .env.example .env                               # then fill it in (below)
pnpm db:migrate
pnpm --filter @kawase/api dev                      # http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm --filter @kawase/mobile web
```

The api needs, at minimum (checked at start by [`packages/env`](packages/env/src/index.ts)):

- `DATABASE_URL` (for the compose database: `postgres://kawase:kawase@localhost:5433/kawase`);
- for sign-in, a Privy app: `PRIVY_APP_ID` on the api (`PRIVY_APP_SECRET` optional) and `EXPO_PUBLIC_PRIVY_APP_ID` in the
  app (plus `EXPO_PUBLIC_PRIVY_CLIENT_ID` for the native app); local development can use dev sign-in instead
  (`KAWASE_DEV_AUTH=true` on the api, `EXPO_PUBLIC_WALLET_PROVIDER=dev` in the app);
- a Circle TEST API key and entity secret, and a developer-controlled wallet on Arc testnet for the agent
  (`OPS_WALLET_ID_TESTNET`, `OPS_WALLET_ADDRESS_TESTNET`);
- `RELAYER_PRIVATE_KEY_TESTNET`: any key whose address holds a little testnet USDC
  ([faucet.circle.com](https://faucet.circle.com), Arc Testnet).

Optional: `OPENAI_API_KEY` (chat is off without a model key), LiveKit keys (voice), `ALCHEMY_API_KEY` (portfolio
discovery), Resend (email), and the `*_MAINNET` / `CIRCLE_LIVE_*` keys with `MAINNET_ENABLED=true`.

Checks: `pnpm typecheck`, `pnpm lint`. The api's tests run against Arc testnet with real transactions and move test
money: `pnpm --filter @kawase/api test`. The delegation package proves the on-chain limits on its own:
`pnpm --filter @kawase/integrations-delegation test:arc-testnet`.

## Prior work and what was reused

The hackathon judges the work done between **2026-09-27 and 2026-10-10**. This is where Kawase started.

- **This repository** begins with commit `be83488` on **2026-09-30** ("Bootstrap Kawase: monorepo scaffold, plan,
  research context, Stage 1 spikes"). All 294 commits up to 2026-10-03 fall inside the event: 20 on 09-30, 33 on
  10-01, 218 on 10-02 and 23 on 10-03. The bootstrap commit holds the research notes, the plan, the notes of the first
  spikes and the package scaffolds with the first constants and money types, all written during the event, plus Expo's
  starter template for the app. Nothing of Kawase existed before it.
- **Starting point:** no users, no deployment, no money moved.
- **Research** in [`context/`](context) was compiled on 2026-09-29 from public sources: the hackathon pages and kickoff,
  Arc and Circle documentation, Canteen's talks and articles. Circle's sample repositories are read through
  `refs/clone.sh` and are not committed.
- **Abu's earlier Arc project**, Arc Copilot ([arc-agent](https://github.com/Blockchain-Oracle/arc-agent), 2026-07-28
  to 2026-08-11, never deployed, no users), was **not imported**. Its lessons (Arc and Circle gotchas) are summarized in
  [`context/07-prior-work`](context/07-prior-work), and a few of its dated research findings are quoted, labelled as
  such, in the agent's Arc notes ([`packages/agent/src/knowledge`](packages/agent/src/knowledge)).
- **Accounts reused:** the Circle TEST entity secret from an earlier experiment (Arc Treasury Intelligence), and 12 test
  USDC from that experiment's wallet to fund Kawase's testnet agent wallet (see `plan/spikes/04-delegation.md`).
- **Senryo** ([senryo](https://github.com/Blockchain-Oracle/senryo)), Abu's trading app started on 2026-09-29 alongside
  this one: the margin ticket's layout, the leverage ruler and the slide-to-confirm behaviour were ported from it.
- **Third-party UI**: components from [21st.dev](https://21st.dev) (each file names its source), shadcn/ui and React
  Native Reusables, adapted to Kawase's design system ([`DESIGN.md`](DESIGN.md)). Logos come from web3icons and
  simple-icons with their provenance recorded in [`packages/identity`](packages/identity).
- **Open-source libraries** do the heavy lifting where they exist: MetaMask's Delegation Framework (smart-accounts-kit),
  Circle's App Kit and SDKs, viem, LiveKit Agents, Expo, Hono, Drizzle and Fumadocs.
- **How it was built:** by Abubakr Jimoh with AI coding agents (Claude Code; OpenAI Codex until 2026-10-02). The plan,
  the decisions and the build logs are in [`plan/`](plan).
