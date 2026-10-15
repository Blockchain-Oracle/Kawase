> **Superseded (2026-09-29, `08-product-research/DECISIONS-FROM-ABU.md` D7):** Abu says arc-agent failed and used the wrong architecture. Nothing here is a recommendation to reuse its code or design. Treat this file as a record of lessons only.

# Arc Copilot: reusable code map

Purpose: the concrete modules in `arc-agent` worth lifting into a Tameion entry. For each one: path, what it does, what it would give Tameion, which RFB it serves, and how much editing it needs.

Sources: source files under `arc-agent/packages/*/src`, `apps/worker/src`, `database/migrations/`, `scripts/`, plus `AGENTS.md:196-243` ("Gotchas") and `docs/decisions/2026-08-05-a05-legacy-disposition.md`.
Verified: 2026-09-29. Paths and line numbers are from the local working tree (HEAD `ab9c976` plus uncommitted changes).

Legend:
- **Lift** means copy with little editing.
- **Adapt** means the logic is reusable but it is wired to arc-agent ports or the Operation model.
- **Pattern** means re-implement the idea.
- RFB numbers: 1 Treasury · 2 AP/AR · 3 Contractor & Vendor · 4 Autonomous Operator · 5 Compliance.

> Delta rule: anything copied counts as **pre-existing**. Import it in one clearly labelled commit (for example `chore: import from arc-agent@ab9c976`) so judges can separate it from Tameion work. See `README.md`.

Import caveats:
- Every package imports `@arc-agent/domain` and `@arc-agent/application`. Lifting a single adapter drags in ports (`packages/application/src/ports.ts`) and domain types. The cheapest route is to copy **all of `packages/domain`** (pure, zero deps, about 4.5k lines), then pick what you need from application and integrations.
- The `phase2-*` modules have trial constants welded in: no amount or limit parameters (`AGENTS.md:230-231`, `CLAUDE.md:39-41`). Reuse means rewriting them.

---

## 1. Money and constants (every RFB)

| Path | What | Tameion value | Effort |
|---|---|---|---|
| `packages/domain/src/money.ts:1-92` | `parseDecimalUnits`, `formatDecimalUnits`, `rescaleUnits` (returns exact/remainder), `rescaleUnitsUp` (never rounds a debit down), `sameLedgerAsset`, `AssetRef {chainId, decimals, interface, interfaceId, ledgerAssetId}` | Correct handling of 18-dec native vs 6-dec ERC-20 USDC. An invoice/payment ledger needs this from day one | **Lift** (zero deps) |
| `packages/integrations/src/public-config.ts:1-119` | `PUBLIC_NETWORKS` (Arc Testnet 5042002, primary + dRPC fallback RPC, WS, USDC `0x3600…`, EURC `0x89B5…D72a`; Base Sepolia USDC), `PUBLIC_ASSETS` (5 AssetRefs), `ARC_READ_TARGETS` (Pyth, Stork, ERC-8004 identity/reputation/validation, ERC-8183 jobs, Circle Address Book, Multicall3) | Verified address book. **Re-verify**: dated Jul–Aug 2026, and the Pyth Core upgrade was 2026-08-18 | **Lift**, then re-probe |
| `packages/integrations/src/limits.ts:24-139` | Protected floor, wallet-fee caps, CCTP/Gateway fee caps per fee line, quote freshness (60s), lease durations, slippage 300 bps | A template for "one constant, one home". Values are demo-sized | **Pattern** |
| `packages/integrations/src/arc.ts:1-74` | `arcTestnet` viem chain, `createArcPublicClient` with fallback transport, `ARC_NATIVE_USDC_EMITTER = 0xfff…fffe` (EIP-7708 system emitter), `readArcHealth` | Drop-in Arc client | **Lift** |

## 2. Wallet creation and custody (RFB 3 "wallet per contractor", RFB 4)

