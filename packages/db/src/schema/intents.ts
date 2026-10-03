// What the person asked for, and every version of what Kawase proposed (ARCHITECTURE §3–§5). An intent moves
// through the A2A states; each material change is a new immutable draft with its own hash, and an approval
// names the exact version it approves. The spend ledger reserves money against the person's limits before
// anything is sent, so two taps at once cannot both fit under the same limit.
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz, updatedAt } from "./common";
import { payoutBatches } from "./business";
import { users } from "./identity";

export const intentStateEnum = pgEnum("intent_state", [
  "submitted",
  "working",
  "input_required",
  "auth_required",
  "ready_for_approval",
  "approved",
  "executing",
  "completed",
  "failed",
  "rejected",
  "canceled",
  "expired",
  "unknown_outcome",
]);
export const intentKindEnum = pgEnum("intent_kind", ["send", "swap", "bridge", "earn", "margin", "crosschain", "lend"]);
export const surfaceEnum = pgEnum("surface", ["app", "chat", "voice", "automation"]);
export const approvalRouteEnum = pgEnum("approval_route", ["allowance", "wallet_signature", "automation"]);

export const intents = pgTable(
  "intents",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid(),
    network: networkEnum().notNull(),
    kind: intentKindEnum().notNull(),
    originSurface: surfaceEnum().notNull(),
    state: intentStateEnum().notNull().default("submitted"),
    currentDraftVersion: integer().notNull().default(0),
    /** The person's own words for each field, kept so a fix (a saved contact) can re-resolve them. */
    request: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Set when this send pays a payment request; the request is marked paid when the send completes. */
    paymentRequestId: uuid(),
    expiresAt: timestampTz().notNull(),
    completedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("intents_user_state_idx").on(table.userId, table.state),
    index("intents_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const intentDrafts = pgTable(
  "intent_drafts",
  {
    intentId: uuid()
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    /** The resolved draft (bigints as decimal strings) plus the display of who and what. */
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** EIP-712 hash of the money fields (`SendDraft`), present once the draft is complete. */
    draftHash: text(),
    /** The policy report at drafting time: every check, the blocking one, and the route. */
    policyReport: jsonb().$type<Record<string, unknown>>().notNull(),
    route: approvalRouteEnum(),
    /** agent, user or system */
    createdBy: text().notNull(),
    voidedAt: timestampTz(),
    voidReason: text(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.intentId, table.version] })],
);

export const approvalStatusEnum = pgEnum("approval_status", ["pending_signature", "approved", "consumed", "rejected"]);

/** The person's yes to one exact draft version, and how it is bound (the allowance, or a wallet signature). */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    intentId: uuid()
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    draftVersion: integer().notNull(),
    draftHash: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    route: approvalRouteEnum().notNull(),
    /** For the wallet route: the unsigned transaction handed to the device. */
    unsignedTransaction: jsonb().$type<Record<string, unknown>>(),
    signerAddress: text(),
    deviceId: uuid(),
    status: approvalStatusEnum().notNull(),
    decidedViaSurface: surfaceEnum().notNull(),
    expiresAt: timestampTz().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("approvals_intent_version_idx")
      .on(table.intentId, table.draftVersion)
      .where(sql`${table.status} <> 'rejected'`),
  ],
);

export const spendStateEnum = pgEnum("spend_state", ["reserved", "committed", "released"]);

/** Money counted against the person's limits: reserved at approval, committed on success, released otherwise. */
export const spendLedger = pgTable(
  "spend_ledger",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** The send (or other intent) this is for; null for a batch payout, which names its payout instead. */
    intentId: uuid().references(() => intents.id, { onDelete: "cascade" }),
    /** A batch payout's whole spend (security review M7): one row per payout, reserved when it is signed. */
    payoutId: uuid().references(() => payoutBatches.id, { onDelete: "cascade" }),
    category: text().notNull(),
    /** USDC or EURC; limits are counted per asset. */
    asset: text().notNull(),
    amount: money().notNull(),
    state: spendStateEnum().notNull().default("reserved"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("spend_ledger_intent_category_idx").on(table.intentId, table.category),
    uniqueIndex("spend_ledger_payout_idx")
      .on(table.payoutId)
      .where(sql`${table.payoutId} is not null`),
    index("spend_ledger_user_network_created_idx").on(table.userId, table.network, table.createdAt),
  ],
);
