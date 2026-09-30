# Stage 8: Automations + delegated authority

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- `apps/executor` DBOS workflows: tick, run-occurrence, grant-lifecycle.
- `draft_automation` with clarifications (day, time zone, asset), the read-back + dry run + next 3 runs + max exposure, the **delegation grant signed by the vault** (caveats built by code, receipt decoded from the caveats).
- Scheduled, price-triggered (on the executable quote) and event-triggered (salary received, balance below X) automations; DCA, round-ups, yield sweep, payroll templates (R).
- Lifecycle: pause, resume, edit (narrowing is immediate; widening needs a new grant), skip next, cancel (`disableDelegation`), a 24 h reminder, "skipped because…", underfunded state, missed-run policy.
- Practice mode + the go-live gate. The "Needs you" queue with expiry + re-quote at execution.
- The attended fallback when the spike fails.
- **Exit:** "every Tuesday send $1 to Alex" runs unattended on testnet and mainnet within its caveat; over-cap and wrong-recipient attempts revert on chain; editing never double-pays; practice produces "would have" records.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
