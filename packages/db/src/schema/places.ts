// My places (money-out.md Withdraw; surfaces.md Contacts "People · My places"): where the person takes money out
// to, saved after the first withdrawal so the next one is a tap on a logo. An exchange deposit address or the
// person's own wallet, per network and chain ("arc", or a chain Kawase bridges to: "base"…). Labels are inferred
// ("Kraken", "My wallet on Base") and can be renamed.
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const placeKindEnum = pgEnum("place_kind", ["exchange", "wallet"]);

export const places = pgTable(
  "places",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    kind: placeKindEnum().notNull(),
    label: text().notNull(),
    /** The exchange's slug (kraken) or a wallet brand (metamask); null for an unbranded wallet. */
    brand: text(),
    /** "arc" or a bridge destination id ("base"). */
    chain: text().notNull(),
    /** Lower case. */
    address: text().notNull(),
    lastUsedAt: timestampTz(),
    deletedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("places_user_where_idx")
      .on(table.userId, table.network, table.chain, table.address)
      .where(sql`${table.deletedAt} is null`),
    index("places_user_idx").on(table.userId),
  ],
);
