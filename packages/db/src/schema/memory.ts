// What the agent remembers about a person (cards/agent-business.md, Memory): short facts they asked it to keep
// ("Mum is @adaeze", "prefers EURC"), each with the conversation it came from and when it was last used. The person
// sees, edits and forgets every one in Settings → Memory, and can turn memory off (`agent_preferences`).
import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, timestampTz, updatedAt } from "./common";
import { threads } from "./chat";
import { users } from "./identity";

export const memoryFacts = pgTable(
  "memory_facts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** In the person's own words, short (the agent reads every fact on every turn). */
    fact: text().notNull(),
    /** The conversation it was remembered in; null when added in Settings or the thread was deleted. */
    sourceThreadId: uuid().references(() => threads.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** The last turn whose reply or action relied on it (the agent says so in that reply). */
    lastUsedAt: timestampTz(),
  },
  (table) => [index("memory_facts_user_idx").on(table.userId, table.createdAt)],
);

/**
 * A long thread's rolling summary (context bounding): the older messages folded into a few sentences by the cheap
 * model, up to `throughMessageId`; the agent then reads the summary plus the recent messages. `actions` are the
 * tools' own results from the folded part, copied as they were (canonical), never paraphrased. It goes with its
 * thread (deleted or moved with it).
 */
export const threadDigests = pgTable("thread_digests", {
  threadId: uuid()
    .primaryKey()
    .references(() => threads.id, { onDelete: "cascade" }),
  summary: text().notNull(),
  throughMessageId: text().notNull(),
  /** How many messages the summary covers. */
  folded: integer().notNull(),
  actions: jsonb().$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

/** One row per person, created on first change; no row means the defaults. */
export const agentPreferences = pgTable("agent_preferences", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Off: no fact is read or saved (the facts stay until forgotten). */
  memoryEnabled: boolean().notNull().default(true),
  updatedAt: updatedAt(),
});
