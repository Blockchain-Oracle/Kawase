# aomi (Aomi Labs)

Purpose: what aomi is, its CLI, SDK and API surfaces, and how a Tameion builder might use it. aomi is a "friend of Canteen" and ran a session plus office hours during Tameion.

Sources: https://aomi.dev (landing), https://aomi.dev/agents.md, https://aomi.dev/llms.txt, https://aomi.dev/llms-full.txt (117 KB corpus, saved at `.firecrawl/canteen/aomi-llms-full.txt`), GitHub org `aomi-labs` (READMEs of `aomi`, `aomi-sdk`, `liqsteward`, `stewardfx`), YouTube `PUqQPeWtUYM` (third-party aomi SDK tutorial), Tameion kickoff slides.
Verified: 2026-09-29

---

## What it is

"Execution harness for onchain finance." aomi turns natural-language intent into **policy-checked onchain execution**. It builds the exact transaction, **simulates it on a fork of the live chain**, returns it to the user's wallet for signature, and verifies the result. It is non-custodial, wallet-agnostic, and uses account abstraction by default (EIP-7702 / 4337 via Alchemy or Pimlico). It describes itself as "Claude Code for EVM": your agent keeps its reasoning and calls aomi when a task goes onchain.

Three guarantees ("safety mantra"): **read by default** (no key for prices, balances or sims), **simulate before sign**, and **credentials never round-trip** (the agent never sees keys).

Backed by Anagram and Nascent. Production users listed: Sommelier, Para, Khalani, World Markets, Swig, Molinar. Discord: https://discord.gg/uk5ZAMuepJ · X: @aomi_labs · Docs: https://aomi.dev/docs/ · Web chat: https://chat.aomi.dev · Build portal: https://build.aomi.dev

## Surfaces

| Surface | Package / command | Use |
|---|---|---|
| CLI | `npm i -g @aomi-labs/client` → `aomi` | Chat, simulate and sign from a shell. This is what a coding agent drives |
| Agent skill | `npx skills add aomi-labs/skills` → `aomi-transact`, `aomi-build` | Teaches Claude Code, Codex, Cursor, OpenCode or Hermes the chat → simulate → sign procedure and the app-building procedure |
| React widget | `npx shadcn add https://aomi.dev/r/aomi-frame.json` → `<AomiFrame backendUrl=… />` (`NEXT_PUBLIC_BACKEND_URL=https://api.aomi.dev`) | Chat-to-transaction UI inside a Next.js app |
| Headless runtime | `@aomi-labs/react` | Your own UI on aomi threads, tool events and wallet requests |
| TS client | `@aomi-labs/client` | Programmatic access from Node or the browser |
| REST API | `https://aomi.dev/docs/reference/api-reference.md` | Orchestration or direct transaction-pipeline control |
| Plugin SDK (Rust) | `aomi-labs/aomi-sdk` (`DynAomiTool`, `dyn_aomi_app!`, the `aomi-build` CLI) | Wrap your product or API as an "Aomi App" (tool bundle plus system prompt) hosted on aomi's runtime. Community apps go to `aomi-labs/community-apps` via `aomi-build deploy` |
| Python | `aomi-labs/aomi-python` | Python client (sparse) |

## Core CLI

```bash
aomi --prompt "what is the price of ETH?"          # smoke test
aomi chat "<msg>" --new-session --public-key 0xYou --chain 1 [--app <name>] [--model <rig>] [--verbose]
aomi tx list | aomi tx simulate tx-1 tx-2 | aomi tx sign tx-1 tx-2 [--rpc-url <url>] [--eoa]
aomi session list|new|resume <id>|status|log|events|close
aomi app list|current   aomi model list|set   aomi chain list|current|set <id>
aomi wallet current|set <key>   aomi secret list|add NAME=value|clear   aomi config current|set-backend <url>
aomi account login|whoami     # Privy-backed account binding
```
State lives in `~/.aomi/`. Rules the skill enforces: never invent credentials, always `tx simulate` before `tx sign` for multi-step batches, and use `--new-session` for a new task. `--chain` sets the session context and `--rpc-url` sets the signing transport; keep the two aligned.

**Apps (tool bundles):** default (web search), binance, bybit, cow, defillama, dune, dydx, gmx, hyperliquid, kaito, kalshi, khalani (cross-chain intents), lifi, manifold, molinar, morpho, neynar, okx, oneinch, para, polymarket, polymarket-rewards, x, yearn, zerox. Every app shares the base tools `send_transaction_to_wallet`, `encode_and_simulate`, `get_account_info` and `get_contract_abi`.

## Arc support: a gap to check

The documented **supported chains** are Ethereum 1, Polygon 137, Arbitrum 42161, Base 8453, Optimism 10, Sepolia (`--eoa`) and Anvil 31337 (`--eoa`). The landing page adds Linea, Monad, Robinhood Chain, MegaETH and Solana. **Arc (5042002) is not listed** anywhere in the docs corpus. Ask at the aomi office hours (Oct 6, 11:00 ET) or in the aomi Discord whether Arc testnet works with `--chain 5042002 --rpc-url $RPC --eoa`, or whether aomi can fork Arc for simulation. Until confirmed, treat aomi as a harness for your agent's **non-Arc legs**, such as DeFi yield, swaps, cross-chain intents and Polymarket, with Arc remaining the settlement and accounting rail.

## How a Tameion builder could use it

- **The "witness in front of every write" pattern** (Agents & Ledgers takeaway): route every agent-initiated treasury action through `aomi tx simulate` and gate `sign` on a policy check. A fork simulation plus the returned diff is a decision-log artifact you can hash onto Arc.
- **RFB 1 (Treasury):** the agent decides the allocation. aomi builds and simulates the Morpho, Yearn or Lido deposits or the 0x/Khalani swaps on EVM chains, while idle USDC or USYC sits on Arc and CCTP/Gateway moves funds. Look at `aomi-labs/liqsteward` (vault incident containment: risk signal → deterministic plans → aomi `evm_stage_tx → simulate_batch → finalize_simulation` → **unsigned Safe package**; no signing or broadcast) and `aomi-labs/stewardfx` (FX obligation → policy → authorization → atomic settlement → reconciliation). Both are close analogues of RFB 1 and RFB 5, with a human signer.
- **RFB 4 (Autonomous Operator):** embed `<AomiFrame>` as the operator console, so the owner chats, the agent proposes and the owner signs above a threshold.
- **Build an Aomi App** that wraps your own treasury or AP API (`aomi-build` skill: 3–8 typed tools such as `search_*`, `get_*`, `build_*`, `submit_*`), so any aomi agent can call your product. This is a distribution angle.
- Judging tie-in: aomi counts toward "agentic sophistication" (a real decide → simulate → sign loop). It does **not** count as Circle tool usage, so pair it with Wallets, Gateway, CCTP or USYC on Arc.

## Session / office hours

- Tue Sep 29, 10:30 ET: aomi session. 11:00 ET: aomi office hours. Tue Oct 6, 11:00 ET: aomi office hours. Links are in the Canteen Discord. No public recording was found as of 2026-09-29.
- Third-party walkthrough: "Building an AI-Native Prediction Market in 30 Minutes | Aomi SDK Tutorial" (`transcripts/aomi-sdk-prediction-market-tutorial.md`).
