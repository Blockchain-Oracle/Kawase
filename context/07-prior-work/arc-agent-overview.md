# Arc Copilot (`arc-agent`): overview

Purpose: what Abu's prior Arc project is, how it is built, and what was actually proven on Arc Testnet, so a Tameion entry can reuse it without over-claiming.

Sources: `/Users/abu/dev/hackathon/arc-agent/{CLAUDE.md,AGENTS.md,README.md,SPEC.md,package.json}`, `docs/decisions/*`, `docs/raw/*`, `docs/verification/*`, `docs/handoffs/2026-08-09-authenticated-experience-authorized.md`, `docs/state.json`, `git log`/`git status` run 2026-09-29.
Verified: 2026-09-29

---

## What it is

**Arc Copilot** is a conversation-first AI agent for personal money on Arc. `arc-agent` is the repo slug. It was built for the **Arc "Programmable Money" hackathon**: event window Jul 13 to Aug 22 2026, submission 2026-08-09, Demo Day 2026-08-20 (`docs/wiki/hackathon-brief-and-track-context.md:1-30`, `docs/brief.md` "Constraints discovered").

- There is one durable chat. Text, native voice (OpenAI Realtime), direct UI and background worker triggers all feed one `ConversationEngine` and then one `OperationEngine` (`docs/decisions/2026-08-05-unified-conversation-operation-a05.md`).
- The capability catalogue has **94 actions in 16 families (A–P)**: identity/wallets, contacts, payments, policies, recurring mandates, conditional automation, oracles, swaps/DeFi, crosschain/Unified Balance, treasury, marketplace/x402, agent identity/jobs/escrow (ERC-8004/8183), contracts, notifications, voice, and generative UI/evidence (`docs/wiki/semantic-action-ledger.md:21-195`). The ledger generates `packages/domain/src/generated/action-definitions.ts`, and CI fails on drift.
- Most of the catalogue is **not** executable. Executable write paths are C01 (pay), H02 (swap), E02/E03 (recurring mandate occurrences and lifecycle), I02 (CCTP bridge), I04 (Gateway deposit) and I05 (Gateway spend). I03 is a recovery controller. The rest are reads, or deferred with honest "unavailable" profiles (`AGENTS.md:115-194`).
- The product sells personal/consumer money control. It has no business, invoice, vendor or AP/AR concepts, so Tameion work would reframe it rather than port it.

## Architecture (layering is lint-enforced)

```
packages/domain        pure, zero deps: money, policy, authority, operation/plan state machines
   ↑
packages/application   use cases + ports: ConversationEngine, OperationEngine, gates, worker runners
   ↑
packages/integrations  adapters: PostgreSQL repos, viem/Arc, Circle App Kit (Swap/Bridge/Gateway), Biconomy, OpenAI
   ↑
packages/ui            renderer registry + theme (domain types only)
apps/web               Next.js authenticated product (Route Handlers own all secrets/SDKs)
apps/worker            separate Node process: occurrences, reconciliation, outbox; separate monitor process
apps/landing, apps/docs (Fumadocs)
```

- Dependency rule: `domain → nothing`, `application → domain`, `integrations → application, domain`, `apps → everything`. It is enforced by `eslint-plugin-boundaries` 7.1.0 (`docs/decisions/2026-08-03-productization-architecture-a03.md` "Package layout").
- Core safety law: **the model proposes, and deterministic code validates and executes.** Model-facing tools are limited to `read`, `clarify`, `draft` and `status`. None of them can call a financial adapter (`CLAUDE.md:46-58`).
- Money is integer `bigint` base units end to end. Arc native USDC (18 decimals) and the ERC-20 view at `0x3600…` (6 decimals) are "one asset, two interfaces" (`CLAUDE.md:25-31`).
- SQL migrations are the schema authority, with RLS and owner-scoped transactions. Every external effect carries an owner-scoped idempotency key (`CLAUDE.md:62-67`).
- Custody (A-04): each owner gets a **root EOA derived by HKDF from a server secret plus the owner id, never stored**. A per-owner Biconomy Nexus address is computed from the live factory `0x0000006648ED…f837`, but spending currently comes from the derived EOA because no bundler path is built. The passkey handles login only (`CLAUDE.md:69-89`, `packages/integrations/src/owner-accounts.ts:1-127`).
- **Circle Wallets (programmable, dev-controlled or Agent Wallets) were considered and explicitly rejected** (`CLAUDE.md:76-80`). For Tameion's 20% "Circle tool usage" score this is a gap to fill, not an asset.

## Stack and pinned versions (`package.json` files, `docs/decisions/2026-07-30-architecture-a01.md`)

| Layer | Choice |
|---|---|
| Runtime | Node 24 LTS (`>=24 <27`), pnpm 10.33.0, TypeScript 5.9.3 |
| Web | Next.js 16.2.9 App Router, React 19.2.4, Tailwind 4.3.3, AI SDK `ai` ^6.0.246 + `@ai-sdk/react` ^3.0.248, Phosphor icons |
| DB | PostgreSQL 16 (evidence 16.14), raw `pg` 8.22.0, 12 SQL migrations in `database/migrations/` |
| Chain | `viem` 2.55.10, custom Arc chain (id 5042002) with fallback RPC |
| Circle | `@circle-fin/app-kit` 1.11.0 (bundles Bridge Kit 1.12.2 and Unified Balance Kit 1.3.1), `@circle-fin/adapter-viem-v2` 1.14.1 |
| Smart accounts | `@biconomy/abstractjs` 1.2.5, pinned **MEE 2.1.0 / Nexus 1.2.0** because 2.2.1 regressed |
| AI | OpenAI Responses planner `gpt-5.1-2025-11-13` (strict json_schema), Realtime `gpt-realtime-2.1` + `gpt-4o-mini-transcribe` (`packages/integrations/src/public-config.ts:100-119`) |
| Auth | `@simplewebauthn/server` 13.3.2 / browser 13.3.0 (passkeys) |
| Scheduling | `croner` 10.0.1, used only as a next-run calculator. PostgreSQL is the queue |
| Gate | `pnpm check`: generated-registry drift, typecheck, build, test, lint, secret scan, **300-line file cap** |

