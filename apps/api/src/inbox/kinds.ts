// The database's `inbox_kind` enum still lists "invoice_due" and "invoice_overdue": Postgres cannot drop an enum value
// (migration 0090 retired them and deleted their rows). Nothing writes them any more, so a row read back is one of the
// kinds the clients know.
import type { InboxKind } from "@kawase/api-client";
import type { inboxItems } from "@kawase/db";

export const liveKind = (kind: typeof inboxItems.$inferSelect.kind): InboxKind => kind as InboxKind;
