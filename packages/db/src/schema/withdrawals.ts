// One withdrawal (money-out.md "Withdraw"; G7), kept on the server so it survives the app closing: where it goes,
// the steps it takes (conversions, transfers, one bridge of all the USDC), each step's own intent once it exists, and
// how far it got. The app signs each step's intent; "Finish it" picks up the first step not done — the same intent
// while it still stands — after a restart too. Activity shows the whole withdrawal as one row that opens into its
// steps.
import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export type WithdrawalDestination = {
  kind: "exchange" | "wallet";
  label: string | null;
  brand: string | null;
  chain: { key: string; name: string; chainId: number | null };
  address: string;
  placeId: string | null;
  exchange: { slug: string; name: string; networkLabel: string } | null;
};

export type WithdrawalStep = {
  id: string;
  kind: "swap" | "send" | "bridge";
  /** What leaves: the token converted or sent; USDC for the last move. */
  token: { address: string; symbol: string; decimals: number };
  /** Base units; null = all the USDC gathered (the direct USDC lines plus what the conversions delivered). */
  amount: string | null;
  /** The last move's own USDC lines, before conversions add to it. */
  direct?: string | undefined;
  intentId: string | null;
  state: "pending" | "active" | "done" | "failed";
  arriving?: boolean | undefined;
  received?: string | null | undefined;
  moved?: string | null | undefined;
  explorerUrl?: string | null | undefined;
  fillUrl?: string | null | undefined;
  failure?: "changed" | "checking" | "not_sent" | "unavailable" | null | undefined;
  blocking?: { code: string; kind: string; params?: Record<string, string> } | null | undefined;
};

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    destination: jsonb().$type<WithdrawalDestination>().notNull(),
    steps: jsonb().$type<WithdrawalStep[]>().notNull(),
    /** running | stopped | done | canceled */
    status: text().$type<"running" | "stopped" | "done" | "canceled">().notNull().default("running"),
    /** Approximate USD that leaves, for the row and the receipt. */
    totalUsd: text(),
    completedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("withdrawals_user_idx").on(table.userId, table.network, table.createdAt)],
);
