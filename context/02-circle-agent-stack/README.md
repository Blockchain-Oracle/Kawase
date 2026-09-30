# 02 — Circle Agent Stack (index)

Purpose: index and "where to look for X" for the Circle Agent Stack (developers.circle.com/agent-stack), which Tameion calls "start here": give an agent its own wallet, let it pay, keep it inside guardrails.
Sources: developers.circle.com/agent-stack/** (local dump `.firecrawl/docs/circle-llms-full.txt`), live `@circle-fin/cli@1.1.4 --help`, agents.circle.com skills corpus, public Discovery/Gateway/Facilitator endpoints, circlefin GitHub, prior research in `arc-agent/docs`.
Verified: 2026-09-29

## Files

| File | What's in it |
|---|---|
| [overview.md](overview.md) | What the Agent Stack is, the 7 components, how they fit, timeline, what's mainnet vs testnet |
| [circle-cli.md](circle-cli.md) | Full `circle` command reference (v1.1.4), incl. undocumented `earn`, `contract deploy`, `feedback`; auth, env vars, config, JSON output |
| [agent-wallets.md](agent-wallets.md) | Agent Wallets: custody model (SCA over 2-of-2 MPC user-controlled wallets), chains, fees, every wallet operation |
| [guardrails-and-policies.md](guardrails-and-policies.md) | Spending limits, allow/blocklists, OTP gate, sanctions screening, `--max-amount`, approval gates, what's NOT enforced on testnet |
| [x402.md](x402.md) | x402 protocol (headers, payloads, v1 vs v2), Circle Facilitator Service (keyless trial, seller proof, /settle, /status), vanilla buyer/seller code |
| [nanopayments.md](nanopayments.md) | Gateway Nanopayments + Agent Nanopayments: batched settlement, EIP-3009 `GatewayWalletBatched`, `@circle-fin/x402-batching` SDK reference, API endpoints, errors |
| [marketplace-and-discovery.md](marketplace-and-discovery.md) | Agent Marketplace, Discovery API params, live catalog stats for Arc, become a seller / get listed, A2A card |
| [mcp-and-ai-tooling.md](mcp-and-ai-tooling.md) | Circle MCP server, circlefin/skills (18 skills), agents.circle.com runtime skills, llms.txt files, starter kits, Arc Studio |
| [quickstarts.md](quickstarts.md) | Copy-paste paths: CLI agent in 5 min, TS buyer, Express seller, dev-controlled-wallet buyer, Facilitator seller |
| [identity-and-a2a.md](identity-and-a2a.md) | ERC-8004 / ERC-8183 (Arc docs, not Circle Agent Stack), A2A, agent-to-agent commerce patterns |
| [gotchas-and-staleness.md](gotchas-and-staleness.md) | Doc conflicts, stale prior research, CLI gaps, footguns |
| [rfb-mapping.md](rfb-mapping.md) | Each capability → RFB 1–5 with concrete build ideas and scoring notes |

Raw captures (not curated) live in `.firecrawl/circle-agent-stack/`: `circle-cli-1.1.4-help.txt`, `setup.md`, `agents-llms.txt`, `agents-llms-full.txt` (all 8 runtime skills), `agent-skills-index.json`, `discovery-openapi.json`, `a2a.json`, `discovery-sample.json`, `arc-all.jsonl` (all 687 Arc-payable marketplace listings on 2026-09-29).

## Where to look for X

| I need to… | Go to |
|---|---|
| Give my agent a wallet in 5 minutes | quickstarts.md §1, agent-wallets.md |
| Know every CLI flag | circle-cli.md |
| Stop the agent overspending | guardrails-and-policies.md (spoiler: Circle policies are **mainnet-only**; on testnet you must enforce yourself) |
| Let my agent pay an API per call | nanopayments.md (Gateway, gasless) or x402.md (vanilla onchain) |
| Charge other agents for my API (traction!) | x402.md §Seller, nanopayments.md §Seller, marketplace-and-discovery.md §Get listed |
| Find paid APIs an agent can buy | marketplace-and-discovery.md |
| Sign EIP-3009 by hand / debug `invalid_signature` | nanopayments.md §Manual signing |
| Reconcile payments to invoices (AP/AR) | nanopayments.md §Reconciliation, x402.md §status |
| Plug Circle docs into Claude Code/Cursor | mcp-and-ai-tooling.md |
| Agent identity / reputation / escrow | identity-and-a2a.md (lives in Arc docs) |
| Sanctions screening API (RFB 5) | guardrails-and-policies.md §Screening |
| Map features to the RFBs | rfb-mapping.md |

## Five facts to remember

1. `npm install -g @circle-fin/cli` → `circle wallet login you@x.com --testnet` → wallets auto-provisioned on every supported EVM chain incl. `ARC-TESTNET`; `circle wallet fund --address 0x… --chain ARC-TESTNET` drips 20 testnet USDC. Latest CLI **1.1.4** (2026-09-22).
2. Agent Wallets are **SCAs** on Circle user-controlled (2-of-2 MPC) wallets; gas is sponsored; transfers are sanctions-screened; key shares never reach the agent.
3. Spending policies (`circle wallet limit set`: per-tx/daily/weekly/monthly caps, recipient/contract allow/blocklists) are **mainnet only** and need a human email OTP. On Arc Testnet you must build your own guardrail (contract/app-level) — which RFB 4 explicitly rewards ("enforced in the contract rather than the prompt").
4. Two x402 rails: **Gateway Nanopayments** (`@circle-fin/x402-batching` 3.5.0, gasless offchain EIP-3009 against `GatewayWalletBatched`, min $0.000001, batch-settled, authorization validity ≥ 7 days) and **Facilitator Service** (`https://api.circle.com/v1/facilitator/x402/*`, onchain per payment on Arc/Base/Polygon, keyless trial). Arc mainnet/testnet supported by both.
5. Marketplace Discovery API is public and keyless: `GET https://api.circle.com/v2/x402/discovery/resources` — 1,337 listings, 687 payable on Arc mainnet (`eip155:5042`), **0 on Arc Testnet**. So testnet demos need your own seller.
