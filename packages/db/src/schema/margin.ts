// Kawase Margin positions (trade.md "Long / short"): a leveraged long or short held as supply and debt in the
// person's own Aave V4 account. The chain holds the money; this row holds what the chain cannot tell apart: which
// market and side the amounts belong to (USDC debt is shared by every long, USDC collateral by every short and any
// earn supply), what went in, and the average entry price. Amounts are written only from receipts (Spoke events).
import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, money, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const marginPositions = pgTable(
  "margin_positions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** The venue's account the amounts live in (the Aave V4 Spoke). */
    venue: text().notNull(),
    /** The traded asset's symbol and token address as the venue lists it. */
    market: text().notNull(),
    asset: text().notNull(),
    /** "long" or "short". */
    side: text().notNull(),
    /** "open", "closed" or "liquidated". */
    status: text().notNull().default("open"),
    /** Base units: the collateral supplied for this position (the asset for a long, USDC for a short). */
    collateral: money().notNull(),
    /** Base units drawn: USDC for a long, the asset for a short (interest accrues on chain on top). */
    debt: money().notNull(),
    /** USDC base units the person put in, in total. */
    margin: money().notNull(),
    /** Average entry price of the asset, USD with 8 decimals (the venue's oracle at each fill). */
    entryPrice: money().notNull(),
    /** USDC base units that came back on closes, in total. */
    returned: money().notNull().default(sql`0`),
    openedAt: timestampTz().notNull(),
    closedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("margin_positions_user_idx").on(table.userId, table.network, table.status),
    uniqueIndex("margin_positions_open_idx")
      .on(table.userId, table.network, table.market, table.side)
      .where(sql`${table.status} = 'open'`),
  ],
);
