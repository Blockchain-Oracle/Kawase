// Spike 6: DBOS exactly-once for an automation occurrence.
// Scenario: "every Tuesday send $10 to Alex". The worker crashes right after the payment side effect,
// before marking the occurrence done. On restart DBOS must resume WITHOUT repeating the payment,
// and a duplicate tick/start for the same slot must not create a second occurrence or payment.
// Run: PHASE=crash node spike.mjs   (exits mid-workflow)   then   PHASE=recover node spike.mjs
import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import { sql } from "drizzle-orm";
import pg from "pg";

const APP_DB_URL = "postgres://kawase:kawase@localhost:5433/kawase";
const SYSTEM_DB_URL = "postgres://kawase:kawase@localhost:5433/kawase_dbos";
const AUTOMATION_ID = "auto-alex-tuesday";
const SCHEDULED_FOR = "2026-10-06T09:00:00Z";
const PAYMENT_AMOUNT_BASE_UNITS = "10000000"; // 10 USDC, 6 decimals (ERC-20 view)
const WAIT_FOR_RESULT_MS = 15_000;
const PHASE = process.env.PHASE ?? "crash";

const dataSource = new DrizzleDataSource("app-db", { connectionString: APP_DB_URL });

async function setupSchema() {
  const client = new pg.Client({ connectionString: APP_DB_URL });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS spike_occurrences (
      id text PRIMARY KEY, automation_id text NOT NULL, scheduled_for timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'pending', UNIQUE (automation_id, scheduled_for));
    CREATE TABLE IF NOT EXISTS spike_payment_calls (
      id bigserial PRIMARY KEY, occurrence_id text NOT NULL, amount numeric(78,0) NOT NULL, at timestamptz DEFAULT now());`);
  await client.end();
}

// The "tick": claim the slot. ON CONFLICT DO NOTHING makes duplicate ticks harmless.
async function tick() {
  const occurrenceId = `${AUTOMATION_ID}:${SCHEDULED_FOR}`;
  await dataSource.runTransaction(
    () => dataSource.client.execute(sql`
      INSERT INTO spike_occurrences (id, automation_id, scheduled_for)
      VALUES (${occurrenceId}, ${AUTOMATION_ID}, ${SCHEDULED_FOR}) ON CONFLICT DO NOTHING`),
    { name: "tick" },
  );
  return occurrenceId;
}

// Deliberately NOT idempotent at the SQL level: every call inserts a row.
// Only DBOS step checkpointing can prevent a second row after a crash.
const sendPayment = dataSource.registerTransaction(
  async (occurrenceId) => {
    await dataSource.client.execute(sql`
      INSERT INTO spike_payment_calls (occurrence_id, amount) VALUES (${occurrenceId}, ${PAYMENT_AMOUNT_BASE_UNITS})`);
  },
  { name: "sendPayment" },
);

const markStatus = dataSource.registerTransaction(
  async (occurrenceId, status) => {
    await dataSource.client.execute(sql`UPDATE spike_occurrences SET status = ${status} WHERE id = ${occurrenceId}`);
  },
  { name: "markStatus" },
);

async function runOccurrenceFn(occurrenceId) {
  await markStatus(occurrenceId, "executing");
  await sendPayment(occurrenceId);
  if (PHASE === "crash") {
    console.log("[crash] payment sent; crashing before marking the occurrence succeeded");
    process.exit(1);
  }
  await markStatus(occurrenceId, "succeeded");
  return "paid";
}
const runOccurrence = DBOS.registerWorkflow(runOccurrenceFn, { name: "runOccurrence" });

async function report() {
  const client = new pg.Client({ connectionString: APP_DB_URL });
  await client.connect();
  const occ = await client.query("SELECT id, status FROM spike_occurrences");
  const calls = await client.query("SELECT count(*)::int AS n FROM spike_payment_calls");
  await client.end();
  return { occurrences: occ.rows, paymentCalls: calls.rows[0].n };
}

await setupSchema();
DBOS.setConfig({ name: "kawase-spike-06", systemDatabaseUrl: SYSTEM_DB_URL });
await DBOS.launch(); // on PHASE=recover, DBOS recovers the pending workflow here

const occurrenceId = await tick();
const secondTickId = await tick(); // duplicate tick for the same slot
// A duplicate start with the same workflowID must return the recorded result, not run again.
const handle = await DBOS.startWorkflow(runOccurrence, { workflowID: occurrenceId })(occurrenceId);

if (PHASE === "recover") {
  const duplicate = await DBOS.startWorkflow(runOccurrence, { workflowID: occurrenceId })(occurrenceId);
  const result = await Promise.race([
    handle.getResult(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), WAIT_FOR_RESULT_MS)),
  ]);
  const duplicateResult = await duplicate.getResult();
  const state = await report();
  const pass =
    result === "paid" && duplicateResult === "paid" && state.paymentCalls === 1 &&
    state.occurrences.length === 1 && state.occurrences[0].status === "succeeded" && occurrenceId === secondTickId;
  console.log(JSON.stringify({ result, duplicateResult, ...state, PASS: pass }, null, 2));
  await DBOS.shutdown();
  process.exit(pass ? 0 : 1);
}