| Path | What | Tameion value | Effort |
|---|---|---|---|
| `packages/integrations/src/owner-accounts.ts:1-127` | `deriveOwnerSigner` (HKDF-SHA256 from a ≥32-char server secret plus owner id, domain-separated info strings, **never stored**), `computeOwnerAccount` (reads the Nexus factory `computeAccountAddress`), `deriveOwnerExecutor`, `ownerAccountExists` | Deterministic per-entity wallets without a key table: one per department, contractor or vendor. It holds keys server-side, so disclose that | **Lift** |
| `packages/integrations/src/owner-account-provider.ts`, `packages/application/src/account-provisioning.ts` | Provisioning an owner's execution account into the DB | Onboarding flow | **Adapt** |
| `packages/integrations/src/phase2-wallet.ts:24-145`, `phase2-session-policy.ts`, `phase2-session-runtime.ts`, `phase2-session-cli.ts` | Biconomy MEE 2.1.0 / Nexus 1.2.0 smart account plus **Smart Sessions** with Universal Action (target/selector/recipient), Usage Limit, Time Frame and Spending Limit policies, sponsored by Biconomy staging | This is the **only onchain-enforced agent spending policy proven on Arc** (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md`). It maps directly to the RFB 4 "PolicyWallet: budgets enforced in the contract rather than the prompt" | **Pattern/rewrite**: trial constants are welded in, and the CLI is at 299 lines |

> Circle Wallets are **not** used anywhere, and neither dev-controlled nor Agent Wallets have an adapter. For Circle-tool scoring, a Tameion build should add Circle dev-controlled wallets (the App Kit Circle Wallet adapter supports dev-controlled wallets, per `docs/wiki/app-kit-cctp-and-gateway.md:57-60`) or Agent Wallets through the Circle CLI. Use the arc-agent adapters for the rails.

## 3. Circle App Kit: send, swap, bridge, Gateway

| Path | What | Tameion value / RFB | Effort |
|---|---|---|---|
| `packages/integrations/src/circle-crosschain-viem.ts:1-41` | `makeCircleCrosschainViemAdapter(privateKey)` passes **our own** public and wallet clients (Arc dRPC-first fallback, Base Sepolia) into `createViemAdapterFromPrivateKey`. This fixes App Kit's broken default Arc transport | Needed for any App Kit call on Arc. All RFBs | **Lift** |
| `packages/integrations/src/circle-app-kit.ts:1-147` | `probeKeylessAppKitQuote` (keyless `estimateSwap` USDC→EURC, 45s timeout), `sanitizeAppKitError` (redacts Kit Key and addresses), `classifyAppKitQuoteError` (auth / rate_limit / route_unavailable / timeout / provider_error), `sanitizeAppKitFeeValue` | Safe provider error handling for logs and UI | **Lift** |
| `packages/integrations/src/adapters/arc-payment-adapter.ts:1-275` | **C01 payment**: ERC-20 `transfer` on `0x3600…` (keeps `value=0`), protected-floor recheck against a fresh 6-dec balance, fee in native→6-dec (`rescaleUnitsUp`), `read()` reconciles by receipt (`not_found` / `confirmed` / `reverted` / `unknown`) | The core payout primitive for vendor, contractor and invoice payments. RFB 2/3/4 | **Adapt** (implements the `ProofActionAdapter` port) |
| `packages/integrations/src/adapters/arc-swap-adapter.ts:1-246` | **H02 swap** via App Kit on Arc: USDC↔EURC, minimum-output bound (`arcSwapLimits`), floor check against the ERC-20 view, dRPC-first transport | Paying an EUR-invoicing vendor, FX leg of treasury. RFB 1/2 (brief: "paying a European vendor in the currency they invoice in") | **Adapt** |
| `packages/integrations/src/reads/swap-quote.ts:1-150` | Swap quote as a typed read with units conversion | Quote-before-commit UX | **Adapt** |
| `packages/integrations/src/adapters/cctp-bridge-adapter.ts`, `cctp-bridge-client.ts:18-172`, `cctp-iris.ts:1-80`, `cctp-operation-runtime.ts` | **I02 CCTP** Base Sepolia→Arc via App Kit `bridge`/`retryBridge`. Records allowance/burn/attestation/mint checkpoints. Iris attestation reader. Resumes without reburning | Crosschain contractor payouts, treasury rebalancing. RFB 1/3. **No funded live proof** | **Adapt** |
| `packages/integrations/src/adapters/gateway-deposit-adapter.ts`, `gateway-deposit-client.ts:1-121` | **I04 Gateway deposit**. `observeGatewayViemAdapter` instruments approval and deposit hashes separately (the SDK hides the approval hash). Completion is only an exact confirmed Gateway balance increase | Unified treasury balance. RFB 1 | **Adapt** |
| `packages/integrations/src/adapters/gateway-spend-adapter.ts`, `gateway-spend-client.ts:1-213`, `gateway-spend-adapter-support.ts`, `gateway-transfer-status.ts`, `gateway-removal-client.ts` | **I05 Gateway spend** with application-frozen source allocations, burn/transfer/mint checkpoints, mint-only retry after provider-confirmed status, and I03 trustless removal | Chain-abstracted payouts from one balance. RFB 1/3 | **Adapt** |
| `packages/integrations/src/crosschain-balance-reader.ts:1-250`, `crosschain-capability-read.ts` | Owner balances on Arc, Base and Gateway (confirmed vs pending kept separate) | "Multichain treasury dashboard with a unified balance view" (RFB 1 example) | **Adapt** |
| `packages/integrations/src/crosschain-quote-provider.ts`, `crosschain-quote-normalization.ts`, `packages/application/src/crosschain-route-comparison.ts:1-266`, `packages/domain/src/crosschain-fees.ts`, `crosschain.ts` | Immutable route quotes with **typed fee lines** and a canonical hash. Deterministic CCTP-vs-Gateway comparison | An agent choosing a rail with explainable criteria. RFB 1 | **Adapt** |

## 4. Proposal → validate → execute (agentic safety; every RFB, scores "agentic sophistication")

| Path | What | Effort |
|---|---|---|
| `packages/integrations/src/planner-contract.ts:1-182` | `INSTRUCTIONS`, `PROPOSAL_SCHEMA` (strict json_schema), `WRITE_FUNCTION_TOOLS`, and **`assertKnownAssets`**, a post-parse allowlist added because the model fabricated EURC's address by copying USDC's (`docs/verification/2026-08-04-agent-path-real.md:27`) | **Pattern** |
| `packages/integrations/src/openai-planner.ts:1-221` | OpenAI Responses planner with bounded retry | **Adapt** (swap in Claude if preferred) |
| `packages/domain/src/write-proposal.ts`, `write-proposal-guards.ts:88-125` | Typed write proposals; `parseWriteProposal` uses guards instead of casts | **Lift** |
| `packages/application/src/conversation-control-registry.ts`, `core-conversation-controls.ts`, `write-tool-registry.ts`, `write-draft-*.ts` | A closed, server-owned tool registry with authority class `read/clarify/draft/status`. The model cannot supply owner, operation or provider ids. Draft tools never authorize | **Pattern**. It is the core pitch line: "the agent can't talk past policy" |
| `packages/application/src/operation-engine.ts` (`OperationEngine` at :73), `financial-operation-gate.ts:1-244`, `financial-operation-executor.ts`, `dispatch-permit.ts`, `dispatch-block.ts` | Validate → fresh quote → policy → exact authority coverage → atomic reservation → execute → reconcile | **Adapt** (heavy, 250–300-line files) |
| `packages/domain/src/authority-scope.ts`, `authority-scope-record.ts`, `application/src/financial-authority-selection.ts`, `automation-authority.ts` | Typed authority scope over action, asset, chain, recipient, amount, period, and attended/unattended. `consentHash` is kept separate from `authorityId` | **Pattern** for an "approval limits" feature (RFB 4) |

## 5. Policy and mandate enforcement (RFB 4 PolicyWallet, RFB 5, RFB 2 "pays what clears policy")

| Path | What | Effort |
|---|---|---|
| `packages/domain/src/policy-producers.ts:1-161`, `policy.ts` | `PolicyFacts` (balance, budget, amount, floor, fee known/max, known counterparty, counterparty allowed, duplicate protection, lifecycle, quote freshness, risk). Producers **fail closed** on unknown facts instead of emitting blanket allows | **Lift**. It maps almost 1:1 onto AP "pay only if it clears policy" |
| `packages/application/src/protected-floor-policy.ts:1-82` | Versioned owner protected-floor policy (minimum cash balance) | **Lift**. Treasury "keep operating reserve" |
| `packages/application/src/mandate-lifecycle-controller.ts`, `mandate-edit-*.ts`, `packages/domain/src/automation.ts`, `lifecycle.ts` | Recurring mandate: active/paused/revoked, immutable edits, exhausted states | **Adapt**. Subscriptions and recurring vendor payments (RFB 2/3/4) |
| `packages/application/src/contact-resolution.ts:1-189`, `packages/domain/src/contact.ts`, `integrations/src/postgres/contact-repository.ts` | **Versioned contacts**: a name resolves to a trusted address, refuses ambiguity, and editing an address drops the binding | **Adapt**. A vendor/contractor directory where "is this the right vendor?" is checked |
| `packages/integrations/src/reads/address-book.ts:1-112` | Reads Circle's Address Book module allowlist standing | **Adapt**. RFB 5 allowlist evidence |

## 6. Worker and automation runtime (RFB 2 scheduled payments, RFB 4 autonomy, RFB 5 continuous monitoring)

| Path | What | Effort |
|---|---|---|
| `apps/worker/src/{main.ts,runtime.ts,cycle.ts,reconcile.ts}` | Polling worker with AbortSignal and SIGINT/SIGTERM graceful stop. Bounded cycles. `pnpm worker:once` | **Lift** the shell |
| `apps/worker/src/{monitor-main.ts,monitor-runtime.ts,monitor-cycle.ts}` | A separate least-privilege monitor process (DB role `app_monitor`, no signing key, no financial repos) | **Pattern**. A strong compliance/security story (RFB 5) |
| `packages/application/src/schedule-materializer.ts`, `occurrence-runner.ts` (`OccurrenceRunner` :32), `exact-occurrence-processor.ts`, `reconciliation-coordinator.ts` (:28) | Materialize due occurrences (`skip_to_next`, no catch-up spend) → lease-claim with `SKIP LOCKED` → one operation → reconcile ambiguous effects → outbox | **Adapt**. Safety rules are in `docs/research/2026-08-05-phase6-worker-runtime.md:103-141` |
| `packages/integrations/src/schedule-calculator.ts:32-101` | Croner as a paused IANA-timezone next-run calculator only, plus notification quiet-hours timing | **Lift** |
| `packages/application/src/trigger-evaluator.ts:15-255`, `trigger-monitor-*.ts`, `background-trigger-monitor.ts`, `packages/domain/src/trigger-monitor*.ts` | Notify-only monitors over 4 source kinds, with deterministic three-way evaluations persisted once | **Adapt**. "Alert when burn rate changes / counterparty risk changes" |
| `packages/integrations/src/arc-usdc-incoming-observer.ts:1-232` | Detects **incoming USDC** to an account via EIP-7708 native `Transfer` logs from `0xfff…fffe` | **Lift**. **AR payment detection** for matching receipts to invoices (RFB 2) |
| `packages/integrations/src/evm-log-range.ts:1-36` | `readBisectedEvmLogRange`: recursively bisects `getLogs` on RPC range-limit errors | **Lift** |
| `packages/integrations/src/arc-balance-observer.ts`, `pyth-price-observer.ts`, `arc-contract-event-observer.ts:1-214` (ERC-8183 `JobCompleted`) | Balance, price and contract-event trigger sources | **Adapt**. RFB 1 (price/balance), RFB 3 (job completion → release milestone) |
| `packages/application/src/notification-delivery.ts`, `integrations/src/postgres/outbox-repository.ts` | Deduplicated outbox with in-app delivery and retry | **Adapt** |

## 7. Onchain reads for vendors and agents (RFB 3, RFB 5)

`packages/integrations/src/reads/`:
- `agent-identity.ts`, `agent-reputation.ts` and `agent-validation.ts` read the ERC-8004 registries.
- `agent-jobs.ts` (`makeAgentJobRead`, `makeJobEconomicsRead`) reads ERC-8183 escrow jobs, which settle in USDC `0x3600…`.
- `oracle-price.ts` and `stork-price.ts` read price feeds.
- `deployment.ts` and `registries.ts` read deployment and registry data.
- `marketplace.ts` reads the Circle Marketplace.

RFB 3 fit: "builds a reputation score from what happened". ERC-8004 reputation plus ERC-8183 job history are live on Arc. Effort: **Adapt**.

## 8. Evidence, receipts and audit trail (RFB 5 "audit-ready reporting", Canteen "agents and ledgers")

| Path | What |
|---|---|
| `packages/application/src/operation-receipt.ts:1-218` | Receipt projection from canonical records |
| `packages/domain/src/reconciliation.ts`, `execution.ts`, `crosschain-checkpoint.ts`, `integrations/src/postgres/crosschain-checkpoint-evidence.ts` | Append-only sanitized evidence events per attempt, and a reconciliation state machine |
| `integrations/src/postgres/idempotency-repository.ts` | Owner-scoped request keys claimed **before** the provider call, which is the "retry didn't pay twice" guarantee |
| `packages/domain/src/capability-profile.ts`, `application/src/capability-profiles.ts` | Capability availability derived from what handlers can actually run (honesty) |

## 9. Database schema (`database/migrations/0001_baseline.sql` … `0012_monitor_expiry.sql`)

The baseline creates these tables (line numbers from `0001_baseline.sql`):

| Area | Tables |
|---|---|
| Identity and accounts | `owners` :25, `app_sessions`, `passkey_credentials`, `execution_accounts` :68 |
| Contacts | `contacts`, `contact_addresses` |
| Intents and plans | `intents`, `plans`, `plan_steps`, `plan_presentations`, `consents` |
| Conversation | `conversations`, `operations` :242, `conversation_runs`, `voice_sessions`, `action_surfaces`, `surface_events`, `conversation_events`, `control_calls`, `pending_user_requests` |
| Policy and authority | `policies` :457, `policy_evaluations`, `authorities`, `authority_usages` |
| Mandates and scheduling | `mandates` :554, `mandate_policies`, `occurrences`, `trigger_observations`, `owner_preferences` |
| Execution and delivery | `reservations`, `idempotency_keys` :703, `evidence_events`, `outbox_events`, `event_cursors`, `execution_attempts` :774, `reconciliation_records` |

- RLS is owner-scoped. Discovery uses narrow `SECURITY DEFINER` functions. Roles are `app_worker` and `app_monitor`.
- Tameion value: a ready-made ledger for operations, authority, evidence and reconciliation. It would need `invoices`, `vendors` and `budgets` tables added. **Adapt.**
- Scripts: `scripts/migrate.mjs` (status / migrate / baseline) and `scripts/verify-database.sh`.

## 10. Other lifts

- `packages/integrations/src/webauthn.ts` and `packages/application/src/auth-*.ts` provide passkey login with recovery (**Adapt**).
- `packages/integrations/src/openai-realtime.ts` and `apps/web/src/app/api/realtime/*` provide voice. This is low priority for Tameion.
- `scripts/check-lines.mjs` (300-line cap), `scripts/check-secrets.mjs` and `scripts/generate-action-registry.mjs` (a markdown ledger that generates TS, with a drift check) are all **Lift**.
- `scripts/verify-*.mjs` are live verification harnesses that assert their own check count. **Pattern** for a "proof" script judges can run.
- `apps/docs` is a Fumadocs site with pages on authority and limitations. **Pattern.**

## Fastest reuse per RFB (summary)

| RFB | Minimum lift set |
|---|---|
| 1 Treasury | money.ts, public-config, arc.ts, circle-crosschain-viem, crosschain-balance-reader, gateway deposit/spend adapters, route comparison, protected-floor-policy, pyth/balance observers, worker shell |
| 2 AP/AR | money.ts, arc-payment-adapter, arc-swap-adapter (EURC invoices), contact-resolution (vendor directory), policy-producers, idempotency repo, **arc-usdc-incoming-observer** (AR matching), schedule-calculator + occurrence runner |
| 3 Contractor & Vendor | owner-accounts (wallet per contractor), arc-payment-adapter, cctp-bridge (crosschain contractor), reads/agent-jobs + arc-contract-event-observer (ERC-8183 milestones), reads/agent-reputation (ERC-8004) |
| 4 Autonomous Operator | Biconomy Smart Session pattern (phase2-session-*), policy-producers, authority scope, OperationEngine gate, worker + occurrence runner, planner-contract allowlist |
| 5 Compliance | monitor process (least privilege), trigger-evaluator, address-book read, evidence/receipt/reconciliation, outbox alerts. **No screening provider was integrated**: the Circle Compliance Engine is gated and unknown on Arc (`docs/wiki/circle-contracts-and-marketplace.md:43`) |
