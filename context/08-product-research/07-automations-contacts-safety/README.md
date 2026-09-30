# 07 · Automations, contacts, safety, notifications, history, user flows

Purpose: an index and headline findings for the "add-ons" of the Arc money agent: automations, contacts and names, limits and safety, notifications, history and exports, and the core user flows.

Sources: the files below; raw evidence saved under `.firecrawl/product/07/` (`cre-supported-networks.md`, `tenderly-supported-networks.md`, `session-permission-getcode-2026-09-29.txt`, `arcns-mainnet-getcode-2026-09-29.txt`, `arc-rpc-simulation-methods-2026-09-29.txt`, `chainlink-feeds-arc-mainnet.json`, `chainlink-eurusd-arc-mainnet-latestRoundData.json`, `tg-bot-api.html`).
Verified: 2026-09-29

> arc-agent (Abu's prior build) **failed**. Its automation and policy designs are **not** defaults here. It is cited only for lessons and failures (see `08-arc-agent-baseline-and-fit/what-was-learned.md`). Every Arc claim below was re-checked today.

## Files

| File | Read it for |
|---|---|
| [automations.md](automations.md) | Taxonomy (scheduled, price, event, balance, round-ups, DCA, yield sweep, bill pay, requests), which keepers support Arc, authority models, failure handling, idempotency, NL creation, lifecycle |
| [contacts-and-names.md](contacts-and-names.md) | Contact data model, "send to Alex" unknown flow, ENS / Basenames / ArcNS / email / QR, poisoning and lookalike defenses, address change control |
| [limits-and-safety.md](limits-and-safety.md) | Limit catalogue, the enforcement layer for each, "model proposes, code executes", simulation on Arc, prompt injection (OWASP 2025, incidents) |
| [notifications.md](notifications.md) | Event taxonomy, channels (push, Telegram, Discord, email), quiet hours, whether approving from Telegram is safe |
| [history-and-reporting.md](history-and-reporting.md) | Activity feed, decision log ("why?"), CSV and beancount exports, receipts, reconciliation |
| [user-flows.md](user-flows.md) | 16 journeys, each step tagged with evidence or inference |

## Headline findings

1. **No shared keeper network runs on Arc mainnet.** Chainlink Automation does not list Arc. Chainlink CRE lists **Arc Testnet only** and deploy access is gated. Gelato's docs are down (404) and I found no Arc evidence. Powerloom is a data protocol and **was shut down in July 2026**. The executor will be our own scheduler [VERIFIED].
2. **The real problem is authority, not scheduling.** Circle user-controlled wallets can't sign unattended. Agent Wallet caps and allowlists work **on Arc mainnet only** and need a human OTP to change [VERIFIED].
3. **Scoped onchain delegation is deployable on Arc today.** MetaMask Delegation Framework v1.3.0 is on **Arc mainnet and testnet**: DelegationManager, ERC20/Native period-transfer enforcers ("up to a fixed amount … during a given time period"), AllowedTargets, Timestamp, LimitedCalls, and the 7702 DeleGator. ZeroDev and Rhinestone policy modules are also on mainnet, but Rhinestone Smart Sessions is on testnet only. **No funded run on Arc has been seen** [VERIFIED bytecode; UNKNOWN runtime].
4. **Price triggers:** Chainlink has 32 feeds on Arc mainnet, including EUR/USD, but with a 24 h heartbeat and 0.5% deviation. Pyth lists Arc testnet only. **Correction (Codex review):** a Pyth contract `0x8250…487a` has code on mainnet (`02-defi-bridge-trade/prices-and-oracles.md:31`); mainnet feed freshness is unproven. Trigger on the executable App Kit quote and use the feed only as a sanity bound [VERIFIED; INFERENCE].
5. **Simulation:** Circle's public Arc RPC rejects `eth_simulateV1` and `debug_traceCall` on both networks. `eth_call` and `eth_estimateGas` work. Tenderly lists Arc 5042 and 5042002, but Arc warns that standard EVM simulators miss Arc behavior [VERIFIED].
6. **Names:** there is no official Arc naming service. ArcNS (`.arc`/`.circle`) is live on mainnet but unaffiliated, and at least six other ".arc" sites compete for the namespace. ENS and Basenames can carry an Arc address via ENSIP-11 coinType, with a default-EVM fallback [VERIFIED; REPORTED for the other sites].
7. **Approving from Telegram must not be the signature.** Telegram is E2E only in secret chats. Allow one-tap *deny/pause* from any channel, and require the in-app passkey for anything that moves money [VERIFIED FAQ; INFERENCE].
8. The essay maps directly: change control on contact addresses (cooldown, versioning, "last paid" comparison), idempotent intents, witness-before-paid, loud reconciliation, and beancount export with balance assertions.

## Top gaps

- Nobody has run a funded redemption of the delegation caveats on Arc.
- It is unknown whether Circle UCW or modular wallets can host those caveats.
- Gelato's Arc status and Blockaid's Arc coverage are unknown.
- WebAuthn inside Telegram Mini Apps is untested.
- I found no Arc payment-request standard or global email-to-address directory.
