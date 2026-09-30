# Guardrails, spending policies and compliance controls

Purpose: every control Circle provides to keep an agent inside limits (Agent Wallet policies, OTP gates, sanctions screening, client-side caps), their exact limits, and what you must build yourself on Arc Testnet.
Sources: /agent-stack/agent-wallets/wallet-operations/custom-policies, /agent-stack/circle-cli/command-reference (`wallet limit*`), live `circle wallet limit set --help` (1.1.4), agents.circle.com/skills/wallet-policy.md, /wallets/compliance-engine, /api-reference/wallets/compliance/screen-address, /facilitator-service/how-it-works, circlefin/agent-stack-starter-kits README, arc-agent wiki (2026-07-29).
Verified: 2026-09-29

## 1. Agent Wallet spending policies (server-enforced, mainnet only)

| Rule type (`--rule-type`) | Policy type (`--policy-type`) | Params | Effect |
|---|---|---|---|
| `transfer-limit` (default) | `stablecoin` | `--per-tx`, `--daily`, `--weekly`, `--monthly` (rolling windows) | Caps USDC outbound transfers **and x402 payments** |
| `recipient-allowlist` / `recipient-blocklist` | `stablecoin` | `--targets "[0xA,0xB]"` | Only allow / block USDC transfers to addresses |
| `contract-allowlist` / `contract-blocklist` | `contract` (auto-set) | `--targets "[0xC1,0xC2]"` | Only allow / block contract interactions |

```bash
circle wallet limit --address 0xW --chain ARC --output json          # read, no OTP
circle wallet limit set --address 0xW --chain ARC --policy-type stablecoin \
  --per-tx 100 --daily 500 --weekly 2000 --monthly 5000               # human OTP
circle wallet limit set --address 0xW --chain ARC --policy-type stablecoin \
  --rule-type recipient-allowlist --targets "[0xVendor1,0xVendor2]"
circle wallet limit set --address 0xW --chain ARC --policy-type contract \
  --rule-type contract-allowlist --targets "[0xEscrow,0xUSDC]"
circle wallet limit budget --address 0xW                              # remaining per-tx/daily/weekly/monthly, EVM-wide
circle wallet limit reset --address 0xW --chain ARC --yes             # back to defaults, human OTP
```

Constraints (docs + live help):
- **Mainnet agent wallets only.** Testnet chains (incl. `ARC-TESTNET`) are rejected at the CLI chain gate (prior research live-verified this 2026-07-29). Local wallets unsupported.
- `set` and `reset` send a **second email OTP** to the session email (or `--email`); the resulting human-entity JWT is held in memory only.
- per-tx ≤ daily ≤ weekly ≤ monthly.
- `set` creates a NEW policy; if one exists for the same wallet/chain/policy-type it fails → `reset` then `set`.
- Budgets are **EVM-wide**, not per chain.
- No documented: protected minimum balance, expiry/mandate, per-function allowlist, pause switch, per-category budgets, approval-threshold escalation, time-of-day rules.

### Scripting the OTP (from Circle's wallet-policy skill)
Each invocation sends a new OTP and invalidates the prior one — never re-run while waiting. Hold the CLI in one long-lived background shell reading from a FIFO, then write the human-supplied code to a sentinel file:
```bash
rm -f /tmp/circle-otp-pipe /tmp/circle-otp-code /tmp/circle-out; mkfifo /tmp/circle-otp-pipe
circle wallet limit set --address 0xW --chain BASE --policy-type stablecoin --per-tx 1000 --daily 5000 --weekly 20000 --monthly 50000 \
  < /tmp/circle-otp-pipe > /tmp/circle-out 2>&1 & CLI_PID=$!
exec 3>/tmp/circle-otp-pipe
for i in $(seq 1 180); do [ -f /tmp/circle-otp-code ] && { echo "$(cat /tmp/circle-otp-code)" >&3; exec 3>&-; wait $CLI_PID; cat /tmp/circle-out; exit 0; }; sleep 1; done
# then: cat /tmp/circle-out  (shows prefix, e.g. "OOW-"), ask the human, echo "123456" > /tmp/circle-otp-code
```
Design point: the OTP comes from a human, so an agent cannot loosen its own limits — this is the Circle answer to "authority that cannot be talked past" (RFB 4). Circle's docs warn: don't give the agent inbox access, or it can change its own policies.

