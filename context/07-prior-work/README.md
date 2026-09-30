> **Superseded (2026-09-29, `08-product-research/DECISIONS-FROM-ABU.md` D7):** Abu says arc-agent failed and used the wrong architecture. Nothing here is a recommendation to reuse its code or design. Treat this file as a record of lessons only.

# 07 · Prior work: index

Purpose: an entry point to Abu's own prior projects that bear on Tameion. It covers what exists, the fastest reuse path per RFB, and how to stay on the right side of the "delta" judging rule.

Sources: the files in this folder; `/Users/abu/dev/hackathon/arc-agent/` (read-only); `/Users/abu/dev/hackathon/canton-season3/` (read-only); `/Users/abu/dev/hackathon/tamion/.firecrawl/tameion.md:143,737-739`.
Verified: 2026-09-29

---

## Files

| File | Read it for |
|---|---|
| [arc-agent-overview.md](arc-agent-overview.md) | What Arc Copilot is, its layering, stack and versions, **what was proven live on Arc Testnet vs. only local**, decisions A-01 to A-07 |
| [arc-agent-reusable-code-map.md](arc-agent-reusable-code-map.md) | Module-by-module lift list with paths, effort (Lift/Adapt/Pattern) and RFB fit |
| [arc-agent-lessons.md](arc-agent-lessons.md) | 52 Arc/Circle gotchas and live-trial findings (App Kit transport bug, 18-vs-6 decimals, testnet-only policy limits, Gateway indexing delay, and more) |
| [arc-agent-knowledge-index.md](arc-agent-knowledge-index.md) | Topic → file pointers into arc-agent's wiki, research and raw evidence (dated Jul–Aug 2026) |
| [canton-season3-notes.md](canton-season3-notes.md) | The concurrent Canton build: **deadline clash (Oct 9 UTC vs Oct 10 ET)**, context-library conventions, Sotto lessons, agent-authority taxonomy |

## Headline facts

- **Arc Copilot** (`/Users/abu/dev/hackathon/arc-agent`, Jul 28 to Aug 11 2026) is a conversational Arc money agent.
  - Its 94-action catalogue is mostly **not** executable.
  - These wrote real value on Arc Testnet with tx evidence: payments (C01), App Kit USDC↔EURC swap (H02), recurring mandates with a protected floor, Biconomy smart-session limits, and a Gateway Base→Arc mint.
  - CCTP and Gateway product adapters exist but were **never funded or run live**.
  - It was never deployed and has no users.
  - It **does not use Circle Wallets**. That was a deliberate choice, and it is a gap for Tameion's 20% Circle-tools score.
- It is personal-finance shaped. There are no invoices, vendors, budgets or business entities. The reusable value is **the rails and safety spine**, not the product.
- The most valuable single asset is the **proposal→validate→execute pattern with fail-closed policy producers, idempotency and reconciliation**. It is a ready answer to Canteen's "Agents and Ledgers" question: right vendor, real invoice, never paid twice.

## Fastest reuse path per RFB

"Lift" paths are relative to `/Users/abu/dev/hackathon/arc-agent/packages/`. Full detail is in the code map.

