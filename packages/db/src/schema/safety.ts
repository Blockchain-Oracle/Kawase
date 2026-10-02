// Wallet & limits (cards/automate-safety.md "Stay in control"): the allowlist switch per network, every limit change
// (tightening applies at once; loosening waits for the person's signature, X7), and practice outcomes ("would have").
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

/** Per network: whether only allowlisted recipients may be paid without the person (the agent, automations). */
export const safetySettings = pgTable(
  "safety_settings",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    allowlistOnly: boolean().notNull().default(false),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("safety_settings_pk").on(table.userId, table.network)],
);

/**
 * One change to a limit, as asked. `direction` decides how it is approved: a tightening applies at once; a loosening
 * waits for the wallet's signature (a step-up message, or a new on-chain grant for an allowance).
 */
export type LimitChange =
  /** The daily allowance for one token: a lower number tightens (server cap); a higher one needs a new grant. */
  | { kind: "allowance"; token: string; perDay: string }
  /** Stop using a token's allowance now (the on-chain revoke is offered with it). */
  | { kind: "allowance_off"; token: string }
  /** A temporary raise for one token: an extra grant that ends by itself. */
  | { kind: "boost"; token: string; extra: string; until: string }
  | { kind: "per_payment"; value: string }
  | { kind: "per_payment_temp"; value: string; until: string }
  | { kind: "cooldown"; seconds: number; cap: string }
  | { kind: "allowlist_only"; on: boolean }
  | { kind: "allowlist"; contactId: string; on: boolean }
  | { kind: "risk_mode"; mode: "careful" | "balanced" | "autonomous" }
  | { kind: "practice"; on: boolean }
  | { kind: "pause"; on: boolean };

export const limitChanges = pgTable(
  "limit_changes",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    change: jsonb().$type<LimitChange>().notNull(),
    /** tighten | loosen */
    direction: text().$type<"tighten" | "loosen">().notNull(),
    /** pending | applied | expired | canceled */
    status: text().$type<"pending" | "applied" | "expired" | "canceled">().notNull().default("pending"),
    /** What the person reads: the value now and after (display values). */
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    /** The step-up message the wallet signs for a loosening that needs no grant. */
    typedData: jsonb().$type<Record<string, unknown>>(),
    /** A loosening that is a new grant (allowance, boost): the pending grant, and the one it replaces. */
    grantId: uuid(),
    replacesGrantId: uuid(),
    /** app | chat | voice */
    requestedVia: text().notNull().default("app"),
    appliedAt: timestampTz(),
    expiresAt: timestampTz().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("limit_changes_user_idx").on(table.userId, table.network, table.createdAt)],
);

/** What a practice write would have done: the dry run on the chain (`eth_call` of the exact transaction). */
export type PracticeResult = { ok: boolean; error: string | null; simulatedAt: string };

export const practiceRuns = pgTable(
  "practice_runs",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** send | automation_run | … */
    kind: text().notNull(),
    intentId: uuid(),
    automationId: uuid(),
    /** The display of what it would have done (amount, asset, who). */
    summary: jsonb().$type<Record<string, string>>().notNull(),
    result: jsonb().$type<PracticeResult>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("practice_runs_user_idx").on(table.userId, table.network, table.createdAt),
    uniqueIndex("practice_runs_intent_idx")
      .on(table.intentId)
      .where(sql`${table.intentId} is not null`),
  ],
);
