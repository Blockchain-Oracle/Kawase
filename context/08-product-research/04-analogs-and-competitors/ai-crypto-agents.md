# AI crypto agents and agent wallets: what exists, what they do, what to copy

Purpose: survey of shipped chat and app-style AI crypto agents and agent-wallet products, for feature and UX parity with the planned Arc agent app.

Sources (primary evidence saved under `.firecrawl/product/`):
- Bankr docs: https://docs.bankr.bot/llms.txt, plus pages saved as `.firecrawl/product/bankr-*.md` (supported chains, automations, security, access, transfers, memory, agent overview)
- Circle Agent Stack docs: `.firecrawl/docs/circle-llms-full.txt:844-960`, `:1104-1125`, `:1368-1395`
- GitHub metadata: `.firecrawl/product/gh-repos-2026-09-29.tsv`, `.firecrawl/product/circlefin-agent-arc-repos.tsv`
- Site liveness checks (HTTP status and title): `.firecrawl/product/site-status-2026-09-29.txt`
- Other URLs are cited inline.

Verified: 2026-09-29

Tag key: [VERIFIED] = primary source checked today; [REPORTED] = secondary source; [INFERENCE] = my reasoning; [UNKNOWN] = looked, not found.

---

## 0. Does anything already target Arc? (The key question)