| RFB | What arc-agent already gives you | What is missing (Tameion delta) | Circle tools to add for scoring |
|---|---|---|---|
| **1 Treasury** | `domain/src/money.ts`; `integrations/src/crosschain-balance-reader.ts` (Arc + Base + Gateway balances); Gateway deposit/spend adapters; `application/src/crosschain-route-comparison.ts`; `application/src/protected-floor-policy.ts`; Pyth/balance observers + worker | Cash forecasting and runway, operating-vs-reserve policy, yield leg (USYC is gated; XyloNet USDC/USYC pool was empty), multi-account business entity, and a first funded live Gateway spend | Gateway (unified balance), CCTP, App Kit Swap, Circle Wallets (treasury + department sub-wallets), USYC if accessible |
| **2 AP/AR** | `adapters/arc-payment-adapter.ts` (C01), `adapters/arc-swap-adapter.ts` (pay EUR invoices in EURC), `application/src/contact-resolution.ts` (versioned vendor directory), `domain/src/policy-producers.ts`, idempotency repo, **`integrations/src/arc-usdc-incoming-observer.ts`** (detect receipts for AR matching), scheduler | Invoice ingestion and parsing (email/PDF), duplicate/fraud detection, 3-way match, vendor screening, collections follow-ups | Circle Wallets, App Kit Send/Swap, CCTP for foreign-chain vendors, Compliance Engine if accessible |
| **3 Contractor & Vendor** | `integrations/src/owner-accounts.ts` (deterministic wallet per contractor), payment adapter, CCTP adapter (never funded), `reads/agent-jobs.ts` + `arc-contract-event-observer.ts` (ERC-8183 escrow milestones), `reads/agent-reputation.ts` (ERC-8004) | Milestone verification (AI-validated deliverables; see `circlefin/arc-escrow`), reputation scoring, onboarding screening | Circle Wallets (one per contractor), CCTP, escrow contract |
| **4 Autonomous Operator** | Biconomy Smart Session pattern (`integrations/src/phase2-session-*.ts`, needs a rewrite), `application/src/operation-engine.ts` + `financial-operation-gate.ts`, authority scopes, `apps/worker` + occurrence runner, planner allowlist | Onchain per-category budgets and approval limits (PolicyWallet contract or productized sessions), revenue intake, 30-day due-vs-on-hand planning, x402/nanopayment purchase of API credits | Agent Wallets / Circle CLI, Nanopayments/x402 (`circlefin/arc-x402-circle-wallets`, `arc-nanopayments`). Note: **Circle Agent Wallet policies are mainnet-only** (`arc-agent-lessons.md` #30) |
| **5 Compliance** | Least-privilege monitor process (`apps/worker/src/monitor-*`), `application/src/trigger-evaluator.ts`, `reads/address-book.ts`, evidence/receipt/reconciliation records, outbox alerts | An actual screening data source, risk tiers, re-screen cadence, regulator-style reports. **No screening vendor was ever integrated** | Circle Compliance Engine (gated; access unknown), Arc-listed compliance vendors (`docs/wiki/oracles-and-external-signals.md:33`) |

Cheapest cross-RFB starter kit (about 1 day to import and wire):
- All of `packages/domain`.
- `integrations/src/{public-config,arc,circle-crosschain-viem,circle-app-kit,evm-log-range}.ts`.
- `adapters/arc-payment-adapter.ts`.
- `domain/src/policy-producers.ts`.
- The worker shell.
- **Re-probe every address first** (see the staleness notes in the knowledge index).

## Delta rule warning (read before importing anything)

The rule, from `tameion.md:737-739`:
- Existing projects are welcome, but judges score **the delta only**: "what you shipped and who you reached *during* Tameion".
- They will ask "where was the product and how many users did it have when Tameion began, and where are both at the end?"
- The delta applies to **product and traction equally**. The FAQ says: "work that already existed when you started doesn't [count]".

Arc Copilot's starting point on 2026-09-29 is messy:
- Local HEAD is `ab9c976` (2026-08-09) on `codex/arc-agent-visual-direction`.
- There are **207 uncommitted paths**, last modified 2026-08-11.
- `origin` (github.com/Blockchain-Oracle/arc-agent) is at `9eb4893` (2026-08-05).
- It has zero users and no deployment.
- A careless commit of that dirty tree now would carry a Sep 29+ date and would **look like Tameion work that isn't**. The reverse risk also exists: Tameion work mixed into the old repo is hard to separate.

Recommendations. These are for Abu to decide. This library does not modify arc-agent.

1. **Start a fresh Tameion repo.** Do not continue inside `arc-agent`. The product is different (business treasury, not personal), and a clean history makes the delta obvious.
2. **Record the baseline before writing any Tameion code.** Add a `docs/BASELINE.md` (or a README "Starting point" section) stating:
   - the source repo, commit `ab9c976`, and that its uncommitted work dates from before 2026-08-11;
   - what worked live then, linking `arc-agent-overview.md`'s proven-live table;
   - users/businesses = 0, value moved for businesses = 0, deployment = none.
3. **Import reused code in one labelled commit**, for example `chore(import): vendor modules from arc-agent@ab9c976 (pre-Tameion)`, listing the files. Tag the commit just before it `tameion-start` and the import commit `tameion-import`. Judges can then diff `tameion-import..HEAD` to see exactly what was built during the event.
4. **Optionally** preserve arc-agent's dirty tree as-is, or snapshot it into a *separate* branch with a message saying the content predates Sep 27. Never fold it into the Tameion repo's history.
5. **Traction baseline:** Tameion traction is judged 30%, and arc-agent has none, so every onboarded business is pure delta. Log each one with a date (a `TRACTION.md` or journal). Measure "value moved" from tx hashes, as arc-agent's evidence docs did.
6. In the video and README, include a "What existed before Sep 27 / what we built Sep 27 to Oct 10" slide or section. The Canton playbook's slide 9 is the model (`canton-season3-notes.md`).
