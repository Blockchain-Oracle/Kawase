// Conversations with the agent (M1: threads with history). A thread belongs to one user; its messages are the AI
// SDK's UI messages as sent to the app (text, tool calls and their outputs), in order.
import { index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const threads = pgTable(
  "threads",
  {
    /** Chosen by the app (useChat's chat id), checked against the owner on every request. */
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text(),
    /** The network the thread was started on (the eyebrow in the list). */
    network: networkEnum().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastMessageAt: timestampTz().defaultNow().notNull(),
  },
  (table) => [index("threads_user_last_idx").on(table.userId, table.lastMessageAt)],
);

export const threadMessages = pgTable(
  "thread_messages",
  {
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    /** The UI message id. */
    id: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seq: integer().notNull(),
    role: text().notNull(),
    parts: jsonb().$type<unknown[]>().notNull(),
    metadata: jsonb().$type<unknown>(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.id] }), index("thread_messages_thread_seq_idx").on(table.threadId, table.seq)],
);
