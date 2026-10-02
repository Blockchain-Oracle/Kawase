// Account lifecycle (cards/access.md "Delete account"): a deleted account's @handle is held, so no one else can take
// it and be paid in its place, for 30 days. Not user-owned (the user is gone), so not in move-user-data.
import { pgTable, text } from "drizzle-orm/pg-core";

import { createdAt, timestampTz } from "./common";

export const handleHolds = pgTable("handle_holds", {
  /** Lower-case, as handles are unique without regard to case. */
  handle: text().primaryKey(),
  heldUntil: timestampTz().notNull(),
  createdAt: createdAt(),
});
