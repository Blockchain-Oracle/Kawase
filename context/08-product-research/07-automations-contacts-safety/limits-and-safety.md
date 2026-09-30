# Limits and safety policy: caps, allowlists, cooldowns, approvals; where each is enforced; simulation; prompt injection

Purpose: the limit set a consumer Arc money agent needs, the layer that can actually enforce each limit (contract, Circle, server, prompt), how to pre-check transactions on Arc, and how to keep an LLM that reads outside content from moving money.

Sources:
- OWASP Top 10 for LLM Applications 2025: https://genai.owasp.org/llm-top-10/ ; https://genai.owasp.org/llmrisk/llm01-prompt-injection/ ; https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (all fetched 2026-09-29)
- Incidents: https://incidentdatabase.ai/cite/1003/ and https://cointelegraph.com/news/hacker-breaches-ai-crypto-bot-aixbt-steals-55-eth (AIXBT); https://simonwillison.net/2024/Nov/29/0xfreysaagent/ and https://the-decoder.com/hacker-wins-47000-by-tricking-ai-chatbot-with-smart-prompting/ (Freysa); https://arxiv.org/abs/2503.16248 (ElizaOS memory injection); sibling `04-analogs-and-competitors/failures-and-incidents.md`
- Circle policy: `.firecrawl/docs/circle-llms-full.txt:1369-1440, 2084-2214`; `context/02-circle-agent-stack/guardrails-and-policies.md`
- Onchain policy bytecode: `.firecrawl/product/07/session-permission-getcode-2026-09-29.txt`; https://github.com/MetaMask/delegation-framework
- Simulation: live RPC probe `.firecrawl/product/07/arc-rpc-simulation-methods-2026-09-29.txt`; https://docs.tenderly.co/supported-networks (`.firecrawl/product/07/tenderly-supported-networks.md:50-61`); `context/01-arc/gotchas.md:67`; https://docs.arc.io/arc/references/evm-differences (`.firecrawl/docs/arc-llms-full.txt:18317-18322`); Blockaid docs (login-gated: https://docs.blockaid.io/docs/supported-chains redirects to docs-login)
- Essay: `context/06-ledgers-and-prior-art/agents-and-ledgers.md` §6–7; `design-principles-for-agent-writes.md` §4, §7

Verified: 2026-09-29

---

## 1. The limit catalogue [INFERENCE for defaults; precedent tagged]

