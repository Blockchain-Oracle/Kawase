# Arc Copilot: knowledge index (where Abu already researched something)

Purpose: a topic → file pointer index into `arc-agent/docs/`. Before a Tameion agent researches Arc or Circle from scratch, it should check here. **All of these files are dated 2026-07-28 to 2026-08-11, so treat them as a starting point, not as current truth.** Re-verify addresses, SDK versions, fees and support tables before relying on them.

Sources: `arc-agent/docs/{wiki,research,raw,decisions,plans,verification,design,specs,stories}/`, `docs/research/README.md`, `docs/wiki/index.md`, `docs/raw/source-registry.md`.
Verified: 2026-09-29. The file list was read 2026-09-29; content dates are in the file names or in "Checked:" headers.

Conventions:
- Paths are relative to `arc-agent/docs/`.
- Doc types:
  - **wiki** is distilled, cross-linked facts. Start here.
  - **research** is a dated brief with sources, facts, inferences and unknowns.
  - **raw** is primary evidence: live checks, tx hashes, snapshots.
  - **verification** is a pass/fail audit of a build slice.
- Each research brief has a fixed shape (Scope / Sources / Verified facts / Inferences / Unknowns / Excluded), per `research/README.md:5-14`.

---

## By topic

### Arc chain basics (native USDC, decimals, fees, addresses, EVM differences)
- `wiki/arc-network-and-native-primitives.md` (checked 2026-07-28): 18-vs-6 decimals, Memo, Multicall3From, EURC, USYC, fees.
- `research/2026-07-28-arc-core-and-agentic-surface.md`: network behaviour, AA, data providers, oracles, ERC-8004/8183.
- `raw/official-documentation-indexes.md` and `raw/source-registry.md` (updated 2026-07-31): canonical doc URLs.
  - These use `docs.arc.io` and `rpc.testnet.arc.network`. The Tameion brief links `docs.arc.network`, so **check which domain is current.**
- Live-probed contract addresses: `../packages/integrations/src/public-config.ts` (dated inline comments).

### Circle wallets, Agent Stack, CLI, faucet, gas
- `wiki/circle-wallets-and-agent-stack.md` (2026-07-29): dev-controlled, user-controlled and modular wallets. Agent Wallet policy is **mainnet-only**. Faucet and Gas Station limits.
- `research/2026-07-28-wallet-authority-gas-and-funding.md`: custody and signing candidates, sponsorship, faucet API.
- `raw/circle-cli-command-inventory-2026-07-28.md`: Circle CLI commands (`@circle-fin/cli@0.0.6` era).
- `raw/2026-07-30-wallet-authority-source-corpus.md` and `raw/2026-07-30-circlefin-source-corpus.md`: pinned upstream source reads.
- `raw/official-github-inventory-2026-07-28.md`: circlefin repos, including the sample apps the Tameion brief names.

### App Kit (Send / Swap / Bridge / Unified Balance), CCTP, Gateway, Nanopayments
- `wiki/app-kit-cctp-and-gateway.md`: its 2026-08-08 update block supersedes its 2026-07-30 table.
- `research/2026-08-08-phase8-wave3-crosschain-runtime.md`: the two-rail model, quote binding, partial-effect recovery, and the Unified Balance Kit 1.3.1 deposit internals. **Best single doc for crosschain treasury.**
- `raw/2026-07-30-app-kit-keyless-quote.md`: keyless swap estimate.
- `raw/2026-07-31-phase-2-app-kit-swap-trial.md` and `raw/2026-08-04-first-arc-swap.md`: live swaps with tx hashes.
- `raw/2026-07-30-phase-2-disposable-accounts.md`: live Gateway Base Sepolia→Arc mint.
- `raw/proof-feasibility-live-checks-2026-07-29.md`: App Kit / Earn Kit / Gateway / CCTP / CRE read-only checks.
- `research/2026-07-28-circle-platform-action-surface.md`: the whole Circle product surface.