## 2. Other built-in controls

| Control | Where | Enforced by | Testnet? |
|---|---|---|---|
| Sanctions screening of every Agent Wallet transfer before submission | Agent Wallets | Circle | yes (stated for all transfers) |
| Marketplace sellers' payout wallets continuously sanctions-screened; unhealthy endpoints auto-excluded | Agent Marketplace | Circle | n/a (mainnet listings) |
| Facilitator Service screens buyer and seller before settling; refuses if either fails | Facilitator Service | Circle | yes |
| `--max-amount <usdc>` on `services pay` | CLI | client (the CLI process) | yes |
| `--estimate` / `--quote` dry runs | CLI | client | yes |
| Swap stop-limit (`minBuyAmount`) + `--slippage-bps` (default 300) | CLI swap | onchain | Arc Testnet only |
| Terms-of-Use gate; agent must get explicit user consent before `circle terms accept` | CLI + skills | client/policy | yes |
| Idempotency keys (`--idempotency-key`, Facilitator `payment-identifier`) | CLI, Facilitator | server | yes |
| Local wallets: **no** policies, **no** OFAC screening, **no** audit logging | CLI `wallet import` | — | — |

## 3. Harness-level approval gate (starter-kit pattern)

`circlefin/agent-stack-starter-kits` gates on the **command**, not the tool: before any money-moving command (`services pay`, `wallet transfer`, `bridge transfer`, `gateway deposit`, `wallet sign`, spending-cap changes) the exact command is printed and waits for `y/N`; list in `packages/kit-core/src/approval.ts`. Framework hooks: Claude Agent SDK `canUseTool`, OpenAI Agents `needsApproval`, Google ADK `beforeToolCallback`, LangChain/Vercel/Mastra in-tool. Their guidance: "What actually stops it: set per-transaction, daily, weekly and monthly caps on the wallet itself with `circle wallet limit set` … Keep the wallet funded with what you would not mind losing."

## 4. Compliance screening APIs (for RFB 2/3/5)

- **Screen an address**: `POST https://api.circle.com/v1/w3s/compliance/screening/addresses` ("Create a screening request for a specific blockchain address and chain"). Part of **Compliance Engine** (transaction screening, rules, allow/blocklists, alerts, reporting) — "only available for eligible customers" on testnet and mainnet; access via request form. Needs a Circle API key. Verify access early or plan a fallback (e.g. rely on Facilitator/Agent-Wallet built-in screening + your own risk logic).
- Built-in, zero-integration screening you get for free: Agent Wallet transfers, Facilitator Service settlements, Marketplace seller wallets. None of these return a risk score to you — they only block.

## 5. What you must build on Arc Testnet (the gap = the opportunity)

Because Circle policies don't run on testnet (and RFB 4 wants "budgets and approval limits enforced in the contract rather than the prompt"):
- **PolicyWallet / spend-controller contract** on Arc Testnet: per-category budgets, per-tx approval threshold, allowlisted payees, pause, human co-sign above threshold. Agent wallet or dev-controlled wallet calls it via `circle wallet execute` / `createContractExecutionTransaction`.
- **Modular wallet modules** (ERC-6900) or ERC-4337 session keys — see Circle modular wallets docs (prior research: Circle's session-key plugin test was commented out; treat as unproven).
- **Application policy engine**: evaluate budget, counterparty risk, invoice match *before* each `services pay` / transfer; log the decision + reason + tx hash (audit trail judges ask for).
- Demo trick: show the same policy concept twice — Circle-native (`wallet limit set` on ARC mainnet with $1 caps) and your on-chain enforcement on Arc Testnet.
