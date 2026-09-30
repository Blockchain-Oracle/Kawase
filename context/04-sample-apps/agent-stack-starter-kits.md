# agent-stack-starter-kits
Six runnable terminal agents, one per framework: LangChain Deep Agents, Claude Agent SDK, Mastra, OpenAI Agents SDK, Vercel AI SDK and Google ADK. Each gives an LLM a shell, lets Circle's own skills teach it the `circle` CLI, and has it own a **Circle Agent Wallet** that pays for x402 / Nanopayment services on the Circle Agent Marketplace, with a y/N gate on every command that moves USDC.
Sources: https://github.com/circlefin/agent-stack-starter-kits, refs/circlefin/agent-stack-starter-kits @ 3996330, https://developers.circle.com/agent-stack (`.firecrawl/docs/circle-llms-full.txt:1`). Related: Agent Wallets quickstart (`circle-llms-full.txt:990`), Agent Nanopayments quickstart (`:717`), custom policies (`:1369`), supported chains (`:1104`).
Verified: 2026-09-29

## 1. What it does
- `bun run demo` inside any kit opens an Ink terminal chat with a pinned live USDC balance (`packages/agent-cli/src/index.tsx`).
- **Login before the agent starts.** The kit runs `circle wallet login <email> --type agent --init`, then `--otp`. You type the email and OTP; the kit stores neither (`packages/circle-tools/src/auth.ts:168,202`). If Circle's Terms of Use are unaccepted, the kit stops and tells you to accept them yourself (`auth.ts:112-114`).
- **The first turn is a bootstrap.** If `~/.agents/skills` is empty, the opening prompt is Circle's line `Run curl -sL https://agents.circle.com/skills/setup.md, and use the returned setup instructions to set up my agent wallet.` The agent then installs the skills, creates a wallet and checks/funds its balance (`packages/kit-core/src/instructions.ts:35-44,107-109`). On later runs it gets a status-check prompt instead (`:47-49`).
- **Transact.** The user asks in plain language ("check my flight WN2417 using FlightAware"). The agent runs `circle services search` / `inspect` / `pay` in its shell. Every USDC-moving command is printed and waits for **y/N** (`packages/kit-core/src/approval.ts:43-63`).
- **Quick slash commands** that skip the model: `/help`, `/wallets`, `/balance`, `/gateway`, `/discover <kw>`. A bare number picks a result from the last search (`packages/kit-core/src/commands.ts:107`).
- The system prompt is tiny: an identity line, 3 terminal rules and a skills index. The agent reads the relevant `SKILL.md` from disk as needed (`instructions.ts:51-98`).

## 2. RFB fit
- **Primary: RFB4 Autonomous Business Operator.** A production-shaped agent that owns a USDC wallet, discovers and buys services over x402, has human approval on spends, and relies on Circle-enforced spending caps as the hard ceiling. Pick a kit for your framework and fork it.
- Secondary: RFB2 (an AP agent paying vendor APIs) and RFB5 (an agent buying compliance/screening data from marketplace services).
- Missing for RFB4:
  - It uses **Agent Wallets** (CLI, email-OTP session), not Circle dev-controlled wallets, so there's no backend or server-side multi-tenant custody.
  - There is no persistent decision log; the only history is the in-memory conversation.
  - There is no budget model beyond the y/N prompt and the `circle wallet limit` caps, and **those caps are mainnet-only**.
  - There's no escalation other than the y/N prompt, no web UI, and nothing Arc-specific. The chrome reads balances on **BASE** mainnet by default (`packages/circle-tools/src/chains.ts:28,31`).

## 3. Tech stack + versions
- Monorepo managed with **Bun ≥1.2** workspaces (`package.json` `workspaces: ["packages/*","kits/*"]`), **Node ≥22.15.0**, TypeScript `^5.5`. Each kit runs with `bun run src/index.ts`.
- **Circle CLI** `@circle-fin/cli`, installed globally with `bun add -g @circle-fin/cli`. It is not a package dependency; the kits spawn the `circle` binary.
- Framework deps (declared version, then locked version from `bun.lock`):