## State: what was proven live vs. what is only local

**Proven on Arc Testnet (real transactions, dated):**

| Date | What | Evidence |
|---|---|---|
| 2026-07-29 | Biconomy Nexus smart session: grant, allowed zero-value use, recipient/over-cap **denied in simulation** (`PolicyViolation`), expiry, onchain revoke, owner sovereignty | `docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:74-192` |
| 2026-07-30 | App Kit **keyless** swap quote, 0.01 USDC→EURC (no Kit Key needed) | `docs/raw/2026-07-30-app-kit-keyless-quote.md` |
| 2026-07-31 | **Circle Gateway** Base Sepolia→Arc: 1.00 USDC minted to Nexus, 0.01 fee | `docs/raw/2026-07-30-phase-2-disposable-accounts.md:52-73` |
| 2026-07-31 | Session-scoped payment (0.10 USDC), mandate occurrence (0.30), **protected-floor block**, pause, onchain revoke | `docs/raw/2026-07-31-phase-2-wallet-and-mandate-trial.md:1-82` |
| 2026-07-31 | App Kit swap 0.01 USDC→0.007894 EURC | `docs/raw/2026-07-31-phase-2-app-kit-swap-trial.md` |
| 2026-08-04 | Swap 1 USDC→0.80572 EURC exactly as quoted. The same day it was wired as the H02 adapter | `docs/raw/2026-08-04-first-arc-swap.md:1-83` |
| 2026-08-04 | Live reads of Pyth, Stork, ERC-8004 registries and the ERC-8183 job contract (>167k jobs) | `docs/raw/2026-08-04-first-arc-swap.md:87-181` |
| 2026-07-30 / 08-04 | OpenAI Realtime browser voice with real mic and barge-in. `agent:verify` 17 ACs live | `docs/raw/2026-07-30-browser-webrtc-voice-trial.md`, `docs/verification/2026-08-04-agent-path-real.md` |

**Implemented locally, but never proven with funded live writes:**
- Phase 8 Wave 3: CCTP bridge (I02), Gateway deposit (I04), Gateway spend (I05), trustless removal (I03). The handoff says: "No funded I02/I04/I05 or live I03 proof has been claimed" (`AGENTS.md:181-182`).
- Wave 2: F04 is unavailable, so a matched monitor or trigger **cannot move money** (`AGENTS.md:148-149`).
- There is no unattended crosschain authority and no Gateway delegation.

**Never done:** hosting/deployment, public users, mainnet. WebAuthn binds to `AUTH_RP_ID`, so passkeys created on localhost will not work on a deployed domain (`docs/brief.md:88`).

**Repository state on 2026-09-29:**
- Local branch `codex/arc-agent-visual-direction`, HEAD `ab9c976` (2026-08-09), 167 commits.
- **207 uncommitted paths**, last modified 2026-08-11.
- `origin` (github.com/Blockchain-Oracle/arc-agent) is **behind**: the remote branch head is `9eb4893` from 2026-08-05.
- `docs/state.json` stage is `build`, with A-07 editable write tools in progress.
- A separate dirty Phase 9 worktree exists at `/Users/abu/.codex/worktrees/b467/arc-agent`.
- Delta-rule consequences are in `README.md` of this folder.

## Key decisions (one line each)

- **A-01** (2026-07-30) sets the local spine: Node 24, pnpm workspace, Next 16, PostgreSQL 16 with RLS/idempotency, viem, a separate worker with an SQL outbox, and bigint money (`docs/decisions/2026-07-30-architecture-a01.md`).
- **A-02** (2026-07-30) sets the hackathon integration scope: OpenAI Realtime for English voice, the Biconomy provider-path wallet gate (Foundry fallback, never activated), and a capped 5 USDC testnet envelope. Phase 2 passed 2026-07-31 (`2026-07-30-mvp-integration-a02.md`).
- **A-03** (2026-08-03) productizes: it adds `packages/application`, enforces lint layering, and adopts raw `pg` with owner-scoped transactions, passkey auth, and deletion of spike code rather than compromising around it (`2026-08-03-productization-architecture-a03.md`).
- **A-04** (2026-08-04) gives each owner an execution account: an HKDF-derived root key (never stored) plus a Nexus address from the live factory. RIP-7212 is absent on Arc, so a passkey cannot sign (`2026-08-04-per-owner-accounts-a04.md`).
- **A-05** (2026-08-05) makes conversation and operations unified: every input reaches one durable OperationEngine, a closed control registry, and typed ActionSurfaces. Only an authenticated UI event may create or expand authority (`2026-08-05-unified-conversation-operation-a05.md`).
- **A-06** (2026-08-09) defines the authenticated experience: one light-only chat workspace with a top bar, durable History, and Automations as the only management page (`2026-08-09-authenticated-experience-a06.md`).
- **A-07** (2026-08-09) adds editable write tools: a recognized write renders its real editable component immediately, with known values prefilled and unknown ones blank. Draft tools can never authorize (`2026-08-09-editable-write-tools-a07.md`).
- (A-08, 2026-08-09, is typed read-tool results plus a premium component system. It was accepted but little of it is built: `2026-08-09-typed-tool-results-a08.md`.)
