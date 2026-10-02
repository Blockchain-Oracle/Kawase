// Buying with Apple Pay, Google Pay or a debit card through Circle's Onramp (money-in.md): one row per purchase the
// person starts. The provider delivers USDC or EURC to their wallet; the order is settled only by that delivery,
// seen on chain by the incoming watcher (chain_events) or reported by Circle's webhook, never by the browser's
// events alone (they move the status shown, nothing else). An optional "then buy" token is the swap that follows.
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const onrampOrders = pgTable(
  "onramp_orders",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** Where it was started: app, chat or voice. */
    surface: text().notNull(),
    /** "created" → "opened" → "submitted" → "settled", or "not_completed" (with `reason`) / "expired". */
    status: text().notNull().default("created"),
    /** The provider's reason when it did not complete (SESSION_TIMEOUT, CANCELED_BY_CUSTOMER, …). */
    reason: text(),
    /** What the provider delivers on Arc (USDC or EURC) and the amount asked for, in fiat. */
    asset: text().notNull(),
    fiatAmount: text(),
    fiatCurrency: text(),
    /** Circle's trace id for the session (the kit stamps it), for webhook correlation. */
    traceId: text(),
    /** The token to buy with what arrives (any token), when the person asked for one. */
    thenToken: text(),
    destination: text().notNull(),
    /** Base units that arrived (6 decimals), the transfer that brought them, and when. */
    received: money(),
    receivedTx: text(),
    receivedLogIndex: text(),
    settledAt: timestampTz(),
    /** The browser's lifecycle hints and webhook notes, newest last (diagnostics only). */
    events: jsonb().$type<Record<string, unknown>[]>().notNull().default([]),
    expiresAt: timestampTz().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("onramp_orders_user_idx").on(table.userId, table.network, table.createdAt),
    uniqueIndex("onramp_orders_received_idx").on(table.receivedTx, table.receivedLogIndex),
  ],
);
