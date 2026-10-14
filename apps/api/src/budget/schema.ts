// The weekly budget's tables (D38; migration 0100_budget). Kept beside the budget code until the lead moves them into
// @kawase/db's schema; they use the same snake_case db instance.
//  - budgets:              the person's signed budget per network (EIP-712 from their wallet), newest first.
//  - budget_spend:         the weekly spend ledger: one row per silent action, counted while its intent is alive.
//  - budget_leaf_requests: the one-shot leaves handed to the phone for an approval, until they are signed and redeemed.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, intents, money, networkEnum, timestampTz, updatedAt, users } from "@kawase/db";

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    chainId: integer().notNull(),
    wallet: text().notNull(),
    /** US dollars, 6-decimal base units. */
    weeklyCap: money().notNull(),
    perActionCap: money().notNull(),
    categories: text().array().notNull(),
    venues: text().array().notNull(),
    issuedAt: integer().notNull(),
    version: integer().notNull(),
    /** The wallet's EIP-712 signature over exactly these terms (packages/wallet `budgetTypedData`). */
    signature: text().notNull(),
    /** Pausing is silent and only ever makes Kawase do less: it needs no signature. */
    paused: boolean().notNull().default(false),
    /** Set when a newer budget replaces this one, or the person ends it. */
    endedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("budgets_active_idx").on(table.userId, table.network).where(sql`${table.endedAt} is null`),
    uniqueIndex("budgets_version_idx").on(table.userId, table.network, table.version),
  ],
);

export const budgetSpend = pgTable(
  "budget_spend",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    budgetId: uuid()
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    intentId: uuid().references(() => intents.id, { onDelete: "cascade" }),
    /** swap · bridge · earn · x402 · send */
    category: text().notNull(),
    venue: text().notNull(),
    /** US dollars, 6-decimal base units. */
    amountUsd: money().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("budget_spend_week_idx").on(table.userId, table.network, table.createdAt),
    uniqueIndex("budget_spend_intent_idx").on(table.intentId).where(sql`${table.intentId} is not null`),
  ],
);

export const budgetLeafRequests = pgTable(
  "budget_leaf_requests",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    intentId: uuid()
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** swap · earn */
    kind: text().notNull(),
    draftVersion: integer().notNull(),
    draftHash: text().notNull(),
    /** The unsigned leaves, in redeem order, each with the one call it was built for. */
    steps: jsonb().$type<{ grant: Record<string, unknown>; target: string; callData: string }[]>().notNull(),
    category: text().notNull(),
    venue: text().notNull(),
    amountUsd: money().notNull(),
    /** pending_signature → redeemed, or rejected / expired. */
    status: text().notNull().default("pending_signature"),
    /** The leaves' own on-chain end (Timestamp caveat). */
    expiresAt: timestampTz().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("budget_leaf_requests_intent_idx").on(table.intentId)],
);
