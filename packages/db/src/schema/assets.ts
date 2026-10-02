// The asset registry's runtime part (R1, G5): which tokens each person's wallet has received (found by the
// watcher from Transfer logs, any ERC-20, no hand-picked list), what each token is (read once from its contract),
// the person's own show/hide choice, and portfolio snapshots for the balance chart.
import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, integer, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

/** How a token reached the list: a live Transfer, the backfill from registration, or a balance read. */
export const walletTokenSourceEnum = pgEnum("wallet_token_source", ["transfer", "backfill", "balance"]);
/** The person's own choice; "auto" follows Kawase's spam and lookalike rules. */
export const tokenVisibilityEnum = pgEnum("token_visibility", ["auto", "shown", "hidden"]);

export const walletTokens = pgTable(
  "wallet_tokens",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    chainId: integer().notNull(),
    /** Lower case. */
    tokenAddress: text().notNull(),
    /** Lower case; the wallet that received it. */
    walletAddress: text().notNull(),
    source: walletTokenSourceEnum().notNull(),
    firstBlock: bigint({ mode: "bigint" }),
    lastBlock: bigint({ mode: "bigint" }),
    visibility: tokenVisibilityEnum().notNull().default("auto"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.chainId, table.tokenAddress] }),
    index("wallet_tokens_user_network_idx").on(table.userId, table.network),
  ],
);

/** What a token says about itself on chain, read once (symbol, name, decimals; an ERC-4626 share names its asset). */
export const tokenMetadata = pgTable(
  "token_metadata",
  {
    chainId: integer().notNull(),
    /** Lower case. */
    address: text().notNull(),
    symbol: text().notNull(),
    name: text().notNull(),
    decimals: integer().notNull(),
    /** For vault shares: the underlying token (lower case). */
    underlying: text(),
    /** The contract answered none of symbol/name/decimals: not an ERC-20 (or a broken one). */
    broken: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.address] })],
);

/** The portfolio's total over time, for the Balance Chart (one row per person, network and quarter hour at most). */
export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    takenAt: timestampTz().notNull().default(sql`now()`),
    /** Every asset, chain and position, in US dollars. */
    totalUsd: doublePrecision().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.network, table.takenAt] })],
);
