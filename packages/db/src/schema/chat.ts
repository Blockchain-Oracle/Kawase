// Conversations with the agent (M1: threads with history). A thread belongs to one user; its messages are the AI
// SDK's UI messages as sent to the app (text, tool calls and their outputs), in order.
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  (table) => [
    primaryKey({ columns: [table.threadId, table.id] }),
    index("thread_messages_thread_seq_idx").on(table.threadId, table.seq),
  ],
);

/** A committed request identity survives disconnects and prevents a tool-bearing turn being repeated. */
export const threadTurns = pgTable(
  "thread_turns",
  {
    threadId: uuid()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    id: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputHash: text().notNull(),
    surface: text().notNull(),
    status: text().$type<"running" | "completed" | "interrupted" | "failed">().notNull(),
    createdAt: createdAt(),
    finishedAt: timestampTz(),
    /** Renewed by the executing API; a crashed process cannot block this thread indefinitely. */
    leaseUntil: timestampTz()
      .notNull()
      .default(sql`now() + interval '90 seconds'`),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.id] }),
    uniqueIndex("thread_turns_running_idx")
      .on(table.threadId)
      .where(sql`${table.status} = 'running'`),
  ],
);
