# Tameion knowledge base — index

Purpose: master index of everything known about the Tameion Agents Hackathon, Arc, Circle, and the ecosystem. Each section has its own README with a "where to look for X" table.
Sources: section READMEs; raw scrapes in `../.firecrawl/`; clones in `../refs/`
Verified: 2026-09-29

## Sections

| # | Folder | What's inside | Start with |
|---|---|---|---|
| 00 | `00-hackathon/` | Brief, 5 RFBs in full, judging 30/30/20/20, submission, kickoff deck, schedule | `brief.md`, `rfbs.md` |
| 01 | `01-arc/` | Arc L1: architecture, network config (verified addresses), gas, contracts, App Kit, Memo/Multicall, AA, agentic (ERC-8004/8183), FX & yield, tutorials, gotchas | `README.md`, `network-config.md`, `gotchas.md` |
| 02 | `02-circle-agent-stack/` | Agent Stack: Circle CLI v1.1.4 reference, agent wallets, guardrails, x402, Nanopayments, marketplace, MCP/skills, identity, quickstarts, RFB mapping | `quickstarts.md`, `rfb-mapping.md` |
| 03 | `03-circle-platform/` | Wallets, Gas Station/Paymaster, CCTP, Gateway, USYC, Contracts, USDC/EURC, Compliance, other APIs; product→RFB table | `README.md` |
| 04 | `04-sample-apps/` | 17 circlefin repo cards (cloned in `refs/circlefin/`), best start per RFB, reusable snippets with file:line | `README.md` |
| 05 | `05-canteen-ecosystem/` | ARC CLI (arc-canteen), aomi, TestMint, Canteen + **Agora/Lepton winners**, research index, people, schedule, 10 video transcripts | `canteen-and-prior-events.md` |
| 06 | `06-ledgers-and-prior-art/` | *Agents and Ledgers 2026* digest, design principles for agent writes, 8 prior-art hacks → build angles, 20 OSS cards (beancount, firefly, yente…) | `design-principles-for-agent-writes.md` |
| 07 | `07-prior-work/` | Abu's arc-agent (Arc Copilot): overview and lessons only (**not a template**, see D7); canton-season3 transfer notes | `arc-agent-lessons.md` |
| 08 | `08-product-research/` | **Abu's product**: Arc AI agent app. Research on ecosystem, DeFi, wallets, competitors, voice, platforms, automations, reference projects; synthesis, feature inventory, user flows, Codex review prompt | `08-product-research/README.md` |

## Cross-cutting facts (the ones that change decisions)

