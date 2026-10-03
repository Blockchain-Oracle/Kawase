// Payment requests (C3), the incoming transfers Kawase has seen on chain, where the watcher is up to, and the
// in-app inbox (J1). A request is a shareable link; it is marked paid by the Kawase send that paid it, or by a
// matching incoming transfer (same person, asset and exact amount, after the request was made).
import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz } from "./common";
import { users } from "./identity";

export const paymentRequestStatusEnum = pgEnum("payment_request_status", ["open", "paid", "canceled", "expired"]);

export const paymentRequests = pgTable(
  "payment_requests",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The public id in the link. Not a secret: the link is meant to be shared. */
    token: text().notNull(),
    network: networkEnum().notNull(),
    /** "USDC"/"EURC", or the lower-case address of any other token (R1); what an incoming transfer is matched on. */
    asset: text().notNull(),
    /** For a token other than USDC/EURC: its symbol and decimals, for the words. */
    assetSymbol: text(),
    assetDecimals: integer(),
    /** Base units of the asset. */
    amount: money().notNull(),
    /** Shown to the payer; never written on the chain (Memo data is public, context/01-arc/gotchas.md #29). */
    note: text(),
    /** The requester's wallet when the request was made: where the money must arrive. */
    payTo: text().notNull(),
    status: paymentRequestStatusEnum().notNull().default("open"),
    expiresAt: timestampTz().notNull(),
    paidAt: timestampTz(),
    paidTxHash: text(),
    paidByAddress: text(),
    /** The Kawase send that paid it, when the payer used Kawase. */
    paidIntentId: uuid(),
    /** The Kawase user it was asked of in the app (an inbox item and push, "@x asked you for 12 USDC"); null for a link only. */
    payerUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("payment_requests_token_idx").on(table.token),
    index("payment_requests_user_status_idx").on(table.userId, table.status),
    index("payment_requests_payer_idx").on(table.payerUserId, table.status),
  ],
);

/** One incoming transfer to a Kawase wallet, as seen on chain (unique per log). */
export const chainEvents = pgTable(
  "chain_events",
  {
    id: id(),
    /** The Kawase user the transfer reached. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    chainId: integer().notNull(),
    blockNumber: bigint({ mode: "bigint" }).notNull(),
    txHash: text().notNull(),
    logIndex: integer().notNull(),
    asset: text().notNull(),
    fromAddress: text().notNull(),
    toAddress: text().notNull(),
    /** Base units of the asset's ERC-20 view (6 decimals). */
    amount: money().notNull(),
    matchedRequestId: uuid(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("chain_events_log_idx").on(table.chainId, table.txHash, table.logIndex),
    index("chain_events_user_idx").on(table.userId, table.createdAt),
  ],
);

/** How far the watcher has read, per network and stream. */
export const indexerCursors = pgTable(
  "indexer_cursors",
  {
    network: networkEnum().notNull(),
    stream: text().notNull(),
    lastBlock: bigint({ mode: "bigint" }).notNull(),
    updatedAt: timestampTz().defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.network, table.stream] })],
);

export const inboxKindEnum = pgEnum("inbox_kind", ["payment_received", "request_paid", "send_completed", "automation_skipped", "rule_alert", "needs_you", "automation_reminder", "request_received"]);

/** The in-app inbox, the source of truth for what happened (push and email arrive in Stage 9). */
export const inboxItems = pgTable(
  "inbox_items",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    kind: inboxKindEnum().notNull(),
    params: jsonb().$type<Record<string, string>>().notNull(),
    requestId: uuid(),
    intentId: uuid(),
    txHash: text(),
    /** The same thing reported twice is one item. */
    dedupeKey: text().notNull(),
    readAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("inbox_items_dedupe_idx").on(table.dedupeKey),
    index("inbox_items_user_created_idx").on(table.userId, table.createdAt),
    index("inbox_items_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} is null`),
  ],
);