| Product | Arc evidence | Proof level | What it does on Arc |
|---|---|---|---|
| **Bankr** | The docs "Supported Chains" table lists `Arc` (EVM, native token USDC, no gas sponsorship). The deploy API says `chain: "arc"` deploys "on Arc (chain ID 5042)" (`.firecrawl/product/bankr-getting-started-supported-chains.md:157-169`, `bankr-deploy.md:40`) | [VERIFIED] docs page with chain ID 5042 (**mainnet**). No contract call was checked. | "Balances and USDC/ERC-20 transfers; Raw transactions, contract deploys; Token launches on Bankr Launch v3". Also: "**No aggregator swaps yet** (0x/Relay do not route Arc). Gas is paid in native USDC and is not sponsored." |
| **Circle Agent Wallets** (Agent Stack + Circle CLI) | The supported-blockchains table lists `ARC` / `ARC-TESTNET` (`circle-llms-full.txt:1104-1120`) | [VERIFIED] docs | Developer/CLI agent wallet: transfer, CCTP bridge, swap, x402 pay. It is not a consumer app. |
| **Circle sample repos** | `arc-x402-circle-wallets` (Arc **testnet**, "no human in the loop"), `arc-nanopayments` (LangChain payment agent), `arc-escrow` (AI-validated deliverables), `agent-stack-starter-kits` (`.firecrawl/product/circlefin-agent-arc-repos.tsv`) | [VERIFIED] GitHub API | These are demos, not products. |
| **Arc Studio** (Circle, 2026-09-18) | An AI *coding* agent that generates on-chain apps. It exports code and "does not submit mainnet transactions directly". https://en.cryptonomist.ch/2026/09/18/circle-arc-studio-ai/ | [REPORTED] | This is for developers, not a consumer wallet agent. |
| A voice app that turns speech into USDC payment agreements on Arc testnet | Mentioned in search results for the lablab "AI Agents on Arc with USDC" hackathon recap (https://lablab.ai/event/ai-agents-arc-usdc) | [REPORTED], hackathon project | Not a shipped product. |

**Conclusion [INFERENCE]:** Abu's premise is mostly right. No consumer, multi-surface, mobile-first agent covers the whole Arc ecosystem (swap, bridge, yield, x402 marketplace, automations, voice). **But Bankr already runs on Arc mainnet**, for transfers and token launches only, so "nothing exists on Arc" is not strictly true. Bankr is the most direct competitor, and its missing Arc swaps are a gap to exploit. Arc mainnet went live 2026-09-16 [REPORTED: https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026].

---

## 1. Consumer chat agents (they execute on-chain from a chat)

### Bankr: the closest analog and the best-documented product
- **Status:** Live [VERIFIED: bankr.bot returns 200; docs updated; `BankrBot/skills` pushed 2026-09-28]. In 2026-09 it added wallets for Meta's Muse agents [REPORTED: https://chainwire.org/2026/09/17/bankr-enables-crypto-wallets-and-onchain-financial-activity-for-muse-agents/].
- **Surfaces:** web terminal, X (`@bankrbot`), Telegram (`@bankr_ai_bot`), CLI, Agent API, webhooks, and Claude Code plugins. It is "One agent", and its state (memory, automations, preferences) "syncs to all of them because state lives on your wallet" [VERIFIED: `bankr-agent-overview.md:36-45`]. Farcaster is supported as a login and handle surface [VERIFIED: `bankr-deploy.md:30,37`].
- **Actions:** swaps (0x/Relay), cross-chain swaps, transfers, limit/stop/DCA/TWAP orders, tokenized stocks (not US/UK), leverage via Hyperliquid and Avantis, Polymarket, NFTs, token launch with fee earning, portfolio/PnL, browser automation, an x402 Cloud for selling paid endpoints, and an LLM gateway [VERIFIED: `bankr-llms.txt` index].
- **Name resolution:** send to an address, an ENS name or Basename, an X handle, a Farcaster handle, or a Telegram handle (`"send 50 USDC to @telegramhandle"`) [VERIFIED: `bankr-features-transfers.md`]. There is no address-book UI in the docs. Instead, "Nicknames for your wallets" are stored in memory files [VERIFIED: `bankr-agent-memory.md:53`].
- **Confirmations:** "an explicit transfer goes out right away — Bankr only asks first when the amount, token or recipient is unclear" [VERIFIED: `bankr-features-transfers.md:141-143`]. Users can set their own confirmation rules in memory, e.g. "never confirm trades under $50" [VERIFIED: `bankr-agent-memory.md:13`].
- **Limits and safety (the strongest set seen)** [VERIFIED: `bankr-security-bankr-terminal.md`]:
  - $500 per transaction and a $500 rolling 24h limit by default.
  - A "Pause all transactions" kill switch.
  - A permitted-recipients allowlist. New recipients have a **24h cooldown**.
  - Price-impact protection (default 15%).
  - A toggle for arbitrary contract calls.
  - **Timers** that loosen a control for 10 min, 30 min, 1h or 24h and then automatically restore it.
  - Fail-closed behavior when pricing is unavailable.
  - Passkey MFA step-up for any security change. An API key cannot change limits.
  - A list of active sessions.
  - Per-channel "response channels" toggles for X, Farcaster and Telegram.
  - Error messages that spell out the numbers, e.g. "(spent so far: $410.00, this transaction: $120.00)".
- **Automations:** limit, stop and trailing stop orders; DCA; TWAP; vesting sell; and **"Agent Command"**, which runs any prompt on a schedule, e.g. "every day at 9am, check the price of ETH and send me a summary". Caps: 20 agent commands with Club; DCA at least 1h apart and at most 24 runs a day. Users manage them with "show my automations", "cancel all my automations", and a sidebar view to pause, resume and edit [VERIFIED: `bankr-agent-automations.md`].
- **Memory:** durable per-user memory files (persona, preferred chain, trading rules), editable directly [VERIFIED: `bankr-agent-memory.md`].
- **Apps:** users describe "mini-dashboards and tools … in plain English". Bankr writes a sandboxed iframe app with declared permissions [VERIFIED: `bankr-llms.txt` "Apps Overview"]. This is a form of generative UI.
- **Voice / multilingual:** [UNKNOWN]. Neither appears in the docs index.
- **Pricing:** Free is 5 messages a day on the terminal only. Bankr Club is **$20/mo or $198/yr**. Max Mode is pay-per-token for premium models. Revenue also comes from token-launch trading fees [VERIFIED: `bankr-agent-access.md:9-17`; `bankr-deploy.md:42`].
- **Complaints and incidents:** In 2026-05, Grok plus Bankr was prompt-injected via Morse code on X after an attacker sent a Bankr Club NFT that unlocked tools. About 3B DRB (~$150–200K) was drained, and about 80% was returned [REPORTED: https://oecd.ai/en/incidents/2026-05-04-4a73, https://slowmist.medium.com/behind-the-grok-exploitation-an-analysis-of-ai-agent-permission-chain-abuse-4d832d1bfc73]. It was also temporarily suspended on X and Telegram [REPORTED: search summary; primary article not opened, so treat as unconfirmed]. Free users on X are "silently ignored" [VERIFIED: `bankr-agent-access.md:34`], a UX dead end.

### HeyElsa (Elsa AI crypto copilot)
- **Status:** Live [VERIFIED: heyelsa.ai 200]. Raised $3M in 2025 [REPORTED: https://www.cmointern.com/2025/06/heyelsa-raises-3m-for-ai-crypto-copilot.html].
- **Features:** swap, bridge, send, portfolio allocation/rebalancing, limit orders, yield scanning. The site claims "945K+ wallets, 18.9M+ prompts, $503M+ volume" [REPORTED: homepage via WebFetch, https://www.heyelsa.ai/].
- **Multilingual:** Arabic, Hindi, Spanish, Chinese, Japanese, Korean and English per the homepage [REPORTED via WebFetch summary]. **Voice** is described as "natural language and voice prompts" [REPORTED: https://dappradar.com/dapp/heyelsa-ai].
- **Safety:** "Every transaction is checked for risks and validated before execution" [REPORTED: homepage]. Its x402 API defaults to **dry-run mode** [REPORTED: https://x402.heyelsa.ai/docs].
- **Business model:** ELSA token. APIs are sold pay-per-call over x402 in USDC or ELSA on Base [REPORTED: https://x.com/HeyElsaAI/status/1996914985033760870].
- **Complaints:** [UNKNOWN]. None were found in search.

### HeyAnon
- **Status:** Live [VERIFIED: heyanon.ai 200]. Founded by Daniele Sesta, who coined "DeFAI" around January 2025 [REPORTED: https://thedefiant.io/news/defi/daniele-sesta-s-ai-project-goes-parabolic-coins-the-term-defai].
- **Features:** bridge, swap, stake and borrow from chat. News and sentiment are aggregated from X, Telegram, Discord and GitHub. It includes the "Gemma" research companion and the AUTOMATE TypeScript framework [REPORTED: https://docs.heyanon.ai/heyanon.ai, https://messari.io/report/heyanon-introduces-ai-to-trading-with-defai].
- **Model:** the human prompts, and the user "sign[s] the transaction" [REPORTED: The Defiant]. It uses the ANON token.
- **Voice, multilingual, limits:** [UNKNOWN].

### Griffain (Solana)
- **Status:** Live site, but it shows only a "Booting up the network" splash page [VERIFIED: griffain.com, 2026-09-29]. Launched late 2024 [REPORTED: https://solanacompass.com/projects/griffain].
- **Features:** a personal agent minted as a soulbound NFT (1 SOL, 0.5 SOL credited back) [REPORTED: https://x.com/solana_daily/status/1866366491060519053]. "Special agents" include a Sniper for pump.fun launches and a Flipper. Users set per-agent transaction limits, approved protocols and rules [REPORTED: CoinMarketCap/Crypto.com summaries; https://griffain.com/docs/sniper].
- **Model:** GRIFFAIN token.
- **Notifications, voice, multilingual:** [UNKNOWN].

### Wayfinder (Parallel Studios)
- **Status:** Live app (app.wayfinder.ai returns a login page) [VERIFIED]. Its Open Alpha added cross-chain trading, perps and predictions. A **Paths plugin marketplace** launched 2026-06-04, and Solana support came 2026-07-29 [REPORTED: https://coinmarketcap.com/cmc-ai/wayfinder/latest-updates/].
- **Model:** each "Shell" (agent) gets its own wallet and runs "Paths" (skills). Users stake PROMPT to access agents [REPORTED: https://learn.bybit.com/en/ai/what-is-wayfinder-prompt].
- **Limits, voice:** [UNKNOWN].

### Slate
- **Pitch:** "type a command … see the generated transaction pathway, hit confirm … fully self-custodially". Raised $4M+ [REPORTED: https://nftm8trix.substack.com/p/plug-slate].
- **Status:** **Probably defunct or pivoted [INFERENCE]**. slate.ceo now serves a "Precursor Labs" page about "collective intelligence" [VERIFIED: `site-status-2026-09-29.txt`]. The pattern worth keeping: **show the multi-step path before confirming**.

### Dawn (Dawn AI in Dawn Wallet)
- **Features:** a natural-language agent inside an iOS self-custody wallet, covering send, swap, loans, bridge, balances, NFT and Aave rates [REPORTED: https://dawn.mirror.xyz/FfACsjIOJThaol4bxb8ZmTO-tqqrvUF4SAQqrs7qWy0].
- **Status:** **Defunct.** It was acquired by Tools for Humanity (World App) and sunset in June 2025. Users were told to export keys [REPORTED: https://crypto.news/world-apps-parent-company-acquires-dawn-wallet-warns-of-an-app-wind-down/]. dawnwallet.xyz returns 404 [VERIFIED].

### Brian AI (intent-to-transaction API)
- **Features:** prompt to calldata for swap, bridge, transfer, deposit, borrow and repay; a knowledge endpoint with citations; and Solidity generation [REPORTED: https://docs.brianknows.org/].
- **Status:** **Likely inactive [INFERENCE]**. The SDK repo was last pushed 2025-01-24 [VERIFIED: GitHub API], and brianknows.org did not respond from our network [VERIFIED: `site-status-2026-09-29.txt`].
- **Lesson:** a pure intent API is a thin moat.

### Orbit (SphereOne)
- **Status:** It started as a consumer DeFi copilot (swap, bridge, stake, lend) [REPORTED: https://cryptopotato.com/top-defai-projects/]. The site now pitches an "Autonomous Treasury Engine" for agents [VERIFIED: orbitcryptoai.com title]. **Pivoted to B2B/agent infrastructure [INFERENCE].**

---

## 2. Delegated and autonomous yield agents (deposit once, the agent manages)

| Product | Status | What it does | Safety / UX notes | Model |
|---|---|---|---|---|
| **Giza Agent** (replaced ARMA) | Launched 2026-03-11. ARMA and Pulse were sunset a month later [REPORTED: https://www.blocmates.com/articles/the-giza-agent-openclaw-for-onchain-finance] | Stablecoin lending optimization across Aave, Compound, Morpho and others; auto-compounding. ARMA earlier on Base: "$32M … 102,000 transactions" [REPORTED: https://finbold.com/gizas-autonomous-yield-optimization-agent-arma-goes-live-on-the-base-network/] | **"Giza Thoughts"**, a daily human-readable log of what the agent did; the "Giza World" movement visualization; user constraints (protocol exclusions, concentration limits); smart-account session keys | GIZA token, fees [UNKNOWN] |
| **Olas Pearl** | Pearl v1 released 2025-11-04 [REPORTED: https://www.coindesk.com/tech/2025/11/04/olas-launches-pearl-v1-the-first-ai-agent-app-store] | Desktop "agent app store" (Windows, macOS, Linux; no mobile). Agents: Connect, Polystrat, Omenstrat, Basius. Optimus/Modius are currently listed as unavailable [REPORTED: https://www.pearl.you/ via WebFetch] | Runs locally, Safe wallets, Google/Apple recovery. Has a **Co-Pilot mode vs. Autonomous mode** toggle | Users earn OLAS staking rewards |
| **Almanak** | Live (almanak.co: "Your Agentic Hedge Fund") [VERIFIED title] | AI swarm writes, backtests and deploys strategies as tokenized vaults. Partnered with Bybit and Mantle in 2025-12 [REPORTED: https://www.blocmates.com/articles/almanak-your-personal-ai-quant] | Aimed at pro and quant users | ALMANAK token, vault fees |
| **Orbit** | See above | Autonomous treasury and yield across 8+ chains | Aimed at B2B | [UNKNOWN] |

---

## 3. Big-wallet and exchange agent features (2026 incumbents)

| Product | Date / status | What it does | Confirmations and limits |
|---|---|---|---|
| **MetaMask Agent Wallet** | Early access (CLI) 2026-06-08; broad availability around 2026-08 [REPORTED: https://www.coindesk.com/tech/2026/06/08/metamask-launches-ai-agent-wallet-with-built-in-security-for-crypto-trades; https://metamask.io/news/introducing-metamask-agent-wallet] | Swaps, perps, prediction markets and LP across ~10–12 networks. Connects to Claude Code, Codex, OpenClaw and Cursor. Gas is paid in the token being moved | **Guard Mode** (default: daily spend limit, protocol allowlist, human approval when outside the policy) vs. **Beast Mode** (fewer prompts, checks still run). Blockaid threat scan, simulation and MEV protection. **2FA approval via MetaMask Mobile or an email link** for flagged transactions. Transaction Protection up to $10K/month |
| **Coinbase for Agents** | 2026-06-11 [REPORTED: https://www.coindesk.com/tech/2026/06/11/coinbase-launches-ai-agent-accounts-that-can-trade-and-spend-on-your-behalf] | ChatGPT or Claude connects to a Coinbase account for spot and derivatives trading, "a trade a day for a week", thesis-driven strategies, and x402 payments | **Isolated portfolio** option, spending caps, trade limits, and a service allowlist |
| **Base MCP** | 2026-05-26 [REPORTED: https://www.coindesk.com/tech/2026/05/26/coinbase-s-base-launches-ai-tool-for-chatgpt-to-manage-crypto-wallets-and-defi-apps] | Send, swap, balances, history, Morpho, Moonwell, Uniswap and Avantis from ChatGPT or Claude | [UNKNOWN] |
| **Base App → Coinbase Wallet** | Renamed Base App in 2025-07; **reverted to "Coinbase Wallet" in 2026-09** after the "social experiment" fell short [REPORTED: https://www.theblock.co/news/defi/2026-09-10-coinbase-rebrands-base-app-back-to-coinbase-wallet-after-just-over-a-year-as-social-experiment-falls-short-414115]; base.app title is now "Coinbase Wallet — Built To Trade" [VERIFIED] | XMTP chat agents inside the wallet's messenger. Examples include "split dinner $200 4 ways" and "buy 100 ETH when it hits 3,000" [REPORTED: search summary of docs.base.org/base-app/agents/chat-agents; the page fetch returned unrelated content] | Transactions go to the user's wallet for signing [INFERENCE from the XMTP agent model]. **Lesson: chat-plus-social inside a wallet did not stick; trading did.** |
| **Coinbase AgentKit** | Live; repo pushed 2026-09-03, 1,319 stars [VERIFIED: GitHub API] | A developer SDK with 50+ actions (transfer, swap, deploy, NFT) for LangChain, Vercel AI SDK and MCP [REPORTED: https://github.com/coinbase/agentkit] | Developer tool, not a consumer app |
| **x402 (Coinbase)** | Live; repo pushed 2026-09-26 [VERIFIED: GitHub API] | HTTP 402 pay-per-request. Adopted by Venice, HeyElsa, Zerion, Bankr x402 Cloud and Circle Agent Stack | Relevant to Arc's "marketplace" |
| **Trust Wallet AI + TWAK** | Agent Kit 2026-03 (Forbes, https://www.forbes.com/sites/ninabambysheva/2026/03/26/...); in-app **Trust Wallet AI** 2026-07-21 [REPORTED: https://u.today/trust-wallet-launches-ai-assistant-for-on-chain-intelligence-and-transaction-support] | In-app assistant for portfolio analysis, research, risk signals (look-alike tokens, low liquidity, honeypots) and **preparing** transactions. TWAK adds DCA and limit orders across 25+ chains | "Every transaction requiring explicit confirmation and signature." TWAK has two modes: its own agent wallet vs. **WalletConnect mode that proposes transactions for approval** |
| **Binance Agent OS** | 2026-08 [REPORTED: https://techcrunch.com/2026/08/20/binance-now-lets-ai-agents-trade-but-keeping-them-in-check-is-largely-up-to-users/] | Agents trade on Binance | TechCrunch criticism: "keeping them in check is largely up to users" |
| **Zerion** | Zerion CLI and agent skills, 40+ EVM chains plus Solana [REPORTED: https://zerion.io/blog/zerion-cli/]; zerion.io/agents live [VERIFIED] | Portfolio, swap, bridge and sign for coding agents | **Agent tokens + policies** (chains, expiry, transfer/approval gates, contract allowlists) and a **review threshold** that sends large transactions to the Zerion web app for human signing [REPORTED: https://developers.zerion.io/build-with-ai/zerion-cli] |
| **Phantom** | MCP server for agents [REPORTED: https://coinspot.io/en/cryptocurrencies/phantom-launches-mcp-server-ai-agents-gain-access-to-wallet/] | Signing, swaps and transfers | Permissions granted upfront and revocable; operation parameters surfaced before execution. **No consumer in-app chat assistant found [UNKNOWN]** |
| **Rabby** | No AI agent feature found [UNKNOWN; searched "Rabby wallet AI agent 2026"] | Relevant as the **UX benchmark for pre-sign simulation**: "tells you, in plain language, exactly what will happen to your assets" [REPORTED: https://cryptoadventure.com/rabby-wallet-review-2026-safer-evm-defi-with-transaction-simulation-risk-scanning-and-auto-chain-switching/] | Simulation, risk scan, automatic chain switching |
| **Circle Agent Wallets** | Docs live; Agent Stack launched 2026-05 [REPORTED: https://www.arc.io/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet] | Transfer, CCTP bridge, swap, x402 and nanopayments via Circle CLI; USDC and EURC | 2-of-2 MPC. Time-bound USDC spend limits, recipient allowlist/blocklist, contract blocklist, sanctions screening, and an **email OTP to change a policy**. Policies work on **mainnet only**; there are none on testnet [VERIFIED: `circle-llms-full.txt:844-930, 1368-1395`] |

---

## 4. Research and intelligence agents (they do not execute; use them for the "ask" layer)

| Product | Status | Notes |
|---|---|---|
| **Surf** (by Cyber) | iOS and Android apps; version 2.0.22 updated in the last week; 4.2★ from 6 US ratings [REPORTED: App Store via WebFetch, https://apps.apple.com/us/app/surf-crypto-ai-assistant/id6751790853] | Two modes: **ASK** for fast checks vs. **RESEARCH** for full reports; 40+ chains; X sentiment. Plus is $14.99/mo, Pro $39.99/mo. Complaint: "older iPhone models crash when selecting any project…" |
| **Venice** | Live [VERIFIED 200] | Private, uncensored LLM. Agents pay for inference with a Base wallet over x402; VVV staking gives pro-rata API capacity [REPORTED: https://venice.ai/blog/introducing-the-venice-token-vvv]. Relevant as a privacy-first LLM backend, not as a wallet |
| **Virtuals / aixbt / Luna / ACP** | Live [VERIFIED app.virtuals.io 200] | Tokenized agents on Base. The ACP agent-to-agent marketplace reported "1.77 million completed jobs" by early 2026 [REPORTED: https://www.dextools.io/tutorials/what-is-virtuals-protocol-ai-agents-base-guide-2026]. aixbt is a market-intel poster on X |
| **Spectral** | Live site [VERIFIED 200] | Pivoted from Syntax (NL to Solidity agents) toward "agentic economy" infrastructure (the Lux framework) [REPORTED: https://phemex.com/academy/what-is-spectral-spec] |
| **Coinbase Advisor** | 2026-06, SEC-registered AI advisor for Coinbase One members in the US [REPORTED: https://www.pymnts.com/mobile/2026/coinbase-expands-app-with-ai-investment-adviser-and-developer-platform/] | Shows the regulatory route for "advice" features |

---

## 5. Cross-cutting observations

- **Voice** is only claimed by HeyElsa (and Olas Pearl marketing), and even there it is unverified. None of the documented execution agents (Bankr, MetaMask, Coinbase, Circle) ship two-way voice [INFERENCE from the absence of voice in their docs]. **This is an open lane.**
- **Multilingual:** HeyElsa is the only product advertising a language list [REPORTED]. Everyone else is [UNKNOWN].
- **Contacts:** no product has a first-class address book with an "unknown name → add contact" flow. Bankr resolves social handles and ENS names and keeps nicknames in memory [VERIFIED]. Base/XMTP puts friends in group chats [REPORTED]. **This is a gap.**
- **Notifications to Telegram/Discord:** Bankr lets you *chat* on Telegram/X and schedule "send me a summary" commands [VERIFIED]. No product found offers a settings-page connector like "notify me on Discord when X happens" [UNKNOWN].
- **Confirmation spectrum**, from least to most friction:
  - Bankr executes immediately within limits.
  - MetaMask Beast Mode.
  - MetaMask Guard Mode and Zerion review thresholds (step-up only outside the policy).
  - Slate, Dawn, HeyAnon, Trust Wallet AI (always sign).
- **Churn is high [INFERENCE from statuses above]:** Dawn (sunset), Slate (domain repurposed), Brian (stale), Orbit (pivot to B2B), and Base App (rebrand reverted). Token-first DeFAI projects (Griffain, Wayfinder, HeyAnon) survive but are speculative.

## 6. Patterns to steal

1. **A policy engine enforced server-side and outside the LLM** (Bankr, MetaMask Guard, Circle policies): per-transaction limit, daily limit, recipient allowlist with a **24h cooldown for new recipients**, price-impact cap, a pause-all kill switch, fail closed when pricing is unavailable.
2. **Loosen-with-a-timer**: lift a limit for 10, 30 or 60 minutes, then restore it automatically (Bankr).
3. **Step-up approval out of band** (passkey, mobile push or email link) only for out-of-policy actions (MetaMask 2FA, Zerion review threshold, Circle OTP on policy change).
4. **Guard vs. Beast modes, or Co-Pilot vs. Autonomous** (MetaMask, Olas Pearl) as a single user-facing risk dial.
5. **Numbers in errors**: "spent so far $410, this tx $120, limit $500" (Bankr).
6. **"Agent Command" automations**: schedule *any* prompt, managed in chat ("show/cancel my automations") and in a sidebar with pause, resume and edit. Cap frequency (Bankr).
7. **Durable user memory** for rules and nicknames, shared across surfaces (Bankr).
8. **One agent across surfaces** (web, Telegram, X, CLI) with synced state and **per-channel reply toggles** (Bankr).
9. **Explainability log**: a daily plain-language "what I did and why" (Giza Thoughts).
10. **Show the route before confirming** (Slate) and **plain-language simulation** (Rabby, MetaMask).
11. **Risk signals on unfamiliar tokens**: look-alikes, low liquidity, honeypots (Trust Wallet AI).
12. **ASK vs. RESEARCH modes** for quick answers vs. deep reports (Surf).
13. **Dry-run by default** for new automations or API use (HeyElsa x402).
14. **Auto-fund the shortfall** by swapping from stables when the balance of the named token is short (Bankr). On Arc, USDC is gas, which makes this simpler.
15. **Isolated sub-account or portfolio for the agent** (Coinbase for Agents, TWAK agent-wallet mode).

## Gaps (not verified)
- App-store and Reddit reviews for Bankr, HeyElsa, HeyAnon and Griffain: searched and found none usable.
- Whether any Arc mainnet contract exists for Bankr Launch v3: `eth_getCode` was not run (no address in the docs excerpt).
- The Base App chat-agents docs page could not be fetched (it returned unrelated content).
- Griffain's current functionality: the site shows only a splash page.