### Smart accounts, session keys, onchain spending policy (RFB 4 "PolicyWallet")
- `raw/arc-wallet-policy-live-checks-2026-07-29.md`: **the key evidence file.** Biconomy Smart Sessions grant, use, deny, expire and revoke on Arc. ZeroDev bytecode presence. Circle CLI policy gate.
- `research/2026-07-29-arc-wallet-policy-runtime.md`: the distilled brief.
- `wiki/account-abstraction-and-policy-surface.md` and `wiki/onchain-automation-and-policy-enforcement.md`.
- `raw/2026-07-31-phase-2-wallet-and-mandate-trial.md`: funded session payment, mandate, floor block, revoke.
- `decisions/2026-08-04-per-owner-accounts-a04.md`: Nexus factory, RIP-7212 absent, derived keys.

### Policies, limits and controls (catalogue-wide)
- `wiki/policy-applicability-matrix.md`: which control (cap, budget, allowlist, floor, expiry, pause) applies to which action.
- `research/2026-07-28-automation-and-policy-enforcement.md` and `research/2026-07-28-automation-execution-classification.md`: onchain vs hybrid vs offchain enforcement, and scheduler options.
- `research/2026-08-07-phase8-wave1-management-controls.md`: contacts versioning, authority revocation, protected floor, quiet hours.

### Scheduling, workers, triggers, monitors
- `research/2026-08-05-phase6-worker-runtime.md`: why PostgreSQL is the queue, Graphile rejected, Croner as a calculator only, and the safety rules.
- `research/2026-08-08-phase8-wave2-occurrence-trigger-runtime.md` and `research/2026-08-08-phase8-wave2-closure.md`: occurrences, trigger sources, least-privilege monitor.
- `wiki/onchain-automation-and-policy-enforcement.md`: Chainlink CRE on Arc (Early Access). Gelato and legacy Automation omit Arc.

### Oracles, compliance vendors, indexers
- `wiki/oracles-and-external-signals.md`: Pyth, Stork, and Arc's compliance-vendor and indexer listings. **No screening vendor was tested.**
- `raw/2026-08-04-first-arc-swap.md:87-122`: Pyth and Stork proxy reads, Stork 3600 s staleness.
- `wiki/circle-contracts-and-marketplace.md:35-43`: CPN, Mint, StableFX, xReserve, and the Wallet Compliance Engine (gated).

### Agent identity, reputation, escrow jobs (RFB 3)
- `wiki/agentic-economy-and-escrow.md`: ERC-8004 and ERC-8183.
- `raw/2026-08-04-first-arc-swap.md:124-181`: the ERC-8183 ABI recovered from bytecode, and real decoded jobs.
- `verification/2026-08-05-registry-reads-real.md`: registry reads verified.

### Marketplace, x402, paid services (RFB 4 "buys API credits")
- `wiki/circle-contracts-and-marketplace.md:21-31`: the Agent Marketplace, x402 discovery endpoint, Nanopayments.
- `raw/marketplace-snapshot-2026-07-28.md`: 636 items and 20 providers from `api.circle.com/v2/x402/discovery/resources`.

### Yield, vaults, DeFi (RFB 1 "earn on reserve")
- `wiki/swaps-liquidity-vaults-and-lending.md`: XyloNet pools and vault. The USDC/USYC pool was **empty** at check. Earn Kit 1.4.0 is pre-GA.
- `wiki/ecosystem-protocol-status.md` and `research/2026-07-28-arc-protocol-action-surface.md`.
- USYC is noted as eligibility-gated (`wiki/arc-network-and-native-primitives.md:23`). **Nothing yield-related was executed.**

### Contacts, memory, preferences (vendor directory analogue)
- `wiki/memory-contacts-and-preferences.md`.
- `research/2026-07-28-interaction-memory-and-generative-ui.md`.

### Voice and conversational UX
- `wiki/voice-and-multilingual-interaction.md` and `research/2026-07-28-multilingual-realtime-voice.md`.
- `research/2026-07-30-voice-confirmation-semantics.md`: one plan, one confirmation.
- `raw/2026-07-30-openai-realtime-voice-trial.md` and `raw/2026-07-30-browser-webrtc-voice-trial.md`.

