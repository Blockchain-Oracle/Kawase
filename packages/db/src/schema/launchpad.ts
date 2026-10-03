// Graduation watches (launchpads, e.g. LIFT on Arc): the person asked to be told when a token still on its bonding curve
// graduates to a regular pool. One row per person, network and token; `notifiedAt` is set when they were told.
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz } from "./common";
import { users } from "./identity";

export const launchpadWatches = pgTable(
  "launchpad_watches",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    /** The token's address (lowercase) and symbol, and the launchpad that launched it ("LIFT"). */
    token: text().notNull(),
    symbol: text().notNull(),
    launchpad: text().notNull(),
    notifiedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("launchpad_watches_user_token_idx").on(table.userId, table.network, table.token), index("launchpad_watches_open_idx").on(table.notifiedAt)],
);
