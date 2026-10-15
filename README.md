<p align="center">
  <a href="https://app.getkawase.xyz">
    <img src=".github/assets/banner.png" width="960" alt="Kawase 為替. Money that moves when you speak. The AI money agent for everything on Arc, shown on the desktop Home with live Arc markets, the welcome screen's route race, and the x402 Marketplace on a phone." />
  </a>
</p>

<h1 align="center">Kawase · 為替</h1>
<p align="center">Money that moves when you speak.<br/>The AI money agent for everything on Arc, in ten languages, on iPhone, Android and the web.</p>

<p align="center">
  <a href="https://app.getkawase.xyz"><b>Open Kawase</b></a>
  &nbsp;·&nbsp;
  <a href="https://getkawase.xyz/demo"><b>Demo</b></a>
  &nbsp;·&nbsp;
  <a href="https://getkawase.xyz/demo#evidence"><b>On-chain evidence</b></a>
  &nbsp;·&nbsp;
  <a href="https://getkawase.xyz/live"><b>Live counts</b></a>
  &nbsp;·&nbsp;
  <a href="https://docs.getkawase.xyz"><b>Documentation</b></a>
  &nbsp;·&nbsp;
  <a href="https://testflight.apple.com/join/PD3fgXZx"><b>iPhone (TestFlight)</b></a>
</p>

**Kawase is an AI money agent for Arc, Circle's stablecoin network.** You type or say what you want, in your language,
and it sends, swaps, bridges, earns, trades and pays for data from your own wallet. Every route is raced before you
commit, and what the agent may do on its own is a budget you sign once and Arc enforces, so it acts freely inside it and
anything outside it waits for you.

