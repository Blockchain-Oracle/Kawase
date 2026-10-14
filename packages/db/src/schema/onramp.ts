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
    /** Whose address that is: the person's own wallet, or their agent wallet (topped up with Apple Pay, B2-2). */
    destinationKind: text().notNull().default("wallet"),
    /** The block when it started: an agent wallet's arrivals are read from the chain from here (no watcher row). */
    fromBlock: money(),
    /** Base units that arrived (6 decimals), the transfer that brought them, and when. */
    received: money(),
    receivedTx: text(),
    receivedLogIndex: text(),
    settledAt: timestampTz(),
    /** Which engine runs it ("circle", "coinbase"), how it is paid (apple_pay, google_pay, card, bank) and where the provider delivers ("arc", or "base" when a Bring-to-Arc leg follows). */
    engine: text().notNull().default("circle"),
    method: text(),
    deliveryChain: text().notNull().default("arc"),
    /** The provider's own order id (Coinbase), and the delivery it made on `deliveryChain` once it has. */
    providerOrderId: text(),
    deliveryTx: text(),
    /** The leg after a Base delivery: null → "starting" (claimed once) → "started" (`crosschainIntentId`) or "failed". */
    bridgeState: text(),
    crosschainIntentId: uuid(),
    /** sha256 of the key the buy page holds in its URL fragment: it may read this order, send its events, re-mint its session. */
    pageKeyHash: text(),
    /** The browser's lifecycle hints and webhook notes, newest last (diagnostics only). */
    events: jsonb().$type<Record<string, unknown>[]>().notNull().default([]),
    expiresAt: timestampTz().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("onramp_orders_user_idx").on(table.userId, table.network, table.createdAt),
    uniqueIndex("onramp_orders_received_idx").on(table.receivedTx, table.receivedLogIndex),
    uniqueIndex("onramp_orders_provider_idx").on(table.engine, table.providerOrderId),
  ],
);