1. **Deadline Oct 10, 11:59 PM ET.** Repo + <3 min video required, live link encouraged, no demo day. Canton S3 is due ~28h earlier (Oct 9 23:59 UTC). → `00-hackathon/brief.md`
2. **Arc mainnet is live (since 2026-09-16, chainId 5042)**; testnet is 5042002. Mainnet USDC counts more for traction. Older research saying "testnet only" is stale. → `01-arc/network-config.md`
3. **USDC = one balance, two decimal views**: 18 decimals native (gas) vs 6 decimals via the ERC-20 at `0x3600…0000`. Never mix them raw. → `01-arc/gotchas.md`
4. **`maxFeePerGas` < 20 gwei is silently dropped.** To detect incoming native USDC, watch the system emitter `0xffff…FfFE`. → `01-arc/gas-and-fees.md`
5. **Circle Agent Wallet spending limits/allowlists are mainnet-only and need a human OTP.** On testnet, enforce budgets in your own contract, which RFB 4 explicitly rewards. → `02-circle-agent-stack/guardrails-and-policies.md`
6. **Paymaster no longer lists Arc; use Gas Station.** Dev-controlled wallets have no policy engine. → `03-circle-platform/paymaster.md`
7. **USYC needs a Support-ticket allowlist (24–48h), is for non-US persons only, and has a testnet Teller on Arc.** Compliance Engine access is gated, so RFB 5 likely needs yente/nomenklatura. → `03-circle-platform/usyc.md`, `compliance.md`
8. **Organizer-named sample apps are weak.** arc-fintech imports a private package, arc-escrow has an unfixed arbiter-drain flaw, and arc-x402-circle-wallets is a README stub. No sample runs a real LLM agent moving money. → `04-sample-apps/README.md`
9. **Two x402 rails**: Gateway Nanopayments (gasless, `@circle-fin/x402-batching`) vs the Facilitator (onchain per payment; keyless trial). The marketplace has 0 testnet listings, so run your own seller. → `02-circle-agent-stack/x402.md`
10. **What won before (same judges' rubric):** Lepton #1 *Keryx* (Tang Minh Vu, a Tameion fireside speaker) built a costed buy/skip/cache decision per source, explained it, and ran under an immutable spend cap. It was the organizers' own prior-art idea, nearly verbatim. Winners were mostly solo builders who took a Canteen research post seriously. → `05-canteen-ecosystem/canteen-and-prior-events.md`
11. **Ledger lesson:** a tx hash witnesses *that* you paid, not *whom you should have*. Wrong-payee and double-pay-on-retry are the killer errors. Use a UUIDv4 idempotency key per payment intent, persisted before the first call. → `06-ledgers-and-prior-art/design-principles-for-agent-writes.md`
12. **Delta rule:** existing projects are allowed, but only progress made Sep 27–Oct 10 is judged. Reference projects are not templates (D7); disclose arc-agent as prior work if anything relates to it. → `08-product-research/08-arc-agent-baseline-and-fit/hackathon-fit.md`

## Where to look for…

| Question | File |
|---|---|
| Chain IDs, RPCs, explorers, faucets, contract addresses | `01-arc/network-config.md` |
| Send/bridge/swap/unified balance in code | `01-arc/app-kit.md`, `04-sample-apps/README.md` (snippets) |
| Give an agent a wallet in 2 commands | `02-circle-agent-stack/quickstarts.md`, `circle-cli.md` |
| Agent pays for an API | `02-circle-agent-stack/x402.md`, `nanopayments.md` |
| On-chain budgets / approval thresholds | `02-circle-agent-stack/guardrails-and-policies.md`, `03-circle-platform/contracts.md`, `01-arc/account-abstraction-relayers-paymasters.md` |
| Idle cash → yield | `03-circle-platform/usyc.md`, `01-arc/stablecoins-fx-and-yield.md` |
| Crosschain / unified balance | `03-circle-platform/cctp.md`, `gateway.md` |
| USDC↔EURC | `01-arc/stablecoins-fx-and-yield.md`, `04-sample-apps/arc-stablecoin-fx.md` |
| Address / sanctions screening | `03-circle-platform/compliance.md`, `06-ledgers-and-prior-art/oss/yente.md` |
| Invoice parsing, ledgers, metering OSS | `06-ledgers-and-prior-art/oss/` |
| Idea generation | `00-hackathon/rfbs.md`, `06-ledgers-and-prior-art/prior-art-ideas.md`, `05-canteen-ecosystem/canteen-research-index.md` |
| Lessons from Abu's earlier builds (not templates) | `08-product-research/08-arc-agent-baseline-and-fit/what-was-learned.md` |
| Funding testnet wallets | `02-circle-agent-stack/circle-cli.md` (`circle wallet fund`), `05-canteen-ecosystem/testmint.md` |

## Known gaps (not yet covered)

- The Tameion kickoff, Arc 101, fireside, and aomi-session recordings are not public. The Canteen and Arc Discords can't be read without login. If Abu shares recordings or exports, add them to `05-canteen-ecosystem/transcripts/`.
- Context7's monthly quota ran out mid-research. A few OSS API details (Invoice Ninja, Kill Bill, Snipe-IT, Lago) are from memory, and each affected card says so.
- The docs give no mainnet addresses for ERC-8004/ERC-8183, and no mainnet Gateway API host.
