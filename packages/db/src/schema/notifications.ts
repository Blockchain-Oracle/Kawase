// Push and email (Stage 9, D31). The inbox item is the record of what happened; a delivery is one attempt to tell the
// person about it on one channel and one target (each of their phones, their email). Deliveries are queued in the
// same transaction as the inbox item, so nothing is told that did not happen and nothing that happened is lost.
import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, timestampTz } from "./common";
import { devices, users } from "./identity";
import { inboxItems } from "./requests";

export const notificationChannelEnum = pgEnum("notification_channel", ["push", "email"]);
/**
 * queued → sending → sent (push: Expo took it; email: Resend took it) → delivered (push receipt ok). skipped: the
 * person turned it off, or it was too old to tell. failed: the provider refused it, or it ran out of tries.
 */
export const deliveryStatusEnum = pgEnum("delivery_status", ["queued", "sending", "sent", "delivered", "skipped", "failed"]);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inboxItemId: uuid()
      .notNull()
      .references(() => inboxItems.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum().notNull(),
    /** "device:<id>" for push, "email" for email: one delivery per target. */
    target: text().notNull(),
    deviceId: uuid().references(() => devices.id, { onDelete: "cascade" }),
    status: deliveryStatusEnum().notNull().default("queued"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestampTz().defaultNow().notNull(),
    /** Expo's push ticket id (for the receipt) or Resend's email id. */
    providerId: text(),
    error: text(),
    sendingAt: timestampTz(),
    sentAt: timestampTz(),
    receiptCheckedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_target_idx").on(table.inboxItemId, table.channel, table.target),
    index("notification_deliveries_queued_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = 'queued'`),
    index("notification_deliveries_receipt_idx")
      .on(table.sentAt)
      .where(sql`${table.status} = 'sent' and ${table.channel} = 'push'`),
  ],
);
