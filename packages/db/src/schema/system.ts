// Cross-cutting tables: the audit log, api idempotency and the outbox (Postgres is the only bus, K5).
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz } from "./common";
import { users } from "./identity";

/** Append-only. Each row hashes the previous one, so a gap or a change shows. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** user, agent, system, admin */
    actor: text().notNull(),
    actorRef: text(),
    action: text().notNull(),
    subjectType: text(),
    subjectId: text(),
    network: networkEnum(),
    intentId: uuid(),
    policyVersion: text(),
    checks: jsonb().$type<Record<string, unknown>>(),
    decision: text(),
    reasonCode: text(),
    modelId: text(),
    toolCallId: text(),
    deviceId: uuid(),
    prevHash: text(),
    hash: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("audit_log_user_created_idx").on(table.userId, table.createdAt)],
);

/** Stored responses for requests that carried an Idempotency-Key. */
export const apiIdempotency = pgTable(
  "api_idempotency",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text().notNull(),
    requestHash: text().notNull(),
    status: integer().notNull(),
    response: jsonb().$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("api_idempotency_pk").on(table.userId, table.key)],
);

/** Events written in the same transaction as the change they describe; dispatched after commit. */
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    aggregateType: text().notNull(),
    aggregateId: text().notNull(),
    userId: uuid(),
    network: networkEnum(),
    eventType: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    dedupeKey: text().notNull(),
    dispatchedAt: timestampTz(),
    attempts: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("outbox_dedupe_idx").on(table.dedupeKey),
    index("outbox_undispatched_idx")
      .on(table.createdAt)
      .where(sql`${table.dispatchedAt} is null`),
  ],
);