| kit | framework deps | LLM providers | default model (`src/config.ts`) |
|---|---|---|---|
| `kits/claude-agent-sdk` | `@anthropic-ai/claude-agent-sdk ^0.3.144` (0.3.156) | Anthropic only | `claude-opus-5` (:32) |
| `kits/langchain` | `deepagents ^1.10.2` (1.10.2), `langchain ^1.4.2`, `@langchain/core ^1.1.44`, `@langchain/langgraph ^1.3.0`, `@langchain/anthropic ^1.3.26`, `@langchain/openai ^1.4.1`, `zod ^4.3.6` | Anthropic preferred, else OpenAI | `claude-opus-5` / `gpt-5.6-sol` (:32-33) |
| `kits/mastra` | `@mastra/core ^1.35.0` (1.37.1), `zod ^4.3.6` | Anthropic preferred, else OpenAI | `anthropic/claude-opus-5` / `openai/gpt-5.6-sol` (:36-37) |
| `kits/openai-agents` | `@openai/agents ^0.11.0` (0.11.6), `zod ^4.3.6` | OpenAI only | `gpt-5.6-sol` (:33) |
| `kits/vercel-ai` | `ai ^4.3.0` (4.3.19), `@ai-sdk/anthropic ^1.0.0`, `@ai-sdk/openai ^1.2.0`, `zod ^3.25.0` | Anthropic primary, with automatic fallback to OpenAI when both keys are set | `claude-opus-5` / `gpt-5.6-sol` (:42-43) |
| `kits/google-adk` | `@google/adk ^1.1.0` (1.1.0), `@google/genai ^1.37.0`, `zod ^4.3.6` | Gemini (AI Studio key) | `gemini-3.1-pro-preview` (:32) |

- Shared: `packages/agent-cli` (`ink ^5.2.1`, `ink-text-input ^6`, `react ^18.3.1`), `packages/kit-core`, `packages/circle-tools` (zero deps).

## 4. Architecture
- `refs/circlefin/agent-stack-starter-kits/packages/kit-core/src/approval.ts`: **the spend gate.** `NEEDS_APPROVAL` regexes (:43-63), shell-escape normalization (:113-142), segment splitting on `; | && || \n` (:150-155), `--estimate`/`--help` exemptions (:101-102,169-176), `requiresApproval()` (:182-186) and `describeApproval()` (:195-204).
- `packages/kit-core/src/tools.ts`: the three tool bodies (`executeShell` :293, `executeReadFile`, `executeGrep`), `approveCommand` (:224) and `REJECTED_MESSAGE` (:116).
- `packages/kit-core/src/shell.ts`: POSIX shell in `$HOME`, 180 s timeout (:37), 30k-char output cap (:48), and an **env allowlist** (:101-133) so the LLM API key never reaches the shell. `CIRCLE_ACCEPT_TERMS` is deliberately not forwarded.
- `packages/kit-core/src/skills.ts`: discovers skills in `~/.agents/skills` (fallback `~/.claude/skills`) (:47-48). Descriptions are capped at 320 chars (:58). Read fresh each turn.
- `packages/kit-core/src/instructions.ts`: system prompt, bootstrap and returning prompts.
- `packages/kit-core/src/{balance,commands,theme,fatal,session}.ts`: pinned balance readout, slash-command router, ANSI theme, error report, session flag.
- `packages/circle-tools/src/cli.ts`: `runCircle(args)` / `runCircleJson(args)` spawn the `circle` binary **without a shell** (so there is no injection), with a queue and transient-error retries (:206-271).
- `packages/circle-tools/src/{auth,wallet,gateway,services,chains}.ts`: typed wrappers the UI chrome uses, not the agent (details in section 5).
- `packages/agent-cli/src/index.tsx`, `retry.ts`: Ink chat UI plus the retry/timeout wrapper.
- Per kit, `kits/<kit>/src/`: `config.ts` (keys and model), `agent.ts` (framework agent), `tools.ts` (schema plus a one-line call into kit-core; the claude-agent-sdk kit has none), `index.ts` (chat loop and approval wiring), `theme.ts`. Extras: `mastra/src/workflow.ts` (the opening turn runs as a Mastra workflow) and `vercel-ai/src/retry.ts` (provider fallback).

Per-kit approval wiring (all call `requiresApproval` + `approveCommand` from kit-core):

