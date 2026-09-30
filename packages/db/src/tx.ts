import { sql } from "drizzle-orm";

import type { Db } from "./client";
import { outbox } from "./schema/system";

export type OutboxEvent = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** Makes the same event, written twice, one row. */
  dedupeKey: string;
  userId?: string;
  network?: "mainnet" | "testnet";
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Writes events in the same transaction as the change they describe (K5). After commit, listeners are told
 * with `pg_notify`, so the api's SSE streams and the executor's queues pick the rows up without polling.
 */
export async function withOutbox<T>(
  db: Db,
  run: (tx: Tx) => Promise<{ result: T; events: OutboxEvent[] }>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const { result, events } = await run(tx);
    if (events.length === 0) return result;
    const rows = await tx
      .insert(outbox)
      .values(events)
      .onConflictDoNothing({ target: outbox.dedupeKey })
      .returning({ id: outbox.id });
    for (const row of rows) await tx.execute(sql`select pg_notify('kawase_events', ${row.id})`);
    return result;
  });
}
