// Account lifecycle (cards/access.md "Delete account"): a deleted account's @handle is held, so no one else can take
// it and be paid in its place, for 30 days; so is a handle the person renamed away from (security review, low), which
// they may still take back. Not moved with the user's data (a deleted account's hold has no user).
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, timestampTz } from "./common";
import { users } from "./identity";

export const handleHolds = pgTable("handle_holds", {
  /** Lower-case, as handles are unique without regard to case. */
  handle: text().primaryKey(),
  heldUntil: timestampTz().notNull(),
  /** Who renamed away from it (they may take it back); null for a deleted account's handle. */
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