| Limit | Suggested consumer default | Precedent |
|---|---|---|
| Per-transaction cap | $250 | Circle Agent Wallet `--per-tx` [VERIFIED]. Bankr per-tx USD caps [VERIFIED sibling] |
| Daily / weekly / monthly caps (rolling) | $500 / $1,500 / $4,000 | Circle requires per-tx ≤ daily ≤ weekly ≤ monthly, as rolling windows [VERIFIED `circle-llms-full.txt:1418-1420`] |
| Per-recipient cap | Weekly cap per contact, e.g. $200 | No Circle primitive [VERIFIED absence in `guardrails-and-policies.md`]. Possible onchain via period caveats per delegation [VERIFIED bytecode] |
| Recipient allowlist ("only saved contacts") | On for unattended automations. Optional for attended sends. | Circle `recipient-allowlist` (mainnet) [VERIFIED]. Circle Address Book MSCA module [VERIFIED sibling] |
| Contract allowlist | Only App Kit swap/bridge/earn routers, USDC, EURC and the Memo contract | Circle `contract-allowlist` [VERIFIED] |
| New-recipient cooldown | 24 h before a new address can receive more than $X (e.g. $50) | Bankr 24 h default [VERIFIED sibling]. Coinbase 48 h [REPORTED] |
| Human-approval threshold | Any send > $100, any first-time recipient > $20, any contract not on the allowlist, any policy change | OWASP LLM06: "require a human to approve high-impact actions" [VERIFIED] |
| Protected floor | Keep ≥ $X plus a gas float | No onchain primitive on Arc or Circle [REPORTED arc-agent lesson #36, `context/07-prior-work/arc-agent-lessons.md:58`]. App-level only. Say so in the UI. |
| Slippage max | 50 bps for stable↔stable, 300 bps for others | App Kit default 300 bps, plus `stopLimit` [VERIFIED `stablecoins-fx-and-yield.md:30`] |
| x402 / marketplace max price | Per call and per day | `circle services pay --max-amount` is per-invocation and client-side only [VERIFIED `guardrails-and-policies.md` §2] |
| Velocity | ≤ N sends per 10 min | Bankr: agent commands ≥10 min apart, DCA ≥1 h apart [VERIFIED sibling] |
| Limit-change delay | Raising limits takes effect after 24 h. Lowering is instant. | Coinbase turning off allowlisting takes 48 h [REPORTED]. Circle policy change needs an email OTP [VERIFIED] |

## 2. Where each limit is enforced, and why

The rule from the host's own FAQ: "a contract that enforces the budget rather than a prompt that requests it, a threshold above which a human signs, a complete record it must produce afterwards" [VERIFIED quote in `design-principles-for-agent-writes.md` §4]. OWASP LLM06 says the same: "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not" [VERIFIED].

| Layer | Can the agent (or a compromised server) bypass it? | What to put there | Arc status today |
|---|---|---|---|
| **Prompt / system instructions** | Yes. Freysa's instructions said never to transfer, and they were talked past [REPORTED]. | Tone, clarification behavior. **No limits.** | n/a |
| **Model tool schema** | Yes, if the tool exists | Remove the tools the agent shouldn't have (no raw "sign arbitrary calldata" tool) | n/a |
| **Server policy engine** (deterministic code before signing) | Not by the model. Yes by a compromised server or operator. | Everything, as the first gate: caps, cooldowns, per-recipient caps, floor, lookalike checks, velocity, approval routing. It produces an explainable decision. | Always available |
| **Circle-managed policy** (Agent Wallet) | No. Changing it needs a human email OTP. Circle warns not to give the agent inbox access [VERIFIED `guardrails-and-policies.md` §1]. | Per-tx / daily / weekly / monthly USDC caps, recipient and contract allow/blocklists | **Arc mainnet only**, and budgets are EVM-wide, not per chain [VERIFIED] |
| **Smart-account / delegation caveats** | No, while the root key is not with the agent | Period caps per recipient, target/method allowlist, expiry, call count | Enforcer bytecode is on Arc mainnet and testnet [VERIFIED], but no funded run has been seen [UNKNOWN] |
| **Wallet balance** (budget sub-wallet) | No | The absolute worst case | Always |
| **User signature per action** (passkey/biometric) | No | Anything above the approval threshold | Circle user-controlled or modular wallets [VERIFIED sibling] |

Design consequence [INFERENCE]: enforce **twice**. The server policy engine explains ("blocked: weekly cap $1,500, used $1,420"). The onchain or Circle layer guarantees the cap even if the server is wrong or compromised. The UI must label which limits are "guaranteed by your wallet" and which are "checked by the app" (arc-agent's protected floor was app-level but presented as a guard, and the lesson file says never to present it as unavoidable) [VERIFIED `arc-agent-lessons.md:58`].

Arc-specific: native USDC sends are not bounded by ERC-20 allowances, so onchain caps must cover both the native and the ERC-20 path [VERIFIED `gotchas.md:24`].

## 3. "Model proposes, code executes"

The essay's sixth recommendation is "Keep the model's output as an input, never as the release condition". Its negative example is Circle's `arc-escrow`, where release = `valid && confidence === "HIGH"` [VERIFIED `agents-and-ledgers.md` §6–7].

Pipeline [INFERENCE, consistent with `design-principles-for-agent-writes.md` §0]:
```
utterance ─▶ LLM ─▶ typed Proposal {action, recipientName, amount, asset, chain, schedule?}   (no addresses, no calldata)
          ─▶ resolver (contacts, names)      ─▶ bound Proposal {recipientAddress, contactVersion}
          ─▶ policy engine (deterministic)   ─▶ allow | needs_approval(reason) | deny(reason)
          ─▶ quote + preflight (§4)          ─▶ exact effects: amount out, fee, gas, balance after
          ─▶ confirmation card (user taps + biometric when required)
          ─▶ PaymentIntent{intentId, idempotencyKey} persisted
          ─▶ executor builds calldata from the bound proposal (never from model text)
          ─▶ witness (receipt status==1 / Circle COMPLETE) ─▶ ledger + decision log
```
The model never produces the address, calldata, idempotency key or approval. It can only fill a typed form that code validates.

## 4. Transaction simulation on Arc (probed 2026-09-29)

| Method | Arc mainnet | Arc testnet | Evidence |
|---|---|---|---|
| `eth_call` / `eth_estimateGas` | Works (estimateGas returned `0x52e9`) | Works | [VERIFIED live probe] |
| `eth_simulateV1` (multi-call, asset-change tracing) | **"method not supported"** | **"method not supported"** | [VERIFIED live probe on the Circle public RPC] |
| `debug_traceCall` | **"method not supported"** | **"method not supported"** | [VERIFIED live probe on the Circle public RPC] |
| Tenderly (Dev tools = simulator, Monitor, Virtual Env, Node) | Listed, chain 5042, all ✓ | Listed, chain 5042002, all ✓ | [VERIFIED Tenderly docs table] |
| Arc's own warning | "Tools that locally simulate the EVM (such as Foundry's `anvil`) run a standard EVM, not Arc's, and can't reproduce Arc-specific behavior." Use `arc-anvil --network arc`. | same | [VERIFIED `arc-llms-full.txt:18317-18322`]. The context gotcha file extends this to "Tenderly-like simulators" [`gotchas.md:67`]. Whether Tenderly models Arc's USDC-native value rules and blocklist is [UNKNOWN]. |
| Blockaid (security scanning) | [UNKNOWN] (docs require login) | [UNKNOWN] | Blockaid appears in the Circle Alliance Directory [REPORTED search result] |

Practical preflight [INFERENCE]:
1. `eth_call` the exact transaction from the exact sender. A revert means don't send. This catches blocklist reverts (which would otherwise consume gas, gotcha #9), insufficient balance and bad calldata.
2. `eth_estimateGas` × margin, with the `maxFeePerGas` floor at 20 gwei (gotcha #14).
3. Compute the **expected balance delta** in code from the bound proposal (amount + fee + gas), and show it on the card. For swaps, use the App Kit quote's min-out.
4. Optionally use Tenderly simulation for complex contract calls, labelled "simulated on a third-party EVM model".
5. After execution, compare the actual receipt effects with the preview. A mismatch triggers an alert.

## 5. Prompt injection when the agent reads external content

**OWASP LLM01:2025 Prompt Injection:** "Indirect prompt injections occur when an LLM accepts input from external sources, such as websites or files." Its mitigations include "Enforce privilege control and least privilege access", "Require human approval for high-risk actions", and "Segregate and identify external content" [VERIFIED].
**OWASP LLM06:2025 Excessive Agency:** "the vulnerability that enables damaging actions to be performed in response to unexpected, ambiguous or manipulated outputs from an LLM". Its mitigations are minimizing extensions and permissions, human-in-the-loop, and "Implement authorization in downstream systems" [VERIFIED].

Incidents to design against:

| Incident | What happened | Lesson |
|---|---|---|
| **Freysa** (Nov 2024) | The agent was told never to call `approveTransfer`. An attacker reframed the tool as handling *incoming* funds, and it sent 13.19 ETH (~$47k) [REPORTED the-decoder, Simon Willison] | Instructions are not a control. The tool itself must be unreachable or capped. |
| **AIXBT** (18 Mar 2025) | An attacker got into the operator **dashboard** and queued two prompts that made the agent transfer 55.5 ETH [REPORTED Cointelegraph, AIID #1003] | The control plane (admin UI, queued prompts) is part of the attack surface. Approval must come from the *user's* key, not from the operator console. |
| **ElizaOS memory injection** (arXiv 2503.16248) | Malicious text stored in shared memory from Discord later made the agent execute trades at higher leverage in another context, "while showing the user a benign output" [VERIFIED abstract via search] | Memory is untrusted input. Never store authorizations or recipients in free-form memory. |
| Sibling catalogue (Zscaler SEO-poisoned pages telling agents to pay, MCP tool poisoning, and others) | See `04-analogs-and-competitors/failures-and-incidents.md` B/C sections | Put controls at the action layer |

Defenses for this product [INFERENCE, mapped to the OWASP items above]:
1. **Two-channel rule.** Only the *user's own turn* (typed or voice from the authenticated session) can originate a money intent. Content from web pages, emails, token metadata, memos, x402 responses, Telegram group messages or tool outputs is wrapped as `untrusted_content` and **can't** create or modify a proposal's recipient or amount.
2. **No address from content.** The resolver accepts only contacts, user-typed or pasted input, QR, or name resolution the user initiated.
3. **Least-privilege tools.** No generic "execute calldata" tool for the chat model. Only typed actions (send, swap, bridge, earn, request) with code-built calldata.
4. **Every write goes through confirmation** above the thresholds, on the user's device, with the device's biometric or passkey.
5. **Policy changes are never a chat action.** Raising limits and adding allowlist entries happen only in the settings UI, with a biometric or OTP and a delay.
6. **Memory hygiene.** Memory can hold preferences, but facts that affect payments (addresses, limits) come only from typed stores.
7. **Red-team suite.** Replay the incident patterns (tool reframing, memo instructions, fake "new address" emails) as regression tests (OWASP LLM01 mitigation 7) [VERIFIED as an OWASP recommendation].

## Gaps

- I did not run an Arc-specific fidelity test of Tenderly.
- Blockaid's Arc support is unknown (login-gated).
- I did not test other providers' RPCs (Alchemy, QuickNode) for `eth_simulateV1` support. Only Circle's public RPC was probed.
- Suggested default limits are judgment calls, not benchmarks.
