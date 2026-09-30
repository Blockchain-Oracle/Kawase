# Spike 6: DBOS exactly-once occurrence

Purpose: prove that a scheduled payment runs exactly once across a crash, a duplicate start, and a duplicate tick.
Code: `plan/spikes/code/06-dbos/spike.mjs` (run `PHASE=crash node spike.mjs` then `PHASE=recover node spike.mjs`; needs the dev Postgres on port 5433).
Date: 2026-09-29
**Result: PASS**

## What was tested
- The occurrence slot is claimed with `INSERT … ON CONFLICT DO NOTHING` under `UNIQUE(automation_id, scheduled_for)`. The tick is run twice.
- Workflow `runOccurrence`, with `workflowID = occurrence.id`: mark executing → **send payment** (a deliberately non-idempotent SQL insert) → **crash** (`process.exit`) → mark succeeded.
- On restart: `DBOS.launch()` recovers the pending workflow. The same workflow ID is also started a second time.

## Evidence (recover phase output)
`result: "paid"`, `duplicateResult: "paid"`, `paymentCalls: 1`, a single occurrence with status `succeeded`.

## Findings (these change the plan)
1. **The DBOS SDK is now 5.2.11**, not the 5.1.10 in the research. `@dbos-inc/drizzle-datasource` 5.2.11 needs SDK 5.2.x: with 5.1.10 it fails with `migrateDataSourcePG is not a function`. **Pin both to 5.2.11**, as a matched pair in the pnpm catalog.
2. The datasource creates its own `dbos` schema in the app database (its transaction-tracking table), alongside the DBOS system database. Drizzle migrations must leave that schema alone.
3. Starting a workflow ID that is already pending recovery logs "already exists in queue: _dbos_internal_queue". It is harmless: the call returns the recorded result.
4. **Local dev Postgres runs on port 5433**, because a native Postgres already holds 5432 on Abu's Mac. `deploy/compose.dev.yaml` and `.env.example` are updated.

## Decision
DBOS confirmed as the automation executor (K4). Still to verify in Stage 8: a Coolify rolling deploy (app version pinning), plus `registerQueue` and `createSchedule`.
