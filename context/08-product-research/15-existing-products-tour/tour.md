# Existing products tour: what already exists in and around the Arc agent ecosystem, and what it looks like

Purpose: a visual and product walk-through of the nine products (or product families) closest to Abu's Arc agent. For each one it covers who it is for, its screens and user journey, what it looks like (local screenshots), its modality, which of our features it has or lacks, and whether it is live on Arc. It exists so Abu can see the landscape before choosing a direction.

Sources:
- Live scrapes with screenshots, 2026-09-29 (Firecrawl, 15 credits): `.firecrawl/product/15/*.json|*.md` and `.firecrawl/product/15/img/site-*.png`. Pages: portal.arc.io (`/`, `/earn`, `/swap`, `/send`, `/agent`), agents.circle.com (`/`, `/services`), 8004scan.io, bankr.bot, heyelsa.ai, keryx.cc, mimirmarkets.vercel.app, rubiconpay.xyz.
- Earlier Portal scrapes: `.firecrawl/product/census/arc-portal.md`, `portal-agent.md`, `portal-discover.md`; Arc mainnet blog `.firecrawl/product/census/arcio-blog-mainnet.md`.
- Sample-app screenshots copied from the repos: `refs/circlefin/<repo>/public/screenshot.png` → `.firecrawl/product/15/img/sample-<repo>.png`. Starter kits `refs/circlefin/agent-stack-starter-kits/demo.gif` (frame 600 extracted to `agent-stack-starter-kits-frame.png`).
- 8004scan API: `https://api.8004scan.io/api/v1/agents?chain_id=5042` → `.firecrawl/product/15/8004scan-arc-agents.json`, `8004scan-arc-top.json`.
- Robinhood newsroom image (Contentful asset in https://robinhood.com/us/en/newsroom/introducing-strategies-banking-and-cortex/) → `img/robinhood-cortex-2025.png`; Cortex Assistant disclosure `.firecrawl/product/robinhood-cortex-disclosure.txt`.
- Canteen showcase data `.firecrawl/canteen/showcase-data.js`, `showcase-awards.json`; GitHub API for `tang-vu/keryx`, `enliven17/mimir`.
- Prior research in this folder: `01-arc-ecosystem-census/`, `04-analogs-and-competitors/`, `context/02-circle-agent-stack/`, `context/04-sample-apps/`, `context/05-canteen-ecosystem/canteen-and-prior-events.md`.

Verified: 2026-09-29

How to read this file:
- Image paths are relative to this file. They point at local copies, because Firecrawl's hosted screenshot URLs expire on 2026-10-06.
- "Our features" means the groups A–U in `../FEATURE-INVENTORY.md`.
- Tags follow `../RESEARCH-RULES.md`. "Seen" means visible on the public page without signing in. Nothing behind a login was checked, because rule 8 forbids creating accounts.

---

## 1. Arc Portal (Circle), portal.arc.io

**What it is and who it's for.** Circle's own consumer hub for Arc. The hero text reads: "Explore Arc, all in one place. Swap, send, and put assets to work. Enable agents, with limits and permissions you control." [VERIFIED `img/site-portal-home.png`, `census/arc-portal.md`]. It targets retail users arriving on Arc. The mainnet blog says: "Arc Portal is where it all starts" (`census/arcio-blog-mainnet.md:173`) [VERIFIED].

**Screens (top nav: Home · Earn · Swap · Send · Agent · Discover, plus a theme toggle and "Get started"):**

| Screen | What's on it (seen) | Screenshot |
|---|---|---|
| Home | A banner reading "Bridge cirBTC to Arc". A big uppercase hero over orbiting BTC/USDC/EURC coin icons. An illustrative "$10,000 Circle Guarded Vault" growth chart. Feature tiles: agents, "USD → USDC onramp: Debit, Apple Pay, or Google Pay", swap, send, cirBTC. A partner logo row (Aave, Across, Aero, Morpho, Uniswap…) | ![](../../../.firecrawl/product/15/img/site-portal-home.png) |
| Earn | A scrolling list of vault cards: "Galaxy USDC · Circle Guarded · by Morpho · Est APY: *APY coming soon* · Total deposits $84.8M"; Gauntlet USDC Prime ($94.8K); Steakhouse Prime USDC. One "Deposit to Earn" button. A side panel lists "Compare lending opportunities / Control your own Deposits / Transparent by Design" | ![](../../../.firecrawl/product/15/img/site-portal-earn.png) |
| Swap | A classic two-box widget: USDC (Arc) → EURC (Arc), "Slippage tolerance 0.5% · Change", "Get started" | ![](../../../.firecrawl/product/15/img/site-portal-swap.png) |
| Send | A big "$0" amount entry, preset chips ($20, $50, $100, Max), a token row "USDC · Arc", "Get started". Side panel: "Instant Transfers / Global Reach / Low Network Fees" | ![](../../../.firecrawl/product/15/img/site-portal-send.png) |
| Agent | "Give your agents a wallet. Create a wallet with a spending cap, hand the setup prompt to Claude Code, Codex, or any AI agent — and it transacts on its own." A diagram fans a USDC coin out to agent logos. Four "Copy prompt" cards (e.g. "Watch ETH/USDC on Base, if it dips swap USDC into ETH"). A "Research · Agent" panel with priced tools: Polymarket data feed $0.012, Tavily $0.0612, X social signals $0.004, Browserbase $0.4012. A link to agents.circle.com | ![](../../../.firecrawl/product/15/img/site-portal-agent.png) |
| Discover | App cards linking out (Aave, Across, Aero, Binance, Bybit, Hibachi, Kraken, Maple, Morpho, OKX, Robinhood, Stargate, Synthra, Uniswap, XyloNet), plus an "Assets" tab | text only (`census/portal-discover.md`) |

**User journey.** Land on the portal, then "Get started" (sign-in or wallet connect; not inspected), then fund via onramp or bridge, then use one form per task (swap, send, earn). For agents: create an agent wallet with a spend cap, copy a prompt, paste it into an external coding agent, and that agent transacts. The blog confirms: "Users can create agent wallets directly in Arc Portal, set spend limits and permissions, and put agents to work on approved financial tasks with visibility and control" (`arcio-blog-mainnet.md:94`) [VERIFIED].

**Look and feel.** Dark navy with soft blue accents, thin-line orbit graphics, large light-weight type, pill buttons, a Circle-style fintech feel. It is a set of forms, not a chat.

**Modality.** Web app. No mobile app was found [UNKNOWN: not searched in app stores]. **There is no built-in chat or agent.** The "agent" is whatever the user brings (Claude Code, Codex).

**Our features: has / lacks** [INFERENCE from the public pages; nothing behind the login was checked]:
- **Has:**
  - A (onramp, get started).
  - C Send.
  - D swap (USDC↔EURC shown).
  - E bridge-in (cirBTC from Ethereum).
  - F Earn (Morpho "Circle Guarded" vaults).
  - N agent-wallet spend caps.
  - A marketplace teaser (G, prices only).
- **Lacks** (none of these are visible):
  - Conversation or voice (K, M).
  - Generative UI (L).
  - Automations (H); the only "automation" is a prompt you hand to someone else's agent.
  - Contacts (I).
  - Notification connectors (J).
  - Bridge price comparison (E1).
  - Meme-token trading (D2).
  - Testnet mode (A3).

**Live on Arc?** Yes, **mainnet** (the Earn page shows live Morpho deposit totals; the blog calls it live) [VERIFIED page]. No testnet version was seen.

---

## 2. Circle Agent Stack: agent wallets (CLI), Agent Marketplace, starter kits

**What it is and who it's for.** Developer infrastructure to "give your agent money". It has three parts:
- **Agent Wallets**: SCAs on 2-of-2 MPC, driven by the `circle` CLI.
- **Nanopayments / x402**.
- **Agent Marketplace**: a catalog of x402 services.

The audience is developers and power users who run Claude Code, Codex, Cursor or "Claws" [VERIFIED `site-agents-circle.png`, `context/02-circle-agent-stack/README.md`].

**Surfaces:**

| Surface | What it looks like | Screenshot |
|---|---|---|
| agents.circle.com home | Deep navy, monospace UI text, a huge headline "Your agent can **hit a paid API**." A primary button "Fund your agent in one prompt", "Works with Claude · Codex · Cursor · Claws + custom agents", and struck-through words "~~sign ups~~ ~~credit cards~~ ~~api keys~~ ~~subscriptions~~" next to "Payment as authentication." Six use-case prompts with per-run cost (e.g. "02 Voice — Brief me by phone … ~$5.55 · 3 calls" via Twilio and Bland). A seller section: "Your API is a storefront" | ![](../../../.firecrawl/product/15/img/site-agents-circle.png) |
| Marketplace `/services` | "Discover what your agent can do." Category chips (Creative, Data Enrichment, Financial Analysis, Infrastructure, Prediction Markets, Social Intelligence, Web Search Research) and a Network filter. The counter reads "107 SERVICES · 1336 ENDPOINTS", with 1P/3P badges and a table (0x via BlockRun, 2Captcha, AgentMail, **AgentPhone "Voice and SMS telephony for AI agents"**, AIsa, Alchemy…). A sticky "AGENT QUICKSTART: `npm install -g @circle-fin/cli` · Copy starter prompt" bar | ![](../../../.firecrawl/product/15/img/site-agents-circle-services.png) |
| Circle CLI | Terminal commands: `circle wallet login`, `wallet balance/transfer`, `bridge transfer`, `services pay`, `wallet limit set` (caps; **mainnet only**, email OTP) (`context/02-circle-agent-stack/circle-cli.md`, `guardrails-and-policies.md`) [VERIFIED] | — |
| Agent Stack starter kits (`refs/circlefin/agent-stack-starter-kits` @3996330) | An Ink-based terminal chat for six frameworks (Claude Agent SDK, OpenAI Agents, Vercel AI, LangChain, Mastra, Google ADK). A green "◆ Wallet Balance: $2.85 USDC on Base" readout is pinned in the chat, and `[tool] circle_list_wallets` lines scroll by. Before any money-moving command the exact command is printed and waits for `y/N` (README) [VERIFIED] | ![](../../../.firecrawl/product/15/img/agent-stack-starter-kits-frame.png) (full GIF: `img/agent-stack-starter-kits-demo.gif`) |

**User journey.** `npm i -g @circle-fin/cli`, then paste the starter prompt into your coding agent. The agent installs Circle skills, logs in by email OTP, gets wallets on every supported chain, is funded (testnet faucet or onramp), then searches the marketplace and pays per call. The human sets caps with `circle wallet limit set` [VERIFIED README/CLI docs].

**Modality.** CLI, plus a coding-agent harness, plus a web catalog. No consumer UI.

**Our features: has / lacks.**
- **Has:**
  - A (wallet auto-provisioned).
  - B, C (transfer).
  - E (CCTP bridge).
  - F (the undocumented `circle earn`, `circle-cli.md:168`).
  - **G (the whole marketplace)**.
  - N (per-tx/daily/weekly/monthly caps, allow/blocklists, OTP to change).
  - U3-style approval gate.
- **Lacks:**
  - Any end-user app, voice, languages, contacts, automations, notifications, generative UI, history UI.
  - Testnet policies ("Spending policies … are mainnet only") and testnet marketplace listings (0 on `eip155:5042002`) [VERIFIED `context/02-circle-agent-stack/README.md`].

**Live on Arc?** Yes. Agent Wallets support `ARC` and `ARC-TESTNET` (`agent-wallets.md:21`). The marketplace has 687 Arc-mainnet-payable endpoints [VERIFIED 2026-09-29 Discovery API, census §12]. The starter kits default to Base (the GIF shows "USDC on Base").

---

## 3. Bankr, bankr.bot

**What it is and who it's for.** "Capital and infra for the agent economy". It is a consumer and builder crypto agent: chat to trade, launch tokens, run automations, and use an x402 marketplace. It targets crypto-native traders and token builders [VERIFIED `img/site-bankr.png`].

**Screens (web terminal).** A left sidebar: *New Chat*; **Agent** (Chat, Wallet, Trade NEW, Automations); **Explore** (Discover Bankr tokens, Projects, **x402 Marketplace**, Metrics, Leaderboard, Stake BNKR); Build; Tools; Platform; Docs. The main area is a hero ("Launch your token" / "Chat with Bankr") with stats "Total volume $5.50B · Creator fees $23.64M · LLM tokens 121.5B", then partner cards (Bankr × Aerodrome) [VERIFIED `15/bankr.md:7-9`, screenshot].

![](../../../.firecrawl/product/15/img/site-bankr.png)

**User journey.** Sign in, chat ("buy $50 of X", "send 50 USDC to @handle"), and the agent executes within limits. Automations ("every day at 9am…") are managed in the sidebar. The same agent works from X (@bankrbot), Telegram, the CLI, or the Agent API, with state synced "because state lives on your wallet" [VERIFIED `04-analogs-and-competitors/ai-crypto-agents.md` §1].

**Look.** A dark theme with an orange pixel-robot mascot, purple CTAs, isometric "agent / API / token" illustrations. Trader-app energy.

**Modality.** Web chat, X bot, Telegram bot, Farcaster, CLI, REST API, Claude Code plugin.

**Our features: has / lacks.**
- **Has:**
  - A–D.
  - E (cross-chain).
  - G (x402 marketplace plus selling endpoints via x402 Cloud).
  - H (Agent Commands, limit/DCA/TWAP).
  - J (chat on Telegram/X).
  - L (partial: "Apps", sandboxed mini-dashboards).
  - M (memory files).
  - **N (the strongest safety set found)**.
  - O.
- **Lacks** [UNKNOWN in docs]:
  - Voice and multilingual.
  - A first-class contacts book (nicknames live in memory).
  - Settings-page notification connectors.
  - Testnet.

**Live on Arc?** Yes, but shallow, **mainnet only**. The docs list Arc for balances, transfers, raw transactions and token launches, and say: "No aggregator swaps yet (0x/Relay do not route Arc)" (`.firecrawl/product/bankr-getting-started-supported-chains.md:157-169`) [VERIFIED docs; no on-chain test]. The Bankr skill text on the live page lists "Chains: Base, Ethereum, … Robinhood Chain and Arc" (`15/bankr.md:1055`) [VERIFIED page].

---

## 4. Circle Arc sample apps (`refs/circlefin/*`)

**What they are.** Open-source reference apps that Circle ships for Arc builders. They are demos, not products: all testnet, several with auth gaps (`context/04-sample-apps/README.md` "Cross-cutting gotchas") [VERIFIED code review]. Nearly all are Next.js dashboards; the p2p app has a phone-shaped layout.

| Repo @sha | What the UI is | Look | Screenshot |
|---|---|---|---|
| arc-fintech @0b10d38 | "Circle Fintech Starter": a sidebar (Dashboard, Activity, Wallets, Compliance, Earn, Swap). USDC/EURC/Gateway balance headers, action buttons (Transfer, Payout▾, Rebalance, Add funds, New wallet), one card per chain (Arc Testnet, Base Sepolia, Avalanche Fuji, Ethereum Sepolia), a transaction-volume chart, activity and wallet lists, a search bar | Dark, orange accent, shadcn | ![](../../../.firecrawl/product/15/img/sample-arc-fintech.png) |
| arc-p2p-payments @1698907 | "Arc p2p Payments": a mobile-web card "USDC balance 20.00 USDC · Refresh · Fund Wallet". Bottom tab bar (balance, wallet, history). Passkey smart account | Dark navy, big blue pill | ![](../../../.firecrawl/product/15/img/sample-arc-p2p-payments.png) |
| arc-stablecoin-fx @779eb1a | "Arc FX": a Uniswap-style swap card (Sell 10 USDC → Buy 8.45804 EURC; Rate, App fee 0.25%, Slippage 0.5%). Top bar with balances and address | Dark slate | ![](../../../.firecrawl/product/15/img/sample-arc-stablecoin-fx.png) |
| arc-escrow @d5006bc | "Workflow Escrow": an account-balance card (Deposit, Withdraw, "Request 20 USDC via Faucet"), "Create new agreement" (recipient + upload contract), In-progress/Closed agreements table, transactions table | Dark, orange buttons | ![](../../../.firecrawl/product/15/img/sample-arc-escrow.png) |
| arc-nanopayments @a29f920 | A seller dashboard, "Welcome back! Monitor incoming nanopayments": a table of tx, payer, endpoint (`/api/premium/quote`…), amounts $0.001–$0.01; a Gateway balance pill; Withdraw | Light, minimal | ![](../../../.firecrawl/product/15/img/sample-arc-nanopayments.png) |
| arc-commerce @1a3a5e0 | "Dashboard": a wallet-status card (network badge "Arc Testnet", USDC balance); Purchase Credits ($10/$25/$50/$100 chips, "Pay with USDC · Powered by Circle"); a history table with filters | Light shadcn | ![](../../../.firecrawl/product/15/img/sample-arc-commerce.png) |
| arc-multichain-wallet @3bca13f | Wallet setup, a "USDC Balance Overview" (Gateway 11.00 plus per-chain rows), a Deposit/Transfer tab card, transaction history | Light | ![](../../../.firecrawl/product/15/img/sample-arc-multichain-wallet.png) |
| arc-ecommerce-payments @be2017d | "Arc eCommerce": a storefront grid of emoji products priced in USDC, a USDC/EURC toggle, cart; "Faster checkout. Safer payments. No hidden fees." | Dark, playful | ![](../../../.firecrawl/product/15/img/sample-arc-ecommerce-payments.png) |
| arc-prediction-markets @0f40195 | "Arc Markets": category chips; market cards with % chance and Buy Yes / Buy No; faucet; passkey badge; "Arc Testnet" | Near-black, green/red | ![](../../../.firecrawl/product/15/img/sample-arc-prediction-markets.png) |
| arc-defi-lend-borrow @d621644 | "cirBTC Lending": four stat tiles, Collateral (Deposit/Withdraw) and Loan (Borrow/Repay) cards with amount chips, history, "How it works" | Near-black, blue CTA | ![](../../../.firecrawl/product/15/img/sample-arc-defi-lend-borrow.png) |
| skills @58ab864 | README banner for Circle's 18 AI-coding skills | — | ![](../../../.firecrawl/product/15/img/circle-skills-readme.png) |
| arc-x402-circle-wallets, docs-examples, circle-cctp-fulfiller-repayment, sidequestor, arc-remote-signer | No UI screenshot (README stub, Vite demos, scripts, Python agent, Go signer) | — | — |

**Journey pattern.** Every app follows the same arc: sign in or passkey, see the balance card, use one form per action, then read a transaction table. **None has chat, voice, or an agent loop that moves money** ("No sample has a real LLM agent loop that moves money on Arc", `context/04-sample-apps/README.md`) [VERIFIED].

**Modality.** Web (Next.js); arc-p2p is mobile-web.

**Our features: has / lacks.**
- **Has** building blocks for:
  - A (passkey, email).
  - B (multi-chain balances).
  - C, E (App Kit send/bridge).
  - D (FX only).
  - F (Earn).
  - G seller side.
  - N (compliance screening, arc-fintech only).
  - O (tables).
  - R (commerce, escrow, treasury).
- **Lacks:** everything in the agent layer (K, L, M, H, I, J, T).

**Live on Arc?** Repos only, **testnet**. There are no hosted instances [VERIFIED READMEs].

---

## 5. Past Canteen × Arc hackathon winners (Agora, May 2026; Lepton, Jun–Jul 2026)

These are the closest "what judges rewarded" references (full table in `context/05-canteen-ecosystem/canteen-and-prior-events.md`).

### Keryx: Lepton 1st (Tang Minh Vu, solo), keryx.cc
- **What.** "Citations are currency. Keryx buys sources, answers with citations, and pays their authors." A research agent pays x402 tolls per source and then settles weighted USDC to cited creators [VERIFIED `15/keryx.md`].
- **Screens.**
  - Nav: Ask a question · Payments & proof · Past answers · Sources · For creators · Connect wallet.
  - A dark ticker band "ARC TESTNET · SETTLED CITATIONS" (it showed "Payment feed unavailable. Retry" at scrape time).
  - An "ASK KERYX" form with Research depth (Quick/Deep), **"Maximum budget $0.050 — The agent cannot spend more than this amount on one question"**, and a model picker (DeepSeek, MiMo).
  - Lifetime counters ("$54.71 paid to creators · 11,455 settled payments").
  - A three-step "Decide · Cite · Settle" explainer.
  - A scrolling ledger of "Stablecoin Ledger cited $0.0125 · 11h ago".
- **Look.** An editorial newspaper style: cream paper, serif display type, a red wax-seal "K" logo, a globe engraving.

  ![](../../../.firecrawl/product/15/img/site-keryx.png)
- **Modality.** Web app, plus **an MCP server (`keryx-mcp` on npm) "plugs the whole loop into any MCP-capable agent"** (repo README badges; showcase summary in `.firecrawl/canteen/showcase-data.js`) [VERIFIED README/showcase]. So other agents can use Keryx.
- **Our features.**
  - Has: G (buys x402 services autonomously with a per-question cap), M6 (a buy/skip rationale per source), O (public proof ledger), N (a non-custodial spend cap).
  - Lacks: everything wallet/consumer (C–F, H–L).
- **Arc.** **Testnet** ("Real settlement evidence on Arc testnet"; registry contract on testnet.arcscan.app) [VERIFIED page]. The repo was pushed 2026-09-29 [VERIFIED gh api].

### Mimir: Agora 1st (Cankat Polat, solo), mimirmarkets.vercel.app
- **What.** "DON'T ARGUE. SETTLE. WITH Mimir." An AI-settled peer-to-peer claim market: challenge, invite, accept, then an AI-council verdict, with USDC stakes [VERIFIED WebFetch + screenshot].
- **Screens.** A landing hero on an ASCII-art background; "Explore challenges / Challenge someone"; stats tiles ("149 total challenges · 109 verdicts · 4,045 USDC staked · 288,396 x402 payments · 288.40 USDC earned · 5 agent wallets paid", self-reported on the page); Launch App (Explorer, Create Challenge, Challenge Arena, Docs).
- **Look.** A navy blueprint grid, monospace, terminal aesthetic.

  ![](../../../.firecrawl/product/15/img/site-mimir.png)
- **Modality.** Web.
- **Our features.** Has G/M (agent council, x402). Lacks the consumer wallet features.
- **Arc.** The landing page names Arc but **not the network** [UNKNOWN]. Agora ran in May 2026, before mainnet (2026-09-16), so it was built on testnet [INFERENCE].

### Rubicon: Lepton 2nd, rubiconpay.xyz (shown for its UI)
"Give agents better material to reason from." A light, editorial page with an "Example read" card where "each word unlocks as a tiny payment settles". It ships a CLI and an agent SDK that signs with Circle Agent Wallets (`canteen-and-prior-events.md`) [VERIFIED page/showcase].
![](../../../.firecrawl/product/15/img/site-rubicon.png)

### Consumer-wallet-like projects in the showcase (none won an award) [VERIFIED `showcase-data.js`, `award_label` = null]
- **PayIT**: a Telegram USDC/EURC wallet bot with voice and image intent parsing (t.me/payeetbot).
- **ArcCopilot** (GoGoSns): a Chrome extension with a Circle W3S agent wallet, weekly budget, per-tip cap and allowlist.
- **Woosh**: payment links, invoices, and a strategy registry for recurring payments and DCA.
- **USDC Copilot**: a CCTP treasury agent.
- **Arcox MCP**: DEX flows exposed as MCP tools.

**Takeaway [INFERENCE]:** consumer-wallet agents were built, but the awards went to projects where the agent makes an economic decision, explains it, and pays other services under a hard cap. That matches the judging weights (30% agentic sophistication, 30% traction).

---

## 6. HeyElsa, heyelsa.ai

**What it is and who it's for.** "Your AI Crypto Copilot. Elsa helps you discover opportunities, execute trades, and manage your portfolio through simple conversations. No dashboards to learn." Aimed at retail crypto users. The page claims "945K+ wallets. 18.9M+ prompts processed. $503M+ in total volume"; backers shown are M31 Capital and Base Ecosystem Fund [VERIFIED page; the numbers are self-reported].

**Screens (landing).** Nav: Infero · Fixy · x402 · Aegis · CLI · a language picker "EN" · Launch App. The hero sits beside a **chat mock-up** (user: "I want to create a portfolio" → Elsa: "Do you want suggestions based on trends…"). Feature blocks: Smart Portfolio Building, Effortless Transactions ("Swap, bridge, or send assets in one step"), Returns on Autopilot (yield), Learn as You Go, Built-In Risk Protection, **"Speaks Your Language: Chat or talk to Elsa in multiple languages"** (with sample bubbles in Arabic, Hindi, Portuguese, English, Chinese, Japanese), multi-model routing, Limit Orders [VERIFIED `15/heyelsa.md:95-240`].

![](../../../.firecrawl/product/15/img/site-heyelsa.png)

**Look.** Light, airy, a painterly Ghibli-like illustration, a cute robot mascot, a grid background. The friendliest consumer look in this set.

**Modality.** A web app (the app itself was not opened), a CLI, and x402 APIs. Voice: "chat or talk" [REPORTED marketing].

**Our features.**
- Has (per marketing): B, C, D, E, F (yield autopilot), H (limit orders), **K (voice + multilingual)**, L (chat), N (risk checks).
- Unknown: I, J, O, testnet.

**Live on Arc?** [REPORTED, ambiguous]. Bitget's dapp page lists "Arc" among Elsa's chains, with no chain ID or date beyond June 2025 (https://web3.bitget.com/dapp/heyelsa-30012). It may not be Circle's Arc. The heyelsa.ai landing page does not mention Arc [VERIFIED absence in `15/heyelsa.md`].

---

## 7. Robinhood Cortex (Assistant)

**What it is and who it's for.** Robinhood's AI layer for Gold subscribers ($5/mo [REPORTED]). It was announced in 2025 as insights-only: "Robinhood Cortex is not placing trades for you" [VERIFIED newsroom]. The 2026 Assistant disclosure says it can "initiate certain supported transactions using natural language text or voice input", and it is "available to eligible Robinhood Gold subscribers through the Robinhood app on iOS" [VERIFIED `robinhood-cortex-disclosure.txt` §1].

**Screens (launch image, "for illustrative purposes only").** Three phone screens:
1. A stock chart with an inline "RALI Digest →" summary and a green Trade button.
2. A full-screen Digest ("Retail Sentiment Shift Signals Caution") with a **"Listen" audio button**.
3. A dotted "4 insights available" scanner map with green and orange pins.

![](../../../.firecrawl/product/15/img/robinhood-cortex-2025.png)

**Journey.** Ask by text or voice. The Assistant answers, then presents "a pre-filled order ticket or confirmation screen", and "No transaction will be executed without your explicit confirmation" [VERIFIED disclosure §6]. It uses no open web and no social media (§5).

**Look.** Black, Robinhood green, native iOS, dense data visualization.

**Modality.** Native iOS only.

**Our features.**
- Has: B, C (fund transfers), D (stocks, crypto, prediction markets [REPORTED]), J8 (alerts), K (voice input plus audio digests), **L (pre-filled confirmation tickets)**, M.
- Lacks: E, F, G, I, Android, desktop.
- Languages: [UNKNOWN].

**Live on Arc?** No. Robinhood appears on Portal Discover as an exchange link (`census/portal-discover.md`), which is not Cortex.

---

## 8. Coinbase: Coinbase for Agents, Base MCP, Agentic Wallets, Coinbase Wallet

**What they are.** Coinbase's agent features, spread across several surfaces rather than one app:
- **Coinbase for Agents** (2026-06-11): ChatGPT or Claude connects to your Coinbase account to trade spot and derivatives and to pay for services over x402, inside "isolated portfolios" with "spending caps, trade limits and restrictions on which services they can access" [REPORTED https://www.coindesk.com/tech/2026/06/11/coinbase-launches-ai-agent-accounts-that-can-trade-and-spend-on-your-behalf].
- **Base MCP** (2026-05-26): connects a Base Account to ChatGPT, Claude or Cursor to send, swap, check balances and history, and use Morpho, Moonwell, Uniswap, Aerodrome, Avantis, Bankr and Virtuals. "Every action must be confirmed by the user", with asset changes simulated first [REPORTED https://www.coindesk.com/tech/2026/05/26/coinbase-s-base-launches-ai-tool-for-chatgpt-to-manage-crypto-wallets-and-defi-apps].
- **Agentic Wallets** (2026-02-11): an MPC wallet for agents with session caps and x402, installed via `npx awal` or MCP [REPORTED https://eco.com/support/en/articles/14845485-coinbase-agentic-wallets-explained; primary docs https://docs.cdp.coinbase.com/agentic-wallet/welcome not opened].
- **Coinbase Wallet** (renamed from Base App, 2026-09): XMTP chat agents in the messenger; the social push was rolled back [REPORTED, `04-analogs-and-competitors/ai-crypto-agents.md` §3].

**What it looks like.** There is **no first-party agent UI**. The agent is ChatGPT or Claude, and Coinbase supplies tools plus its standard transaction-review sheet. No screenshots were captured: the coinbase.com blog returned 403, and the Base chat-agents docs URL now serves an unrelated overview page [VERIFIED `og-images.txt`, WebFetch].

**Modality.** MCP inside third-party chat apps, a CLI, and in-wallet chat (XMTP).

**Our features.** Has B, C, D, F (via Base MCP apps), G (x402), N (caps, isolated portfolio), L-lite (the review and simulation sheet). Lacks voice, languages, contacts, automations beyond "a trade a day" style strategies, and a notifications UI [INFERENCE from coverage].

**Live on Arc?** No. The Arc blog says "Coinbase and others will be live on Arc soon" [REPORTED `census/arcio-blog-mainnet.md`]. Base MCP and Agentic Wallets are Base-centric.

---

## 9. 8004scan, 8004scan.io (the ERC-8004 agent explorer)

**What it is and who it's for.** A block-explorer-style directory of on-chain AI agents registered under ERC-8004 across many chains. It is for agent builders and for agents looking for other agents. Nav: Agents · Networks · Leaderboard · Donate · Builder Hub · Crypto Skills · AltLLM, with a "Mainnet" badge and Log In [VERIFIED screenshot].

**Screens.**
- A hero "Discover AI Agents on **ERC-8004**" with a search box, "Browse Agents" and "Create Agent".
- "Latest Agents" cards (avatar, chain badge, score, minutes ago). One is "Agent #336" on **Arc Mainnet**, linking to `8004scan.io/agents/arc/336`.
- A "Landscape of Onchain Agents" report and featured-agent cards (Toppa, Clawdia, OpenOdds…) [VERIFIED `15/8004scan.md`].

![](../../../.firecrawl/product/15/img/site-8004scan.png)

**Look.** Light with violet gradients, star-dust background, cartoon robot avatars. An Etherscan-meets-app-store feel.

**Modality.** Web plus a public JSON API (`api.8004scan.io/api/v1/agents`).

**What's on Arc (API, 2026-09-29)** [VERIFIED `8004scan-arc-agents.json`, `8004scan-arc-top.json`]:
- `total: 336` agents with `chain_id 5042`, `is_testnet: false`.
- In the top 100 by score: 95 have `x402_supported: true`; 39 advertise A2A, 26 MCP, 39 Web.
- Top Arc agents: "Roger, StatPad's NFL analyst" (score 19.88), "Fuci", "APEX Faucet" (#1), "APEX Watchtower" (#211, "Calls every agent registered on Arc once an hour and records who actually answers"), "AgentKarma" (a reputation layer).
- Many are a single family ("Fuci kelp forest", Argus launch scouts) that pay for market data over x402.

**Our features.** Has G-adjacent discovery of agents (not services) and reputation scores. None of the wallet or consumer features.

**Live on Arc?** Yes, it indexes the **mainnet** IdentityRegistry `0x8004a169…a432` [VERIFIED API; the registry was also RPC-checked in `01-arc-ecosystem-census/apps-and-protocols.md` §11].

---

## Gaps in this tour

- Nothing behind a login was viewed: Portal's signed-in dashboard and agent-wallet creation, Bankr's chat, the HeyElsa app, Mimir's app. Screens after "Get started" are [UNKNOWN].
- Coinbase and Base agent UIs: no primary screenshot (403, and a docs URL that moved).
- HeyElsa's "Arc" entry is not tied to chain 5042.
- The Robinhood image is the 2025 concept art, not the 2026 Assistant UI.
- Mobile apps for Arc Portal and HeyElsa were not searched in the app stores.
