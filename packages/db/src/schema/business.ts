// Business mode (cards/agent-business.md): a business profile; invoices with line items and an on-chain reference
// (Arc's Memo contract), paid through their payment request link and matched by that reference; batch payouts the
// wallet signs once; and payroll, a group of scheduled sends (one grant per payee) run by the automation engine.
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";
import { paymentRequests } from "./requests";

export const businessProfiles = pgTable("business_profiles", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  address: text(),
  taxId: text(),
  /** Where clients can reach the business (printed on invoices). */
  email: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type InvoiceLine = { description: string; quantity: number; unitAmount: string };
export type InvoicePayment = { txHash: string; from: string; amount: string; at: string; via: "memo" | "request" };

export const invoiceStatusEnum = pgEnum("invoice_status", ["open", "partially_paid", "paid", "canceled"]);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** "INV-0001", per business. */
    number: text().notNull(),
    /** The payment request whose link the client pays through. */
    requestId: uuid().references(() => paymentRequests.id, { onDelete: "set null" }),
    clientName: text().notNull(),
    clientEmail: text(),
    /** The symbol shown; `tokenAddress` and `decimals` say which token exactly (any Arc token, A0). */
    asset: text().notNull(),
    tokenAddress: text(),
    decimals: integer().notNull().default(6),
    /** The link for an invoice in a token payment requests do not carry (USDC and EURC use their request token). */
    publicToken: text(),
    /** The last reminder sent: "due_soon", "due_today" or "overdue". */
    reminded: text(),
    lineItems: jsonb().$type<InvoiceLine[]>().notNull(),
    total: money().notNull(),
    dueAt: timestampTz().notNull(),
    /** bytes32: the Memo contract's indexed memoId for this invoice (opaque; memo data is public). */
    memoId: text().notNull(),
    status: invoiceStatusEnum().notNull().default("open"),
    paidAmount: money().notNull().default(BigInt(0)),
    payments: jsonb().$type<InvoicePayment[]>().notNull().default([]),
    note: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("invoices_user_number_idx").on(table.userId, table.number),
    uniqueIndex("invoices_memo_idx").on(table.memoId),
    index("invoices_network_status_idx").on(table.network, table.status),
  ],
);

export type PayoutLine = { name: string | null; address: string; amount: string };
export const payoutStatusEnum = pgEnum("payout_status", ["ready", "submitted", "confirmed", "failed"]);

export const payoutBatches = pgTable(
  "payout_batches",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    asset: text().notNull(),
    tokenAddress: text(),
    decimals: integer().notNull().default(6),
    lines: jsonb().$type<PayoutLine[]>().notNull(),
    total: money().notNull(),
    status: payoutStatusEnum().notNull().default("ready"),
    txHash: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("payout_batches_user_created_idx").on(table.userId, table.createdAt)],
);

export const payrolls = pgTable(
  "payrolls",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    name: text().notNull(),
    /** One scheduled send per payee (each with its own grant pinned to that payee). */
    automationIds: jsonb().$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("payrolls_user_idx").on(table.userId)],
);
