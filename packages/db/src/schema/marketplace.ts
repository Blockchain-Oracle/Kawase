// The x402 marketplace (cards/marketplace.md): the person's own budget for paid services, every purchase the agent
// made (or was refused), and every move of money into or out of their agent wallet. The agent wallet itself is a row
// in `wallets` (role `marketplace`, custody `circle_dcw`, one per network); its funding grant is a row in `grants`
// (kind `marketplace`).
import { boolean, index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

/** The person's controls per network; absent means MARKETPLACE_DEFAULTS. */
export const marketplaceSettings = pgTable(
  "marketplace_settings",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    dailyBudget: money().notNull(),
    perCallCap: money().notNull(),
    /** Every purchase waits for a tap on its card, however small. */
    askFirst: boolean().notNull().default(false),
    /** Empty = every category. */
    allowedCategories: jsonb().$type<string[]>().notNull().default([]),
    /** Sellers by payTo address (lower-case) or provider name. */
    blockedSellers: jsonb().$type<{ key: string; name: string }[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("marketplace_settings_pk").on(table.userId, table.network)],
);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  /** Waiting for the person's yes (above the per-call cap, or "ask me first"). */
  "needs_consent",
  /** The person said yes; the next call pays. */
  "approved",
  /** Signed and sent; the answer is not in yet. Never signed again. */
  "paying",
  "paid",
  /** The seller took the payment but answered with an error. */
  "failed_after_payment",
  /** Nothing was paid (refused by policy, the seller, or the network). */
  "failed",
  "declined",
]);
export const purchaseRailEnum = pgEnum("purchase_rail", ["gateway", "eip3009"]);

export const marketplacePurchases = pgTable(
  "marketplace_purchases",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    threadId: uuid(),
    /** The listing's resource as called (template filled in). */
    url: text().notNull(),
    method: text().notNull().default("GET"),
    /** The request as the agent asked it (query and body), to match a resumed call to its consent. */
    requestHash: text().notNull(),
    providerName: text().notNull(),
    description: text(),
    category: text().notNull(),
    payTo: text(),
    amount: money().notNull(),
    rail: purchaseRailEnum(),
    status: purchaseStatusEnum().notNull(),
    /** Why it was refused or failed, as a code the app words (`over_budget`, `blocked_seller`, …). */
    reasonCode: text(),
    /** Gateway transfer id or the settlement transaction, from the seller's PAYMENT-RESPONSE. */
    settlement: text(),
    /** The EIP-3009 nonce signed: unique per payment, never reused. */
    authorizationNonce: text(),
    httpStatus: text(),
    contentType: text(),
    /** The first bytes of the answer (untrusted; shown on the receipt, quarantined for the model). */
    responsePreview: text(),
    paidAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("marketplace_purchases_user_created_idx").on(table.userId, table.network, table.createdAt),
    index("marketplace_purchases_thread_idx").on(table.threadId, table.requestHash),
  ],
);

export const agentMoveKindEnum = pgEnum("agent_move_kind", ["top_up", "deposit", "return"]);
export const agentMoveStatusEnum = pgEnum("agent_move_status", ["pending", "confirmed", "failed"]);

/** Money into or out of the agent wallet: top-ups under the grant, Gateway deposits, returns to the person. */
export const agentWalletMoves = pgTable(
  "agent_wallet_moves",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    kind: agentMoveKindEnum().notNull(),
    amount: money().notNull(),
    status: agentMoveStatusEnum().notNull().default("pending"),
    /** The chain transactions this move made (Circle transaction ids and hashes). */
    txHashes: jsonb().$type<string[]>().notNull().default([]),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("agent_wallet_moves_user_created_idx").on(table.userId, table.network, table.createdAt)],
);