Built for the [Tameion Agents Hackathon](https://tameion.thecanteenapp.com/) (Canteen with Circle and Arc). *Kawase*
(為替) is Japanese for exchange and remittance. Every flow runs on **Arc testnet** with real transactions, and the
api, the app and the budget are live on **Arc mainnet**; see [what is verified](#what-is-verified) for exactly what has
moved where.

## Problem and value

### Problem

Moving dollars on chain still asks a person to think like an engineer: which chain, which bridge, which gas token,
what slippage, which of five routes really delivers the most. And an "agent" that can move your money is only as safe
as the promise behind it.

### Value

Kawase turns the request into the result. Say "bring my USDC from Base" or "swap 5 USDC to EURC": it checks every route
(Circle's App Kit, KyberSwap, LI.FI, CCTP, Across, Relay and more), shows each quote with its venue's real logo, and
picks what arrives after fees. Inside a weekly budget you sign once (an on-chain delegation with caps) it just does it;
above it, it asks for Face ID, a fingerprint or, on the web, an emailed code. A spoken "yes" never moves money.

| Way in | What you do | Start here |
| --- | --- | --- |
| **Ask** | Type on Home, open a chat, or hold the orb and talk. The agent drafts the action as a card with every number on it. | [Open Kawase](https://app.getkawase.xyz) · [chat and voice](https://docs.getkawase.xyz/docs) |
| **Move money** | Send to a contact, an @handle or an address; swap any Arc token; bridge to six chains; add money by card, exchange, another chain or a wallet. | [Swap](https://app.getkawase.xyz/swap) · [Bridge](https://app.getkawase.xyz/bridge) |
| **Grow it** | Earn in Circle's App Kit vaults, borrow on Aave V4, or go long or short on Arc's majors with take-profit and stop-loss (mainnet). | [Earn](https://app.getkawase.xyz/earn) · [Long / Short](https://app.getkawase.xyz/margin) |
| **Let it run** | A weekly budget, automations (scheduled sends, Auto-save, rules), and an agent wallet that pays per call for x402 data from Circle's catalog. | [Marketplace](https://app.getkawase.xyz/marketplace) · [Automations](https://app.getkawase.xyz/automations) |
| **Check it** | Every move has a receipt, a "why" page and its explorer link; Activity has the week's P&L. | [Evidence](https://getkawase.xyz/demo#evidence) |

## Who we're building for

People who hold or earn digital dollars and should not need a tutorial to use them: someone paid in USDC who sends
money home, a freelancer moving between chains, a first-time saver who wants yield without reading vault docs. That is
why the first screen asks for nothing: a guest sees live quotes, markets and the race before any sign-in, and the app
speaks Arabic, Bengali, Chinese, English, French, Hindi, Portuguese, Russian, Spanish and Urdu (right-to-left where it
should be). Paying users and repeat use are not validated yet. The production api publishes its current account and
guest-session counts at [/public/stats](https://api.getkawase.xyz/public/stats); these are usage counters, not proof of
paid or repeat use.

## Demo video

<p align="center">
  <a href="https://getkawase.xyz/demo">
    <img src=".github/assets/demo-cover.png" width="960" alt="Watch the Kawase demo: Ask. It races. It's done. The live Long / Short screen behind a magenta play button." />
  </a>
</p>

The recording is coming to [getkawase.xyz/demo](https://getkawase.xyz/demo). The cover is an editorial composition
built on a live app capture (2026-10-15); it is not a recording or a transaction receipt. Until the video is up, the
same page lists every testnet transaction behind the claims below, each opening on its explorer.

## Try it

1. Open [app.getkawase.xyz](https://app.getkawase.xyz) and tap **Look around**: no account. Type "Swap 5 USDC to EURC"
   on Home and watch the venues race, each with its quote and logo.
2. Sign in with an email code, Apple or Google. Privy makes your wallet; Kawase upgrades it with one signature and pays
   that gas itself, so a new wallet needs no gas at all. On testnet, **+ → Add money → Get test money**.
3. In **Settings → Weekly budget**, sign a budget once (for example $200 a week, $50 per action). Ask for the swap
   again: inside the budget it goes with no prompt, and the run card links to ArcScan.

[Judge walkthrough](https://docs.getkawase.xyz/docs/judge-walkthrough) · [safety](https://docs.getkawase.xyz/docs/safety) · [withdraw without Kawase](https://docs.getkawase.xyz/docs/withdraw-without-kawase)

<table>
  <tr>
    <td><img src=".github/assets/screens/phone-welcome.png" width="180" alt="The welcome screen: 'Bring my USDC from Base to Arc' checks five routes, picks the best one, and arrives on Arc" /></td>
    <td><img src=".github/assets/screens/phone-home.png" width="180" alt="Home as a guest on mainnet: sign in to see your money, and what is trending on Arc, live" /></td>
    <td><img src=".github/assets/screens/phone-sign-in.png" width="180" alt="Sign in to add money: an email code, Continue with Google, Continue with Apple" /></td>
    <td><img src=".github/assets/screens/phone-marketplace.png" width="180" alt="The Marketplace: 84 paid tools from Circle's x402 catalog, with their logos and price per call" /></td>
    <td><img src=".github/assets/screens/phone-longshort.png" width="180" alt="Long / Short: cirBTC with a live price and chart, long up to 3.4×, short up to 2.4×" /></td>
  </tr>
</table>

<table>
  <tr>
    <td><img src=".github/assets/screens/desktop-marketplace.png" width="440" alt="The Marketplace on desktop: categories with counts and every tool's logo" /></td>
    <td><img src=".github/assets/screens/desktop-token.png" width="440" alt="A token page: Malachite's live chart with BasedBot, DexScreener and ArcScan links" /></td>
  </tr>
</table>

<sub>Guest captures of the live app, 2026-10-15 ([provenance](.github/assets/provenance.json)).</sub>

## What it does

Generated from the capability registry ([`packages/config/src/capabilities.ts`](packages/config/src/capabilities.ts),
with the precise scope of each in [`capability-scope.ts`](packages/config/src/capability-scope.ts)). The app, the agent
and the docs' [availability page](https://docs.getkawase.xyz/docs/availability) all read that registry, and the agent
reads it before it says something can be done.

| Area                     | What it does (built and proven on testnet)                                                                                                                                                                                                                                                                                                                                                         | Mainnet                                                    | Testnet                                                        |
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

## Built on Arc and Circle


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

## What is verified

**Arc testnet, end to end through the api (2026-10-15).** The api's live suites ran each money path with real
transactions ([`apps/api/test`](apps/api/test), `*-testnet.test.ts`), all passing:

| Flow | What happened | Transaction |
| --- | --- | --- |
| Wallet | sign-in registers the wallet; relayed EIP-7702 setup; an allowance accepted, then revoked on chain | suite `wallet-testnet` |
| Send | inside the allowance with no prompt; a frozen send resolved and resumed; one signed by the wallet | [allowance send](https://testnet.arcscan.app/tx/0xa6b7b60c3412f585888ae30540c2fbeb52d3c22f0babc5c96a95db86c289c9e0) · [wallet send](https://testnet.arcscan.app/tx/0x491fb36f1e7a9a9ff66003382edb660d950304607d33d24ea867035fd9f3de57) |
| Gas-free send | a wallet with no USDC to spare sends all of it; Kawase's relayer pays (EIP-3009) | [relayed send](https://testnet.arcscan.app/tx/0xac4f63a576222fd1cdeda8f26e0ab5aeafdae18dd910d5f7d8996fad8b317ad0) |
| Swap | USDC → EURC, one signed transaction, settled by its own receipt | [swap](https://testnet.arcscan.app/tx/0xa97005cd72ed9a206b0cfecfdba584930d9c5d5c7b747097b402a64755b6c1ae) |
| Route race | the swap through the venue the race picked (App Kit), and a CCTP move from the move ticket | [swap](https://testnet.arcscan.app/tx/0x6518ecbe8a163d36f69d1fc2f91bacf3090b6aafe644df01ba9280d1947a1af6) · [move](https://testnet.arcscan.app/tx/0xad23089a481dd820ac3a55f95f9a77ff3a1bae83d8230c0de846fc3fd3401549) |
| Bridge | Arc → Base Sepolia, one signature, minted by Circle's forwarder | [burn on Arc](https://testnet.arcscan.app/tx/0x83784a163eb81dc223c8b956df9e6233315d46e14100bbb6b169df3878402900) · [mint on Base](https://sepolia.basescan.org/tx/0x8a463f7c3285581a4ef2c6364e2889b7dea222bd3fa500b27c2e58ba26895a86) |
| Earn | a vault deposit and a withdrawal, one signed transaction each | [deposit](https://testnet.arcscan.app/tx/0x186b62f7d05fd3ff550b8b28a8e0f6754d746698867f6ade895543d56787e4bf) · [withdraw](https://testnet.arcscan.app/tx/0xd3ab115bc9933c428625ba3cdf9450c734e33da70f709999d131471b82ed6d69) |
| x402 | the agent wallet topped up under its grant, paid the demo seller through Gateway, and returned the rest | [top-up](https://testnet.arcscan.app/tx/0xe3ce93c2f0a47483fda117f98645007ffc5b8463f285101bb0980e9d2d9a0016) · [return](https://testnet.arcscan.app/tx/0xd2db35f6cff006856b6f1e174a22c1a8a0599f4045449833a3ff7eaddd86569c) |

**Earlier evidence:** 44 more testnet transactions recorded as each feature was built, grouped by what they prove, on
[getkawase.xyz/demo](https://getkawase.xyz/demo#evidence), each naming the build log or test that produced it.

**Mainnet:** the api and the app are live on Arc mainnet (consent, setup, the weekly budget, live markets, the x402
catalog, Long / Short on Aave V4). Kawase's mainnet relayer and agent ops wallet are funded, and `/health` reports each
network's relayer gas. **No real money has moved through Kawase on mainnet yet**; the swap, margin and bridge paths
there are built against mainnet contracts and live quotes.

**Not yet:** swaps that run unattended (every swap or DCA buy waits for your tap), limit orders, refunds from x402
sellers (x402 has no refund standard), Aave V4 and margin on testnet, voice inside the desktop app, passkeys as the
wallet's signing factor, and mainnet wallet history while the history provider's quota is spent.

## Security model

- **Inside the weekly budget** (one signature: a weekly total, a cap per action, the kinds of action it covers, and only
  you and people you saved) swaps, moves to your own wallets, vault deposits, sends to contacts and paid services go
  with no Face ID. For each one the api hands the phone a one-shot delegation leaf; the phone checks it against what it
  expects and signs it, and Kawase's agent wallet redeems it on chain. Pausing the budget (one relayed transaction, no
  Face ID) ends every grant at once.
- **Inside the everyday allowance** (USDC only, `transfer` only, a daily period cap, only Kawase's agent wallet may
  redeem it, 90-day expiry, no native value) Kawase sends without asking. The **chain** refuses anything outside it;
  this was tested on Arc testnet, including a leaked agent key, which the chain reverted.
- **Outside them** (above a cap, a kind the budget doesn't cover, a new recipient), and for any look-alike address or
  limit change, you confirm with Face ID (fingerprint on Android, an email code on the web) over the exact transaction.
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

## Find the code

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
| [`plan/`](plan), [`context/`](context)                                       | dated architecture and build logs, product cards, the Arc notes behind the agent's knowledge, and prior-work provenance    |

## Prior work and what was reused

The event opened on **2026-09-27**. This is where Kawase started.

- **This repository** begins with commit `be83488` on **2026-09-30** ("Bootstrap Kawase: monorepo scaffold, plan,
  research context, Stage 1 spikes"). Its history through 2026-10-15 falls inside the event. The bootstrap commit
  holds the research notes, the plan, the notes of the first spikes and the package scaffolds with the first constants
  and money types, all written during the event, plus Expo's starter template for the app. Nothing of Kawase existed
  before it.
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
- **How it was built:** by Abubakr Jimoh with AI coding agents (Claude Code; OpenAI Codex until 2026-10-02). The architecture, the product
  cards and the build logs are in [`plan/`](plan).
