// Split a bill (plan §A.4.4, C3): one amount shared between people, as one payment request per person (each with its
// own link, paid from Kawase or any wallet, matched like any request), and the split that ties them together so the
// person who paid the bill sees who has paid them back.
import { index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, updatedAt } from "./common";
import { users } from "./identity";
import { paymentRequests } from "./requests";

export const splitStatusEnum = pgEnum("split_status", ["open", "settled", "canceled"]);

export const splits = pgTable(
  "splits",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    title: text().notNull(),
    asset: text().notNull(),
    /** Base units: the whole bill, and the share of it the person who split it keeps (never requested). */
    total: money().notNull(),
    myShare: money(),
    status: splitStatusEnum().notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("splits_user_created_idx").on(table.userId, table.createdAt)],
);

export const splitShares = pgTable(
  "split_shares",
  {
    id: id(),
    splitId: uuid()
      .notNull()
      .references(() => splits.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** In order, as the person listed them. */
    seq: integer().notNull(),
    /** As the person wrote it, and the @handle it matched (a contact or a Kawase user), when it did. */
    name: text().notNull(),
    handle: text(),
    amount: money().notNull(),
    requestId: uuid()
      .notNull()
      .references(() => paymentRequests.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [index("split_shares_split_idx").on(table.splitId, table.seq)],
);
