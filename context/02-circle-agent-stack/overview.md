# Circle Agent Stack — overview

Purpose: what the Agent Stack is, its components, how they connect, what is live where, and its history.
Sources: https://developers.circle.com/agent-stack (+ .md), /release-notes/agent-stack-2026, /x402-facilitators, live CLI 1.1.4 help, `.firecrawl/circle-agent-stack.md`.
Verified: 2026-09-29

## One-line pitch (Circle's words)

"Empower your AI agents to autonomously operate wallets, transact onchain, and pay for API services through Circle's agent-native tooling." Agents hold/transact USDC and other tokens across chains, discover and pay for x402 services, and operate within built-in compliance guardrails. Works with Claude Code, Cursor, Codex, OpenClaw, or any custom agent (the agent shells out to `circle`).

## The seven components

| Component | What it is | Interface | Doc |
|---|---|---|---|
| **Circle CLI** | `circle <resource> <verb>` — wallets, transfers, swaps, CCTP bridge, Gateway, x402 pay, contracts, skills | `npm i -g @circle-fin/cli` (v1.1.4, Node ≥ 20.18.2) | /agent-stack/circle-cli |
| **Agent Wallets** | Agent-operated SCA wallets over Circle user-controlled (2-of-2 MPC) wallets; spending policies; sanctions screening; gas sponsored | CLI (`circle wallet …`) only — no SDK/REST documented for agent wallets | /agent-stack/agent-wallets |
| **Agent Nanopayments** | CLI flow on top of Gateway Nanopayments: deposit to Gateway → `circle services pay` → withdraw | CLI (`circle gateway …`, `circle services pay`) | /agent-stack/agent-nanopayments |
| **Agent Marketplace** | Curated, sanctions-screened, health-checked catalog of x402 services (1,337 listings on 2026-09-29) | agents.circle.com/services, Discovery API, `circle services search` | /agent-stack/agent-marketplace |
| **Facilitator Service** | Circle-hosted x402 facilitator for sellers; onchain EIP-3009 `exact` settlement on Arc, Base, Polygon PoS; Circle pays gas and screens both parties | REST `api.circle.com/v1/facilitator/x402/{verify,settle,status,supported}` | /facilitator-service |
| **Gateway Nanopayments** | Gas-free USDC payments down to $0.000001, batched by Circle Gateway (TEE-signed net settlement) | `@circle-fin/x402-batching` SDK; REST `gateway-api[-testnet].circle.com/v1/x402/*` | /gateway-nanopayments |
| **Circle Skills** | Open-source LLM instruction packs (`circlefin/skills`, 18 skills) | `circle skill install --tool claude-code` or `/plugin marketplace add circlefin/skills` | /ai/skills |

Adjacent AI tooling (not in the stack nav but relevant): Circle MCP server `https://api.circle.com/v1/codegen/mcp`, runtime agent skills at `https://agents.circle.com/skills/*.md`, Arc Studio (AI app builder on Arc). See mcp-and-ai-tooling.md.

## How the pieces connect

```
 human (email OTP, policy OTP, Terms consent)
        │
  circle CLI ───────────────┐
   │ wallet * (Agent Wallet: SCA, gas-sponsored, sanctions-screened, policy-limited)
   │ bridge * (CCTP fast + Forwarding Service; no dest gas)
   │ gateway deposit/withdraw/balance (Gateway balance keyed by the SCA's backing EOA)
   │ services search/inspect/pay ──► x402 seller ──► facilitator
   │                                   ├─ Gateway (batched, gasless)  ← "GatewayWalletBatched"
   │                                   └─ vanilla x402 (onchain EIP-3009; Circle Facilitator Service or any facilitator)
   │ skill install (circlefin/skills)          Discovery API ◄── Agent Marketplace (agents.circle.com)
```

Code-first alternative (no CLI): Circle developer-controlled wallets (`@circle-fin/developer-controlled-wallets` 10.8.1, API key + entity secret, EOA) signing for `@circle-fin/x402-batching` `BatchEvmScheme` — the pattern in `circlefin/arc-x402-circle-wallets` (the Tameion-recommended RFB 4 starter) and in the Gateway Nanopayments buyer quickstart "Circle Wallets" tab. See quickstarts.md §4.

## What runs where (Arc focus)

| Capability | Arc mainnet (`ARC`, eip155:5042) | Arc Testnet (`ARC-TESTNET`, eip155:5042002) |
|---|---|---|
| Agent Wallet provisioned at login | yes (since 2026-09-16) | yes (`--testnet` session) |
| Faucet funding via `circle wallet fund` | no (fiat via Transak / crypto QR) | yes, 20 USDC |
| Spending policies (`wallet limit *`) | **yes** | **no — rejected by CLI** |
| `wallet swap` | yes | yes (only testnet supported for swap) |
| Gateway deposit `--method direct` | yes | yes |
| Gateway deposit `--method eco` (lands on Arc) | yes (source BASE/ARB/OP) | source BASE-SEPOLIA |
| Gateway Nanopayments | yes (GatewayWallet `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`, domain 26) | yes (`0x0077777d7EBA4688BDeF3E311b846F25870A19B9`) |
| Facilitator Service | yes, instant finality | yes (keyless trial) |
| Marketplace listings payable | 687 | 0 |

## Timeline (release notes)

- 2026-05-11 Agent Stack launched (CLI, Agent Wallets, ops how-tos, policies).
- 2026-05-12 Agent Nanopayments docs.
- 2026-07-31 Agent Marketplace + public keyless Discovery API (`GET https://api.circle.com/v2/x402/discovery/resources`, 14 query params).
- 2026-08-13 Circle CLI 1.0.0 (Eco quoted single-use deposit vaults, `--no-wait`, version gate → `circle update`).
- 2026-09-16 Facilitator Service launched (Arc, Base, Polygon PoS); **Arc mainnet added** to Agent Stack.
- 2026-09-22 CLI 1.1.4 published on npm (adds `earn`, experimental `contract deploy`, `feedback` — not yet in docs).

## Why it matters for Tameion scoring

- **Circle tool usage (20%)**: Agent Wallets + Nanopayments + Marketplace + Facilitator + CCTP/Gateway via one CLI touches many Circle products at once; judges list "Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, Contracts, USDC and EURC".
- **Agentic sophistication (30%)**: the stack gives primitives (pay, discover, bridge, swap, policy); the decision logic, budgeting and escalation are yours.
- **Traction (30%)**: being a *seller* (x402 endpoint listed in the marketplace, paid by other agents) is a direct route to "payments actually flowing in USDC".
- The hackathon FAQ requires "It runs on Arc, with payments actually flowing in USDC, testnet or mainnet, on the Circle Agent Stack."
