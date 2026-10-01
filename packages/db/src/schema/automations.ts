// Automations (Stage 8): something the person asked Kawase to do on a schedule ("every Tuesday send $1 to Alex"),
// bounded on chain by its own grant (a delegation pinned to the recipient, capped per period) and run by Kawase
// without asking again. Each occurrence is one row, unique per automation and scheduled time, so a run happens at
// most once however often the runner looks; a run that cannot go says why.
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const automationStatusEnum = pgEnum("automation_status", ["draft", "active", "paused", "canceled", "ended"]);
export const automationKindEnum = pgEnum("automation_kind", ["scheduled_send"]);
export const automationRunStatusEnum = pgEnum("automation_run_status", ["executing", "succeeded", "skipped", "failed"]);

/** When it runs: every day, week (on a weekday) or month (on a day of the month), at a local time in a time zone. */
export type AutomationSchedule = {
  every: "day" | "week" | "month";
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  weekday?: number | undefined;
  /** 1–28, for monthly. */
  monthday?: number | undefined;
  /** "09:00", local to `timezone`. */
  time: string;
  timezone: string;
};

/** What it does: send exactly this amount of this token to this resolved recipient. */
export type AutomationAction = {
  recipientWords: string;
  recipientAddress: string;
  recipientName: string | null;
  asset: "USDC" | "EURC";
  /** Base units. */
  amount: string;
  note: string | null;
};

export const automations = pgTable(
  "automations",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    kind: automationKindEnum().notNull(),
    status: automationStatusEnum().notNull().default("draft"),
    /** The chat that made it, if any. */
    threadId: uuid(),
    schedule: jsonb().$type<AutomationSchedule>().notNull(),
    action: jsonb().$type<AutomationAction>().notNull(),
    /** The grant that bounds it on chain (set when it is turned on). */
    grantId: uuid(),
    /** The policy report when it was drafted: every check and the one that blocks turning it on. */
    report: jsonb().$type<{ results: unknown[]; blocking: unknown }>(),
    nextRunAt: timestampTz(),
    lastRunAt: timestampTz(),
    /** After this it ends by itself (the grant expires then too). */
    endsAt: timestampTz().notNull(),
    runsDone: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("automations_due_idx").on(table.status, table.nextRunAt),
    index("automations_user_idx").on(table.userId, table.network),
  ],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    automationId: uuid()
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduledFor: timestampTz().notNull(),
    status: automationRunStatusEnum().notNull().default("executing"),
    /** Why a run was skipped or failed, as a policy reason code. */
    reason: text(),
    reasonParams: jsonb().$type<Record<string, string>>(),
    intentId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("automation_runs_once_idx").on(table.automationId, table.scheduledFor),
    index("automation_runs_open_idx")
      .on(table.status)
      .where(sql`${table.status} = 'executing'`),
  ],
);