### Generative UI, receipts, evidence, audit trail (RFB 5)
- `wiki/generative-ui-timelines-and-receipts.md` and `wiki/evidence-and-availability.md`: the honesty and availability model.
- `research/2026-08-05-generative-ui-voice-and-product-structure.md` (358 lines): AI SDK, assistant-ui, CopilotKit, ChatKit compared.
- `research/2026-08-06-phase7-projections-and-capability-truth.md` and `research/2026-08-09-authenticated-experience-reference-matrix.md`.

### Product definition and catalogue
- `wiki/semantic-action-ledger.md`: 94 actions, A–P, with authority letters.
- `wiki/capability-universe.md` and `wiki/capability-to-tool-matrix.md`: which tool backs which capability, and its evidence class.
- `specs/2026-07-28-arc-agent-product.md`, `stories/2026-07-28-arc-agent-product.md`, `quality/2026-07-28-project-quality-profile.md`.
- `design/2026-07-29-product-surface-{map,states,data}.md` and `design/2026-07-29-design-doc.md` ("Counterfoil" visual system).
  - The root `../DESIGN.md` has the design laws.
  - The living sample is `../fable-lab/counterfoil/`.

### Prior hackathon (Arc Programmable Money, Jul–Aug 2026)
- `wiki/hackathon-brief-and-track-context.md`: judging emphasised a working prototype on Arc, Circle tools, a real use case and quality of execution.
- `raw/conversation-source-map.md`: participant-page text.

---

## Decision, plan and verification trail (chronological)

| Date | Decision | Plan | Verification / handoff |
|---|---|---|---|
| 07-28/29 | context reconciliation, connected proof journey, Counterfoil, voice scope | `plans/2026-07-29-crosschain-pay-and-mandate.md` | `verification/2026-07-28-product-definition.md`, `2026-07-29-*` |
| 07-30 | A-01 architecture, A-02 MVP integration, full plan accepted | — | `verification/2026-07-30-phase-0-architecture.md`, `phase-1-foundation.md` |
| 07-31 | — | — | `verification/2026-07-31-phase-2-capped-testnet-trials.md`, which is **the only record of real onchain movement** (`../AGENTS.md:82-83`) |
| 08-03 | A-03 productization, S00 auth, plan-flow vocabulary | — | `verification/2026-08-03-persistence-slice.md` |
| 08-04 | A-04 per-owner accounts | — | `verification/2026-08-04-agent-path-real.md`, `2026-08-04-s00-passkey-auth.md` |
| 08-05 | A-05 unified conversation/operation, legacy disposition | `plans/2026-08-05-phase6-background-automation.md` | `verification/2026-08-05-*` (realtime voice, background automation, registry reads) |
| 08-06/07 | — | `plans/2026-08-06-phase7-*`, `2026-08-07-phase8-wave1-*` | `verification/2026-08-06-phase7-*`, `2026-08-08-phase8-wave1-*` |
| 08-08/09 | — | `plans/2026-08-08-phase8-wave2-*`, `2026-08-08-phase8-wave3-crosschain.md` | `verification/2026-08-08-phase8-wave2-*`, `2026-08-0{8,9}-phase8-wave3-slice{1..7}.md` |
| 08-09 | A-06 authenticated experience, A-07 editable write tools, A-08 typed tool results | `plans/2026-08-09-authenticated-experience.md` | `handoffs/2026-08-09-authenticated-experience-authorized.md` (current) |

Other trails:
- The running change history is `wiki/log.md` (687 lines).
- Independent "Fable" audit prompts are in `raw/2026-07-3*-fable-*.md`. They show Abu's audit-by-second-model workflow.

## Staleness warnings

- Pyth Core had an upgrade scheduled for **2026-08-18** (`brief.md` "Constraints"). Re-check the Pyth address and feeds.
- App Kit was 1.11.0 and Bridge Kit 1.12.2 at the time. Newer versions may fix the transport or `validateToken` bugs, or change APIs.
- Circle's support tables (CCTP Fast on Arc, Paymaster on Arc, Agent Wallet testnet policies) were in flux and self-contradictory in July 2026.
- Faucet amounts and funding flows are explicitly temporal.
