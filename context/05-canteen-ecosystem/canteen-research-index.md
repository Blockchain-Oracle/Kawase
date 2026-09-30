# Canteen research index (thecanteenapp.com/analysis)

Purpose: an index of every Canteen research post, with summaries weighted toward agents, payments and treasury. Canteen builds each hackathon's RFBs and prior-art sections from these posts, and past winners built directly off them.

Sources: https://thecanteenapp.com/ (post list; `/analysis/` serves the same index), each post fetched with curl and converted with pandoc to `.firecrawl/canteen/posts/*.md`; Agents & Ledgers at `.firecrawl/agents-and-ledgers.md`.
Verified: 2026-09-29

---

| Date | Post | Relevance to Tameion | Local copy |
|---|---|---|---|
| 2026-09-12 | [Agents and Ledgers in 2026](https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html) | **Required reading** (kickoff step 05, repeated four times in the slides). The Tameion research anchor. | `.firecrawl/agents-and-ledgers.md` |
| 2026-05-28 | [The Distribution Bootstrap for Payments Founders](https://thecanteenapp.com/analysis/2026/05/28/distribution-bootstrap-payments-founders.html) | High. Lepton's anchor, and the traction and distribution playbook Canteen expects. | `posts/distribution-bootstrap-payments-founders.md` |
| 2026-05-01 | [Unbundling the Prediction Market Stack](https://thecanteenapp.com/analysis/2026/05/01/unbundling-the-prediction-market-stack.html) | Medium. Agora's anchor; agent identity and builder codes. | `posts/unbundling-the-prediction-market-stack.md` |
| 2026-03-27 | [The Multi-Agent Landscape in 2026](https://thecanteenapp.com/analysis/2026/03/27/multi-agent-landscape.html) | Medium. Debate beats voting, useful for decision and escalation design. | `posts/multi-agent-landscape.md` |
| 2026-01-06 | [The AI Agent Landscape in 2026](https://thecanteenapp.com/analysis/2026/01/06/ai-agent-landscape.html) | Medium. Loop detection, context, memory, sandboxes. | `posts/ai-agent-landscape.md` |
| 2026-01-03 | [The State of LLM Serving in 2026](https://thecanteenapp.com/analysis/2026/01/03/inference-serving-landscape.html) | Low. Ollama, SGLang, TensorRT, Triton, vLLM source review. | `posts/inference-serving-landscape.md` |
| 2025-12-10 | [Tempo: Initial Thoughts](https://thecanteenapp.com/blockchain/research/2025/12/10/tempo-blockchain.html) | Low to medium. A competitor stablecoin L1; useful for contrasting it with Arc. | `posts/tempo-blockchain.md` |
| 2025-12-01 | [Introducing x402 v2](https://thecanteenapp.com/releases/2025/12/01/x402-v2-release.html) | High for any x402 build. | `posts/x402-v2-release.md` |

(`.firecrawl/canteen/posts/` paths are relative to the workspace root.)

## Summaries

### Agents and Ledgers in 2026 (Sep 12, 2026). Must read.
Canteen read the source of nine open-source accounting systems (Odoo, ERPNext, beancount, GnuCash, Firefly III, Invoice Ninja, Kill Bill, SolidInvoice, Ghostfolio) to find where an agent may write and what catches it when it is wrong. Sections: what a transaction is (the document *is* the entry in Odoo/ERPNext; a claim with a tolerance in beancount; two numbers per split in GnuCash; a signed pair or running balance in Firefly, Invoice Ninja and Kill Bill), what reconciliation proves, repair, where the model sits, and what it means for builders.
- **Six errors the trial balance cannot see:** omission, commission (right amount, wrong vendor), principle (an asset booked as an expense), original entry (wrong amount on both sides, or a payment made twice after a retry), compensating errors, complete reversal.
- **Where a model can write today:** Odoo (a community MCP server that blocks direct create/write/delete), ERPNext (`frappe/mcp`, tools run inside framework validation), SolidInvoice (the most complete write path, but no way to disprove a phantom payment), Ghostfolio (one write tool, dry run, `IS_DUPLICATE` per row), Firefly III (refused outright), GnuCash, Invoice Ninja and Kill Bill (none).
- **Builder rules:** start from a ledger where the entry points at a document; turn on the controls that already exist; put a witness in front of every write path; make repair loud, or make it refuse; route agent writes through the code the UI already uses; the model's output is an input, never the release condition. "A system that trusts the trial balance ships a first serious error that balances perfectly."
- Tie-in: Martin Blais (beancount author) is a Tameion fireside speaker (Sep 30).

### The Distribution Bootstrap for Payments Founders (May 28, 2026)
The thesis is that distribution, not the rail, is what kills payments startups, and token incentives are wrong for creators. The audience already lives in **open-source self-hosted communities** whose webhooks, plugins and APIs expose exactly the data payments need to settle against (plays, join/leave events, photo provenance, feed item IDs). It covers integration shapes, what each project has already accepted (PeerTube's seven-year monetization thread, Mastodon's donation-campaigns API, Immich's in-tree payments), and "the metadata already encodes the split" (beets, Picard, MusicBrainz credits). It ends with a **Request for Payments Founders** of eight companies in ship order: (1) Subsonic-protocol scrobble sidecar, (2) MusicBrainz payee registry, (3) Owncast per-second streaming webhook sidecar, (4) Jellyfin per-minute VOD sidecar, (5) PeerTube payments plugin, (6) Mastodon donation-campaign provider, (7) LLM crawler citation-toll layer, (8) a settlement core (subscriptions, billing, multi-currency, email).
- Tameion transfer: find the business-software equivalent. Open-source ERPs and accounting tools (Odoo, ERPNext, Invoice Ninja, Firefly) already hold the business's documents, and their plugin and webhook surfaces are the distribution channel for a treasury or AP agent. The kickoff's "Define your ICP; talk to ICPs weekly; #momtest" is the same message.

### Unbundling the Prediction Market Stack (May 1, 2026)
Triggered by Polymarket V2 and a Pump.fun fee-recipient upgrade shipping the same day (Apr 28, 2026). Onchain CLOB venues are unbundling into three layers: an **agent layer** (venue-agnostic, converging architecture), an **identity layer** (Polymarket builder codes, Hyperliquid HIP-3 builder fees, Pump.fun creator rewards), and a **venue layer** (order→quote, operators as an address whitelist, self-pause cancellation, USDC.e→pUSD). Bets: a V2-aware reference market maker; third-party operators forking V2 onto other chains **including Arc**; builder codes becoming the canonical **agent identity primitive**, with a chain-agnostic registry still missing. Tameion transfer: agent identity and attribution (ERC-8004) and the idea that "the agent layer now drives the design of the layers below".

### The Multi-Agent Landscape in 2026 (Mar 27, 2026)
Why swarms work: persistent belief state plus cross-platform observation (MiroFish, BettaFish, MiroShark, OASIS). Orchestration patterns: message-passing (emergence), graph state machines (explicit control), event-driven flows (structured emergence), and their trade-offs. **Structured debate beats voting** (for example bull vs bear investment debates and aggressive/conservative/neutral risk debates, as in TradingAgents). Research directions: graph-based evaluation, async RL. Tameion transfer: a bull/bear/risk debate before a treasury move, with a "decisions made vs escalated" metric (RFB 4 traction).

### The AI Agent Landscape in 2026 (Jan 6, 2026)
A source-level survey of LangGraph, CrewAI, OpenHands, Goose, Letta, guidance and similar tools: **loop detection** (LLM meta-analysis), **context management** (fallback cascades, progressive compaction, structured summaries), **three-tier memory** (Letta), git-backed task graphs, security architecture, **sandboxes** (Firecracker microVMs, multi-backend runtimes), and **structured generation** (CFG parsing). Useful when hardening a long-running business-operator agent.

### Introducing x402 v2 (Dec 1, 2025)
Modular packages (`@x402/core`, `/evm`, `/svm`, `/fetch`, `/axios`, `/express`, `/hono`, `/next`, `/extensions` (Bazaar discovery), `/legacy` for v1). Builder-pattern registration (`new x402Client().register("eip155:*", new ExactEvmScheme(wallet))`). An extension system, with the first extension being **Bazaar** for discovery. **Lifecycle hooks** such as `onSettlementFailure` to roll back expensive work when settlement fails after the response. **Dynamic `price` and `payTo`** per request, useful for marketplace routing to the right vendor. Several payment options per endpoint. At the time `@x402/mcp` and `@x402/a2a` were still TODO.

### Tempo: Initial Thoughts (Dec 10, 2025)
Stripe/Paradigm's payments L1: under $0.001 per transaction, sub-second finality, payment lanes, TIP-20 tokens with onchain memos (for reconciliation), a TIP-403 compliance policy registry, multi-currency gas via a fee AMM, passkey/WebAuthn signatures, protocol-level AA (type 0x76 batched calls, 2D nonces). Relevant as a contrast with Arc, and because TestMint and Proceeds accept **MPP on Tempo** as a payment rail.

### The State of LLM Serving in 2026 (Jan 3, 2026)
A source review of Ollama, SGLang, TensorRT, Triton and vLLM, with trends (MHA→MLA, paged→hierarchical KV cache, dynamic compilation, disaggregated serving, lower-precision quantization) and recommendations. Not directly relevant to Tameion.

## Hackathon pages as research
Each event page also carries a research or prior-art section. Agora has six "research hacks" and Lepton has eight "prior art" hacks plus a distribution table of OSS projects (see `canteen-and-prior-events.md`). The Tameion page's prior-art section (continuous euthyna audit, sanctions screening with `opensanctions/yente`, and others) is covered in the Tameion overview section of this library (`.firecrawl/tameion.md`).
