# Agent identity, reputation, escrow, A2A — where Circle stands

Purpose: record what Circle's Agent Stack does and doesn't provide for agent identity/reputation/agent-to-agent commerce, and point to the Arc-side primitives (ERC-8004, ERC-8183) you call from an agent wallet.
Sources: developers.circle.com llms-full dump (grep: no ERC-8004/8183 content in Circle docs), docs.arc.io llms (local `.firecrawl/docs/arc-llms*.txt`: "Register an AI Agent", "Create an ERC-8183 Job", "Agentic Economy"), agents.circle.com/.well-known/a2a.json, prior `arc-agent/docs/wiki/agentic-economy-and-escrow.md` (2026-07-28).
Verified: 2026-09-29 (addresses re-checked against the current Arc docs dump; not re-checked onchain)

## Circle Agent Stack: no first-class identity/reputation

- developers.circle.com documents **no** ERC-8004, agent identity, reputation, or escrow product inside the Agent Stack. The CLI has no identity/job commands (prior inventory confirmed; 1.1.4 unchanged).
- The closest Circle-side "trust" signals: marketplace sellers are sanctions-screened + health-checked; Facilitator Service screens both parties; Agent Wallet transfers are screened. None gives a queryable score.
- A2A: Circle publishes an A2A card for the **Discovery API** (https://agents.circle.com/.well-known/a2a.json, "x402 Discovery API") and markets "agent-to-agent commerce" as a nanopayments use case. No A2A messaging/negotiation product.

## Arc-side primitives (see the Arc section of this library for depth)

ERC-8004 "Trustless Agents" (Draft) on Arc Testnet:

| Registry | Address |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (`register(metadataURI)` mints an identity NFT) |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` (feedback from external observers) |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` (request/response validation) |

ERC-8183 "Agentic Commerce" (Draft) job escrow reference implementation on Arc Testnet: `0x0747EEf0706327138c69792bF28Cd525089e4583` — states Open → Funded → Submitted → Completed/Rejected/Expired; flow create → budget → approve USDC → fund → provider submit → evaluator complete/reject; expiry refunds client.

Tutorials: https://docs.arc.io/arc/tutorials/register-your-first-ai-agent.md · https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job.md · https://docs.arc.io/build/agentic-economy.md

## Calling them from the Circle stack

```bash
# agent wallet registers itself (Arc Testnet)
circle wallet execute "register(string)" "ipfs://…/agent.json" \
  --contract 0x8004A818BFB912233c491871b3d84c89A494BD9e --address $ADDR --chain ARC-TESTNET --output json
# approve escrow to pull USDC, then fund a job (function names per the Arc ERC-8183 tutorial)
circle wallet execute "approve(address,uint256)" 0x0747EEf0706327138c69792bF28Cd525089e4583 5000000 \
  --contract 0x3600000000000000000000000000000000000000 --address $ADDR --chain ARC-TESTNET
```
Check exact function signatures in the Arc tutorials before use (Draft standards; the ABI can differ from the EIP text). Dev-controlled wallets: `createContractExecutionTransaction({abiFunctionSignature, abiParameters, contractAddress, blockchain:"ARC-TESTNET"})`.

## Patterns for Tameion

- **Vendor reputation (RFB 3)**: after each milestone paid via escrow, write feedback to ReputationRegistry; rank vendors by onchain history + payment timeliness from your own ledger.
- **Agent identity for sellers**: register your x402 seller agent in IdentityRegistry and put the agentId in its OpenAPI/marketplace metadata, so buyer agents can check reputation before paying.
- **Milestone payouts**: `circlefin/arc-escrow` (sample; AI-validated deliverables, release/refund on Arc) is Tameion's recommended RFB 3 start; ERC-8183 is the standards-based alternative.
- Caveats (from prior research): Draft standards; deployed code ≠ audited; reputation scores are not objectively correct and can be colluded; no dispute process.