| kit | where the gate lives | file:line |
|---|---|---|
| claude-agent-sdk | SDK `canUseTool` hook on the built-in `Bash` tool. `Read`/`Grep`/`Glob` are auto-allowed, and `settingSources: []` ignores the user's `~/.claude` | `kits/claude-agent-sdk/src/index.ts:260-269`; options `src/agent.ts:32,46,76-96` |
| langchain | inside `executeShell` (Deep Agents' `interruptOn` is per-tool, not per-command), with Deep Agents' own FS tools rooted at `$HOME` and a `MemorySaver` checkpointer | `kits/langchain/src/tools.ts:65`; `src/agent.ts:207-236` |
| mastra | inside `executeShell` via `createTool`; the opening turn is `onboardingWorkflow` | `kits/mastra/src/tools.ts:63-69`; `src/workflow.ts:41-80`; `src/index.ts:106` |
| openai-agents | `needsApproval: async (_ctx,{command}) => requiresApproval(command)`; interruptions are resolved with `state.approve/reject` | `kits/openai-agents/src/tools.ts:52-61`; `src/index.ts:68-94` |
| vercel-ai | inside `executeShell` (`generateText` has no permission hook), `maxSteps: 30` | `kits/vercel-ai/src/tools.ts:61-66`; `src/agent.ts:88-130` |
| google-adk | `beforeToolCallback` sees the args and returns `{error: REJECTED_MESSAGE}` on deny; `InMemoryRunner` | `kits/google-adk/src/agent.ts:58-75`; `src/index.ts:117-120` |

## 5. Circle products/SDKs used
**No Circle npm SDK is imported anywhere.** Everything goes through the **Circle CLI** (`circle`), either run by the agent in its shell (as the skills direct) or by the kit's chrome through `circle-tools`.

| product | package/API | where | what the call does |
|---|---|---|---|
| Agent Wallets: auth | `circle wallet status --type agent --output json` | `packages/circle-tools/src/auth.ts:78` | Session check, covering both mainnet and testnet sessions (:85-102). |
| Agent Wallets: login | `circle wallet login <email> --type agent --init`, then `circle wallet login --request <id> --otp <otp>` | `auth.ts:168,202` | Email-OTP login driven by the kit's UI. |
| Agent Wallets: logout | `circle wallet logout --type agent` | `auth.ts:309` | Clears the session. |
| Agent Wallets: list / balance | `circle wallet list --chain BASE --type agent`, `circle wallet balance --address --chain` | `packages/circle-tools/src/wallet.ts:81-100` | Pinned balance, `/wallets`, `/balance`. |
| Gateway (Nanopayments balance) | `circle gateway balance --address --chain` | `packages/circle-tools/src/gateway.ts:66-86` | `/gateway` readout. |
| Agent Marketplace discovery | `circle services search <kw> --output json` | `packages/circle-tools/src/services.ts:136-146`; the agent's own searches are parsed by `parseServiceSearch` (:123) | `/discover` and numbered picks. |
| x402 / Nanopayments pay (agent, gated) | `circle services pay <url> -X <method> --chain <C> [--max-amount] [--estimate]` | gate at `packages/kit-core/src/approval.ts:46`; usage taught by skill `pay-via-agent-wallet` | Signs the x402 authorization, settles and returns the seller's response. |
| Other gated agent commands | `circle wallet transfer`, `circle bridge transfer`, `circle gateway deposit/withdraw`, `circle wallet swap/execute/sign`, `circle wallet limit set/reset`, `circle terms accept/reset`, `circle wallet login` | `approval.ts:46-62` | USDC transfer, CCTP bridge, Gateway funding, swap, contract call, signing, policy change. |
| Spending policy (hard cap) | `circle wallet limit set --address --chain --policy-type stablecoin --per-tx --daily --weekly --monthly` (plus recipient/contract allow- and blocklists) | recommended in `README.md:14`; the docs are at `circle-llms-full.txt:1369-1478` | Circle-enforced caps, confirmed by email OTP. **Mainnet agent wallets only.** |
| Circle Skills | `curl -sL https://agents.circle.com/skills/setup.md`, `circle skill install --tool …`, or `bunx skills add circlefin/skills -g` | `instructions.ts:35-44`; `README.md` "Prerequisites" | Installs the `circlefin/skills` markdown into `~/.agents/skills`. |

Auth model: there is **no Circle API key**. Circle auth is the CLI's email+OTP agent session, stored in the OS keyring. The only secrets in `.env` are LLM provider keys.

## 6. Env vars
Per kit, in `kits/<kit>/.env.example`:
- claude-agent-sdk: `ANTHROPIC_API_KEY` (API key only; OAuth can hang the SDK subprocess, per `config.ts` comments)
- langchain, mastra, vercel-ai: `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`
- openai-agents: `OPENAI_API_KEY`
- google-adk: `GOOGLE_API_KEY`
- All kits, optional: `LLM_MODEL` (Mastra expects the `provider/model` form) and `NODE_OPTIONS` (the corporate-TLS-proxy block).

## 7. How to run
```bash
bun add -g @circle-fin/cli            # Circle CLI
cd refs/circlefin/agent-stack-starter-kits && bun install
cd kits/claude-agent-sdk              # or langchain | mastra | openai-agents | vercel-ai | google-adk
cp .env.example .env                  # add the LLM key
bun run demo
```
Prerequisites: Node 22.15+, Bun 1.2+, a Circle account (email for OTP login), and an LLM API key. On first run, accept Circle's Terms yourself via `circle wallet status`. Optionally pre-install the skills with `circle skill install --tool claude-code` or `bunx skills add circlefin/skills -g`. For testnet, log in with `--testnet` and fund with `circle wallet fund --chain ARC-TESTNET`, which draws 20 USDC from the faucet (`circle-llms-full.txt:1030-1071`). The kits pass no testnet flag themselves.

## 8. Smart contracts
None. Payments settle through Circle Gateway / x402 sellers chosen by the CLI. Agent Wallets support ARC / ARC-TESTNET plus 8 other EVM chain pairs (`circle-llms-full.txt:1104-1124`). The kit chrome only knows `BASE` (CLI `BASE`, `eip155:8453`) and `POLYGON` (CLI `MATIC`, `eip155:137`) (`packages/circle-tools/src/chains.ts:28-60`).

## 9. AI/LLM usage
- Providers and models: see the section 3 table. Every kit accepts a `LLM_MODEL` override.
- System prompt: `packages/kit-core/src/instructions.ts:51-98`. It contains an identity line (:51-53), 3 operating rules (:63-67: read errors before re-running, redirect large output to a file, a list is not its first entry) and the skills index or the "no skills yet" bootstrap text (:69-81).
- What the AI decides: which marketplace service fits the request, which chain and scheme to pay on, how to fund (fiat, crypto, Gateway deposit), when to install skills, and how to recover from CLI errors. All of it is driven by Circle's skills read off disk, not by code in this repo.

## 10. Reusable for a hackathon entry
- **Command-level spend gate (RFB4 approval limits):** lift `packages/kit-core/src/approval.ts` wholesale. It is ~200 lines with no deps. Extend `NEEDS_APPROVAL` with your own rules, and swap the y/N for a budget check (for example, auto-approve `services pay` under $0.05 and escalate above that; parse `--max-amount` or run `--estimate` first).
- **Framework adapters for a human-in-the-loop hook:** copy the approval wiring for your framework from the section 4 table. The Claude Agent SDK `canUseTool` (`kits/claude-agent-sdk/src/index.ts:260-269`) and OpenAI `needsApproval` (`kits/openai-agents/src/tools.ts:60`) are the cleanest.
- **Safe shell for agents:** `packages/kit-core/src/shell.ts` has the env allowlist (:101-133) that keeps LLM keys away from tool output, plus the timeout and process-group kill.
- **Typed Circle CLI wrappers:** `packages/circle-tools/src/cli.ts:206-271` (`runCircle`/`runCircleJson`, spawned without a shell, with retries) plus `wallet.ts`, `gateway.ts` and `services.ts`. Use them from a Next.js or server backend to show agent-wallet balances and marketplace search.
- **Progressive-disclosure skills loader:** `packages/kit-core/src/skills.ts` + `instructions.ts`. It puts only a skills index in the prompt and lets the model read the SKILL.md itself.
- **Vercel AI SDK provider fallback:** `kits/vercel-ai/src/retry.ts` (`isQuotaExhausted`, :35) + `config.ts` fallback, for a resilient demo.
- For an Arc-native RFB4 demo, log in with `--testnet`, create a wallet on `ARC-TESTNET`, run `circle gateway deposit --chain ARC-TESTNET --method direct`, and point the agent at your own x402 seller (for example `arc-nanopayments`' `withGateway` routes) instead of the mainnet marketplace.

## 11. Limitations / gotchas
- **Spending policies are mainnet-only.** `circle wallet limit set` rejects testnet (`circle-llms-full.txt:1375,1393`; skill `agent-wallet-policy/SKILL.md:21,99`). On Arc testnet your only guard is the y/N gate plus whatever you add. The README's "What actually stops it" does not apply to testnet demos.
- **Real money by default.** The kits don't pass `--testnet`, the chrome reads **BASE mainnet** balances (`chains.ts:31`), and marketplace sellers mostly accept mainnet Base, Polygon or Avax. That contradicts the README's "intended for Arc testnet use only" disclaimer.
- **Not a sandbox.** The agent has a full shell in `$HOME` and can delete files, install packages or `curl` anywhere. Seller-controlled marketplace strings could prompt-inject it (`approval.ts:32-37`). The gate is regex-based over the command string; it normalizes quotes and backslashes but does not evaluate `$VAR` or `eval` indirection (`approval.ts:104-112`).
- Six kits, not five: the brief's list omits **Mastra**, which is included.
- Requires an interactive TTY. The OTP login and y/N prompts mean it can't run headless or in CI as-is.
- Agent Wallets are a Circle-custodied CLI/session product. They are **not** dev-controlled wallets (no `CIRCLE_API_KEY`/entity secret), so there's no programmatic multi-agent provisioning from a backend.
- Skills are fetched live from `agents.circle.com` on first run, so behaviour can change without a repo change and needs network access. The skill count in the code comments ("seventeen") differs from the current repo (18).
- Model IDs (`claude-opus-5`, `gpt-5.6-sol`, `gemini-3.1-pro-preview`) are hardcoded defaults. Override them with `LLM_MODEL` if your key lacks access.
- Nanopayments need an **EOA** signer (Gateway uses `ecrecover`). The CLI handles this for agent wallets, but it matters if you port the pattern to dev-controlled SCA wallets.
