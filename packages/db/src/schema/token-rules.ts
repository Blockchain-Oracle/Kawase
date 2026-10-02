// Token rules (D12; cards/automate-safety.md, trade.md): what any buy of a token Kawase does not vouch for may be —
// from a screen, chat, voice or an automation — per person and network. Copycats and high-risk tokens are always
// blocked whatever these say. Tightening applies at once; a loosening waits here (`pending`) for the wallet's
// signature of the step-up message (the same yes as Wallet & limits, X7).
import { integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export type TokenAccess = "verified" | "warned";

export type TokenRulesValues = {
  access: TokenAccess;
  unverifiedPerTradeUsd: number;
  unverifiedPerDayUsd: number;
  maxPriceImpactBps: number;
};

export const tokenRules = pgTable(
  "token_rules",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** verified = only tokens Kawase vouches for; warned = also unverified ones, inside the caps, with a warning. */
    access: text().$type<TokenAccess>().notNull().default("warned"),
    unverifiedPerTradeUsd: integer().notNull().default(50),
    unverifiedPerDayUsd: integer().notNull().default(200),
    maxPriceImpactBps: integer().notNull().default(500),
    /** A loosening waiting for the wallet's signature: the values asked and the message to sign. */
    pending: jsonb().$type<{ id: string; values: TokenRulesValues; typedData: Record<string, unknown> }>(),
    pendingExpiresAt: timestampTz(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.network] })],
);
