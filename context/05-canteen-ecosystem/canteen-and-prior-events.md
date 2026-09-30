# Canteen and prior events (Agora, Lepton)

Purpose: who Canteen is, how its builder series works, and what won the two earlier Canteen × Circle × Arc hackathons (Agora and Lepton) and why. Use it to calibrate a Tameion submission.

Sources: https://thecanteenapp.com/ and /about/; https://agora.thecanteenapp.com/ (`.firecrawl/canteen/agora.md`); https://lepton.thecanteenapp.com/ (`.firecrawl/canteen/lepton.md`); https://arc-showcase.thecanteenapp.com/data.js (361 projects, award labels; `.firecrawl/canteen/showcase-data.js`, winners extracted to `.firecrawl/canteen/showcase-awards.json`, generated 2026-09-28); https://arc-oss.thecanteenapp.com/; https://community.arc.io/public/events/tameion-agents-hackathon-jb1w9clwx7; x.com/thecanteenapp (search snippet).
Verified: 2026-09-29

---

## Canteen

- "A NYC-based fintech research and technology firm … builders, investors, and engineers operating at the intersection of markets, AI, and payments. We love open source. We'll be launching publicly in Q4 2026."
- Three activities: **build products** (for example the ARC CLI and Canteen-hosted Arc RPC), **invest in teams** (early-stage), and **host builder events** (this series).
- Team background claimed: Coinbase, Solana, Protocol Labs, YC founders. Contact: arjun [at] thecanteenapp.com. X: @thecanteenapp.
- Judges in past rounds had "backgrounds from Solana, Coinbase, Arc / Circle directly, and Protocol Labs … expect them to read your repo like operators".
- Every event is themed on ancient Greek money: **Agora** (the marketplace) → **Lepton** (the smallest coin) → **Tameion** (the treasury room). Each round ships RFBs ("our version of YC's Requests for Startups; these aren't tracks"), a research or prior-art section built around one Canteen analysis post, and the same judging weights.
- After the event: "we commit for the long run": funding, grant support and partnership support (Canteen, Circle, Arc) for teams that keep building. Lepton added "Committed Builder Awards" ($2k) for post-event activity. Tameion slides mention "possible grant support for teams that keep building".
- Tameion is also listed as an **Arc House** (community.arc.io, Circle's community platform) event.

## Series at a glance

| | Agora | Lepton | Tameion (current) |
|---|---|---|---|
| Tagline | "Where AI agents make markets" | "Paid by the fraction" | AI agents that manage a business's money |
| Dates | May 11 → May 25, 2026 (2 wks) | Jun 15 → Jul 6, 2026 (3 wks, invite-only) | Sep 27 → Oct 10, 2026 (2 wks) |
| Prize pool | $50k: 1st $10k; 2nd $7.5k×2; 3rd $5k×3; standouts $7.5k (10–12 teams); feedback $500; easter eggs $2k | $50k: same grand prizes; standouts $7.5k; feedback $500; committed builder $2k | $40k: 1st $10k; 2nd $7.5k; 3rd $5k×3; standouts $7.5k (10–12); possible grants |
| RFBs | 1 Perp futures agent · 2 Prediction-market trader intelligence · 3 Prediction-market verticals · 4 Adaptive portfolio manager · 5 Cross-platform arbitrage · 6 Social trading intelligence | 1 Autonomous paying agents · 2 Selling agent services via nanopayments · 3 Agent-to-agent nanopayment networks · 4 Streaming payments · 5 Nanopayment infra and tooling ("facilitator lane already crowded") · 6 **Creator and publisher monetization** (the round leaned here) · Open | 1 Intelligent business treasury · 2 AP/AR automation · 3 Contractor and vendor network manager · 4 Autonomous business operator · 5 Compliance intelligence · 6 Surprise us |
| Research anchor | "Unbundling the Prediction Market Stack" + 6 research hacks (Trading-R1 traces, Polymarket builder codes, NFI blacklist oracle, translation-as-alpha, HL whale index, slash-bonded copy trading) | "Distribution Bootstrap for Payments Founders" + 8 prior-art hacks (citation tolls, resellable patronage, quadratic funding, recursive royalties, user-centric streaming royalties, per-second streams, retro funding, **bonded broker reputation**) | "Agents and Ledgers in 2026" + prior-art hacks (continuous euthyna audit, sanctions screening, etc.) |
| Judging | 30% agentic sophistication · 30% traction · 20% Circle tool usage · 20% innovation | same | same ("Mainnet > Testnet") |
| Submission | repo + ≤3-min video + optional live link + traction answers; async judging, no demo day | same; "we judge the **delta**" for carried-over projects | same; existing projects allowed |
| Registration passphrase | SITEx1313 (luma.com/7i50p2r9) | (luma.com/5xcrazms) | DIRECTx42490 (luma.com/ivroypr5) |
| Discord ping | @aadi | @kdrohan | @kdrohan |

## What won (from the Arc Showcase data; 25 awards total)

The showcase `data.js` tags every project with `award_label`. Note that the showcase lists only projects that opted in. For Agora it shows 1st, two 2nds and **one** 3rd, although three 3rd prizes were on offer; the other two Agora 3rd-place teams are not in the data.

### Agora (May 2026, markets)

| Award | Project | Builder | What it is | Circle tools used |
|---|---|---|---|---|
| 🥇 1st | **Mimir** (github.com/enliven17/mimir, mimirmarkets.vercel.app) | Cankat Polat (solo) | AI-settled P2P claim market run end to end. Forkable modules: `lib/circle-w3s.ts` (W3S as a typed agent signer with RSA-OAEP entity-secret encryption, contract-execution polling, USDC transfer helper), `lib/cctp.ts` (browser CCTP V2 stepper with Iris polling), a multi-agent council orchestration template, a keyless deploy script, a Gateway balance widget, provider-agnostic LLM calls, Kelly-sized staking; `demo-full-cycle.ts` runs everything in 90s. Also entered Lepton. | x402-batching, DCW, App Kit, Gateway |
| 🥈 2nd | **Precall** (mrgtee/precall) | 3-person team | USDC-bonded, accountable prediction-market calls: PrecallRegistry on Arc, a 5-agent OpenAI council gated on evidence IDs, Polymarket discovery, x402 evidence, locked-then-unlockable reasoning. | x402-batching, Gateway |
| 🥈 2nd | **Arcane** (LingSiewWin/arcane + standalone `arc-agent-kit`) | solo | Agent-trustability layer: agents self-mint an ERC-8004 identity and stake a USDC bond (AgentRegistry, BondVault slashable, PerformanceOracle, MemoryAnchor), onchain constitution, Pyth-resolved LONG/SHORT duel arena, x402 paid queries. 39 contract tests. | x402-batching, DCW, Gateway |
| 🥉 3rd | **Stoa Insight Bot** (Cloakie47/stoa) | solo | Forkable monorepo: x402 facilitator verifier with replay cache and rate limiter, a 120-line x402 reference client, confidential transfers, trace redaction before IPFS, a TracePin hash anchored on Arc (tamper-evident audit trail); multi-agent BUY/SELL/PASS. | (none tagged) |
| ⭐ standouts | Archimedes (AI-decision provenance, Deflated Sharpe and PBO rigor gate, ReasoningTraceRegistry.sol, DCW signer), Nexa Flow (streaming payroll, split vaults), FORUM (CovenantVault mandate + SlashBond + permissionless RiskKernel + EIP-712 TrackRecord receipts; 25 contracts), **ReasoningReceipt** (Tang Minh Vu; Merkle-anchored reasoning receipts), Drip (Hyperliquid perps agent buying its own signals over x402; self-hosted x402 facilitator plus CCTP V2 in Python), Plinth (agent vaults with a venue whitelist and an Underwriter reconciling PnL) | |

### Lepton (Jun–Jul 2026, nanopayments and creators)

| Award | Project | Builder | What it is | Circle tools used |
|---|---|---|---|---|
| 🥇 1st | **Keryx** (github.com/tang-vu/keryx, keryx.cc) | **Tang Minh Vu** (solo) | "Makes citation itself the payment event." An autonomous reading agent decomposes a question, discovers sources, and decides **buy/skip/cache per source with a plain-language rationale**, paying an x402 toll per source read. After answering it **weighs each source's real contribution** and settles weighted USDC micropayments to creators, with multi-author splits. Browsers co-sign under a **funded non-custodial spending cap** (`session-grants.ts`, `browser-cosign-gateway.ts`) and a payTo allowlist. This is literally Lepton's prior-art item #1 ("content that earns every time it is cited", the kēryx/herald). | x402-batching, **Circle CLI**, Unified Balance Kit, Gateway |
| 🥈 2nd | **Puls** (rdmbtc/Puls, pulsmarket.tech) | solo | Flutter prediction market with agents on the trading floor: LMSR contracts, AgentBond stake and slash, AgentDuel, SignalRegistry forecasts sold as x402 nanopayments, a BYO-agent example, per-second StreamingPay, a UMA resolver, CCTP V2 bridge-in. | x402-batching, Circle CLI, Gateway |
| 🥈 2nd | **Rubicon** (michaelzoub/rubicon, rubiconpay.xyz) | — | Metered paid content by the word. Agents open a **budgeted reading session** (`POST /v1/sessions`, max USDC spend); the gateway clamps each chunk to the remaining budget; settles via Gateway on Arc. Ships `@rubicon-caliga/cli` (search/buy/read/doctor/receipt) and `agent-sdk` signing with **Circle Agent Wallets** (no raw key), plus an OpenAPI spec and search endpoints for discovery. | x402-batching, Circle CLI, DCW, Gateway |
| 🥉 3rd | **AgoraFX** (MusaAis/agorafx) | solo | Python agent for African FX prediction markets (NGN, GHS, KES, ZAR, EGP vs USDC). Groq Llama momentum signals; the agent **stakes confidence-scaled USDC as slashable collateral**, accuracy is tracked onchain, and it pays for its own rate data via x402. Also entered Agora. | DCW, UCW, Gateway |
| 🥉 3rd | **ENGYE** (dadadave80/engye) | solo | Hire an AI broker that **stakes its own money**: it quotes with a confidence score and posts a 1–5x bond with a decision hash committed before funds move. Vyper BondedEscrow, ProviderStake, RefundVault; a blind validator rules; x402 payouts. Prior-art item #8 (bonded broker reputation). | x402-batching, Modular Wallets, Gateway |
| 🥉 3rd | **Athena** (sylesh7/Athena) | 3-person team | Trust-minimized agent broker: **commit-reveal of a hashed reasoning plus a falsifiable prediction** on Arc, backed by a slashable USDC bond; routes work to x402 provider agents; DCW provisioning; Foundry tests. | x402-batching, Circle CLI, DCW, Gateway |
| ⭐ standouts | SynArc DAO (governance/treasury SDK), Cresc (AI-priced Ghost paywall with ContentVaults and a repricing Watcher agent), Tessera ×2 (BGP peering market; a streaming-payment sidecar for Owncast/PeerTube/Jellyfin), Sluice (x402 toll booth that meters any resource plus MCP), Assay (research agent treating source buying as a **value-of-information portfolio problem** under a fixed budget, logging a rationale for every decision including refusals), Skimflow (per-block paywall, onchain 80/12/5/3 split), Lepta (proof-of-flow per-second livestream billing with a budget agent), ArcStation (freelancer escrow and payroll with ERC-8004/8183) | |

### Why these won (patterns to copy for Tameion)

1. **The agent makes an economic decision and explains it.** Keryx and Assay decide buy/skip/cache with a written rationale. Athena, ENGYE and Precall commit reasoning or predictions before acting. This is the "agentic sophistication" 30%: "full autonomy beats meaningful agency beats AI-flavored automation."
2. **Skin in the game and verifiable records.** Slashable bonds (Arcane, ENGYE, Athena, AgoraFX, FORUM), Merkle or hash-anchored decision logs (ReasoningReceipt, Stoa, Archimedes), commit-reveal. For Tameion this maps to the Agents & Ledgers takeaways: a witness before every write, and a loud, verifiable record after.
3. **Spending controls enforced outside the prompt.** Keryx's non-custodial spending caps and session grants, Rubicon's budget clamp, FORUM's mandate vault, Circle Agent Wallet policies. Tameion's own FAQ says the good answers "put the limit somewhere the agent cannot reach".
4. **Heavy, idiomatic Circle stack use.** Almost every winner uses **x402 + Gateway batching (nanopayments)**, and most also use the **Circle CLI / Agent Wallets** or Developer-Controlled Wallets. Across all 361 showcase projects the top Circle tags are DCW (160), x402-batching (132), Gateway (125), App Kit (65), Circle CLI (51).
5. **Built straight off Canteen's own research.** Keryx is prior-art #1 almost verbatim, ENGYE and Athena are prior-art #8, Lepta and Tessera are the Owncast per-second sidecar. For Tameion, read the prior-art and hack section of tameion.thecanteenapp.com and the Agents & Ledgers post, and build one of those well.
6. **Forkable primitives and docs.** Showcase write-ups list exact file paths of reusable modules. Winners often ship a standalone kit repo (Arcane's `arc-agent-kit`), SDK/CLI packages (Rubicon) or a one-command demo (Mimir's 90-second `demo-full-cycle.ts`).
7. **Solo builders win.** 1st place in both rounds went to a solo builder; most awards are solo. Tang Minh Vu placed in both rounds (Agora standout, then Lepton 1st) and is now a Tameion fireside speaker, so iterating across rounds pays.
8. **Traction was claimed concretely** (for example ReasoningReceipt: 4,500 receipts, 215 markets, 17 wallets) even on testnet. Tameion raises the bar to "a real business has to use it" and "Mainnet > Testnet".

### Demo videos from prior rounds (YouTube, community-uploaded)
Search "Agora Agents Hackathon" / "Lepton Hackathon Arc" on YouTube. Examples: ReasoningReceipt `LjuwQcyboYc` (transcribed in `transcripts/`), Keryx walkthroughs `q1OZiIpiksA`, `hOY94oIwx7w`, `9U4fjpPzuVc`, Stoa Insight `E6Npj0nrMIw`, Selbo `bpf3j0jSHWI`, CiteMint `tQ-itJnbrpA`, SourcePay `KcGQkU4LmA4`, Obol `KCrb32zBa_c`. The Keryx transcript could not be fetched (YouTube bot check on 2026-09-29).
