# MCP server, Circle Skills, runtime agent skills, llms.txt, starter kits

Purpose: Circle's AI-developer tooling — what to install in your coding agent, and what your runtime agent can load — with exact commands and URLs.
Sources: /ai/mcp, /ai/skills, /ai/arc-studio, developers.circle.com/llms.txt, agents.circle.com/{llms.txt, llms-full.txt, skills/*.md, .well-known/agent-skills/index.json}, GitHub `circlefin/skills` (tree), `circlefin/agent-stack-starter-kits` README, npm.
Verified: 2026-09-29

## 1. Circle MCP server (codegen docs for your IDE)

- URL: `https://api.circle.com/v1/codegen/mcp` (HTTP transport), server name `circle`. For live SDK signatures, contract addresses and chain IDs across Wallets, Contracts, CCTP, Gateway. It helps *write code*; it is not a wallet/payment tool for a runtime agent.
```bash
claude mcp add --transport http circle https://api.circle.com/v1/codegen/mcp --scope user
claude mcp get circle
codex mcp add circle --url https://api.circle.com/v1/codegen/mcp
```
```json
{ "mcpServers": { "circle": { "url": "https://api.circle.com/v1/codegen/mcp" } } }
```
(Cursor `mcp.json`, Windsurf `~/.codeium/windsurf/mcp_config.json`.) The Kiro tab shows `npx -y @circle/mcp-server` — **that npm package does not exist** (npm 404 on 2026-09-29); use the URL form.

## 2. Circle Skills (`circlefin/skills`) — for coding agents and runtime agents

Install:
```bash
/plugin marketplace add circlefin/skills          # Claude Code
/plugin install circle-skills@circle
npx skills add circlefin/skills [-g]              # Vercel skills CLI, any host
circle skill install --tool claude-code [--name <skill>]   # via Circle CLI; also cursor, codex, opencode, amp
circle skill update --tool claude-code
```
Skills in repo `plugins/circle/skills/` (18, repo pushed 2026-09-16):

| Skill | Use |
|---|---|
| `use-circle-cli` | drive the CLI |
| `use-agent-wallet` | agent wallet ops |
| `fund-agent-wallet` | funding flows |
| `pay-via-agent-wallet` | x402 pay decision procedure |
| `agent-wallet-policy` | spending policies (human OTP) |
| `recover-eco-funds` | recover failed/expired legacy Eco deposits |
| `accept-agent-payments` | scaffold seller (Gateway + vanilla x402), marketplace-ready |
| `swap-tokens` | swaps |
| `unify-balance` | Gateway unified balance (Unified Balance Kit) |
| `use-gateway` | Gateway unified balance + nanopayments |
| `bridge-stablecoin` | CCTP / Bridge Kit |
| `use-arc` | Arc chain config, deploy, bridge to Arc |
| `use-usdc` | balances, transfers, approvals |
| `use-circle-wallets` | choose wallet type |
| `use-developer-controlled-wallets` | custodial wallets for payouts/treasury/automation |
| `use-user-controlled-wallets` | embedded wallets |
| `use-modular-wallets` | passkey MSCA, ERC-4337/6900 |
| `use-smart-contract-platform` | SCP deploy/interact/monitor |

Only 9 of these are described on /ai/skills; the agent-wallet ones are newer. Circle's llms.txt instructs AI agents: "Read the relevant skill before reading doc pages."

## 3. Runtime agent skills at agents.circle.com (fetch-and-follow)

Index: https://agents.circle.com/llms.txt · all concatenated: https://agents.circle.com/llms-full.txt (~100 KB) · JSON: https://agents.circle.com/.well-known/agent-skills/index.json ("Circle Agent Stack Skills").

| Skill URL (`curl -sL`) | Covers |
|---|---|
| `/skills/setup.md` | install CLI + skills, Terms consent gate, login, wallets, balance, discovery → pay |
| `/skills/wallet-login.md` | two-step OTP login, troubleshooting (prefix mismatch, expired request) |
| `/skills/wallet-fund.md` | fiat (Transak) / crypto QR / Gateway deposit |
| `/skills/wallet-policy.md` | limits; FIFO/named-pipe OTP technique |
| `/skills/discover-services.md` | Discovery API params, filtering by chain/rail |
| `/skills/wallet-pay.md` | decision table: Gateway vs vanilla, bridging, error table, x402 v1 manual-sign fallback |
| `/skills/recover-eco-funds.md` | legacy Eco recovery |
| `/skills/feedback.md` | `circle feedback submit` |

One-line bootstrap prompt (official): `Run curl -sL https://agents.circle.com/skills/setup.md, and use the returned setup instructions to set up my agent wallet.`

Caveats: these skills default to BASE and describe Eco deposits landing on **Polygon**; CLI 1.1.4 help and current docs say Eco lands on **Arc**. Trust `circle <cmd> --help` (the skills themselves say help output is authoritative). They also mention `circle services search --supports-circle-gateway/--network` flags that 1.1.4's help does not list — use the Discovery API directly for those filters.

## 4. llms.txt files

| URL | Content |
|---|---|
| https://developers.circle.com/llms.txt | Circle docs index + "Instructions for AI Agents" + skills table + MCP config (local: `.firecrawl/docs/circle-llms.txt`) |
| https://developers.circle.com/llms-full.txt | all Circle docs (5.3 MB; local: `.firecrawl/docs/circle-llms-full.txt`; pages delimited by `# Title` + `Source: <url>`) |
| Any page + `.md` | e.g. https://developers.circle.com/agent-stack.md |
| https://docs.arc.io/llms.txt | Arc docs (ERC-8004, ERC-8183, App Kit) |
| https://agents.circle.com/llms.txt | runtime agent skills |

Circle's rules for AI agents (from llms.txt): read product overview first; pick wallet type deliberately; CCTP V2 not V1; Bridge Kit for frontend bridging; Gas Station ≠ Paymaster; Gateway Nanopayments for sub-cent; never hardcode USDC addresses; prefer SDKs; API key = Bearer, separate testnet/mainnet keys.

## 5. Starter kits — `circlefin/agent-stack-starter-kits` (pushed 2026-08-28)

Kits: `claude-agent-sdk`, `openai-agents`, `vercel-ai`, `langchain` (Deep Agents), `mastra`, `google-adk`; packages `kit-core` (shell/read/grep tools, approval gate `src/approval.ts`, skill discovery), `circle-tools` (CLI wrappers for UI), `agent-cli` (Ink terminal UI). Design: give the agent a **shell** + Circle skills from disk (`~/.agents/skills`), no typed tool per command; gate money-moving commands with y/N; real limit = `circle wallet limit set`. Prereqs Node 22.15+, Bun 1.2+, `bun add -g @circle-fin/cli`, model API key. Run: `bun install` then `bun run demo` in a kit. Slash commands `/help /wallets /balance /gateway /discover <kw>`. Marked "Arc testnet use only, not production-ready".

## 6. Other Circle AI surfaces

- **Arc Studio**: Circle's AI coding agent that builds/deploys full-stack USDC apps on Arc testnet (browser + Arc Studio CLI; can be driven from Claude Code/Codex/Cursor). Docs: https://docs.arc.io/ai/arc-studio, https://docs.arc.io/ai/arc-studio-cli.
- `circlefin/circle-ooak` — "Object-Oriented Agent Kit" (2026-07-01); not documented on developers.circle.com; unverified relevance.
- `circlefin/arc-remote-signer` — remote signing service on AWS Nitro Enclaves for Arc (useful if you roll your own agent key custody).

## Suggested setup for a Tameion team

```bash
npm i -g @circle-fin/cli
claude mcp add --transport http circle https://api.circle.com/v1/codegen/mcp --scope user
circle skill install --tool claude-code          # all 18 skills
```
Then in the product agent: bundle the relevant skills text (wallet-pay decision table, policy rules) into its system prompt or skill loader rather than fetching remote markdown at runtime (remote skills can change under you).
