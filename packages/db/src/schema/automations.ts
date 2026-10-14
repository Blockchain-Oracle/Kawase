// Automations (Stage 8): something the person asked Kawase to do on a schedule ("every Tuesday send $1 to Alex"), or
// to keep doing ("keep $20 ready, the rest earns" — Auto-save, checked on its schedule and whenever money arrives),
// bounded on chain by its own grants and run by Kawase without asking again. Each occurrence is one row, unique per automation and scheduled time, so a run happens at
// most once however often the runner looks; a run that cannot go says why.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, id, networkEnum, timestampTz, updatedAt } from "./common";
import { users } from "./identity";

export const automationStatusEnum = pgEnum("automation_status", ["draft", "active", "paused", "canceled", "ended"]);
/** "payroll" is retired (migration 0090): Postgres cannot drop an enum value, so it stays here, unused. */
export const automationKindEnum = pgEnum("automation_kind", ["scheduled_send", "auto_save", "rule", "payroll", "dca"]);
/** "pending": an event (money in) has triggered a run that the runner has not taken yet. */
/** "needs_you": waiting for the person (an attended step); "practiced": a practice run's "would have". */
export const automationRunStatusEnum = pgEnum("automation_run_status", ["executing", "succeeded", "skipped", "failed", "pending", "needs_you", "practiced"]);

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

/** Auto-save: keep `keep` ready in the wallet; above it goes into the person's own position in `vault`, and (with `topUp`) below it comes back. */
export type AutoSaveAction = {
  vault: string;
  vaultName: string;
  /** Base units of USDC. */
  keep: string;
  topUp: boolean;
};

/**
 * A rule: when something happens, do one supported thing (review A1: triggers, conditions and amounts independent of
 * the action). Balance triggers fire on crossing the threshold and re-arm once the balance is back on the other side;
 * money in fires once per matching receipt. Amounts are fixed, a share of the matched receipt, or what is above a
 * reserve. The step runs under its own grants (bridge: only to the wallet's own address on one chain; save: only into
 * the wallet's own vault position) or needs none (notify).
 */
export type RuleTrigger =
  | { type: "balance_above"; threshold: string }
  | { type: "balance_below"; threshold: string }
  | { type: "money_in"; minAmount: string | null; from: string | null; fromName: string | null }
  /**
   * A price, on the executable quote (07-automations-contacts-safety/automations.md: a feed is too coarse): fires when
   * `amountIn` of tokenIn would buy at least `minOut` of tokenOut right now. Its step is always attended.
   */
  | { type: "price"; tokenIn: string; tokenOut: string; symbolIn: string; symbolOut: string; decimalsIn: number; decimalsOut: number; amountIn: string; minOut: string }
  /** Each payment the person sends (round-ups). */
  | { type: "money_out" };
export type RuleAmount =
  | { mode: "fixed"; amount: string }
  | { mode: "excess"; reserve: string }
  | { mode: "percent"; percent: number }
  /** Up to the next whole `unit` of the payment that triggered it (round-ups). */
  | { mode: "roundup"; unit: string };
export type RuleStep =
  | { type: "bridge"; destination: string; destinationName: string; domain: number }
  | { type: "save"; vault: string; vaultName: string }
  | { type: "notify" }
  /** Send to someone else: pinned on chain to their address, at most `capPerDay` a day. */
  | { type: "send"; recipientWords: string; recipientAddress: string; recipientName: string | null; asset: "USDC" | "EURC"; capPerDay: string }
  /** A swap: always attended (a route cannot be pinned by caveats), it waits in Needs you with a fresh quote. */
  | { type: "swap"; tokenIn: string; tokenOut: string; symbolIn: string; symbolOut: string };
export type RuleAction = {
  trigger: RuleTrigger;
  amount: RuleAmount;
  step: RuleStep;
  /** Balance triggers: whether the next crossing fires (false after firing, until the balance is back below/above). */
  armed: boolean;
};

/** DCA: a swap on a schedule ("buy $10 of ARGUS every day"). Each run waits in Needs you with a fresh quote. */
export type DcaAction = { tokenIn: string; tokenOut: string; symbolIn: string; symbolOut: string; decimalsIn: number; decimalsOut: number; amount: string };

/** What one Auto-save run moved: into savings or back to the wallet, in USDC base units. */
export type AutomationMove = { direction: "in" | "out"; amount: string };

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
    /** A scheduled send's `AutomationAction`, or Auto-save's `AutoSaveAction` (by `kind`). */
    action: jsonb().$type<AutomationAction | AutoSaveAction | RuleAction | DcaAction>().notNull(),
    /** The grant that bounds it on chain (set when it is turned on). */
    grantId: uuid(),
    /** The request as it was asked, so a draft can be checked again after a fix without asking again. */
    request: jsonb().$type<Record<string, unknown>>(),
    /** The policy report when it was drafted: every check and the one that blocks turning it on. */
    report: jsonb().$type<{ results: unknown[]; blocking: unknown }>(),
    nextRunAt: timestampTz(),
    lastRunAt: timestampTz(),
    /** After this it ends by itself (the grant expires then too). */
    endsAt: timestampTz().notNull(),
    runsDone: integer().notNull().default(0),
    /** Practice: runs are dry-run on chain and recorded as "would have"; no grant, nothing moves. */
    practice: boolean().notNull().default(false),
    /** The run the 24 h reminder was last sent for. */
    remindedFor: timestampTz(),
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
    /** Auto-save: what this run moved. */
    move: jsonb().$type<AutomationMove>(),
    /** A rule run's evidence: what triggered it (the receipt, or the balance seen) and what it did. */
    trigger: jsonb().$type<Record<string, string>>(),
    /** For event-triggered runs, the event's identity (chain, tx, log): one run per event. */
    triggerRef: text(),
    intentId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("automation_runs_once_idx").on(table.automationId, table.scheduledFor),
    uniqueIndex("automation_runs_event_idx")
      .on(table.automationId, table.triggerRef)
      .where(sql`${table.triggerRef} is not null`),
    index("automation_runs_open_idx")
      .on(table.status)
      .where(sql`${table.status} = 'executing'`),
  ],
);

/**
 * The Needs-you queue (cards/automate-safety.md): a step an automation may not take alone — a swap, a payment over its
 * grant, or one its safety rules hold back (allowlist, cooldown) — waits here for the person, in Activity, the inbox and
 * a push. Approving re-checks everything and opens the same flow a person would use by hand; it is answered once, from
 * wherever, and anywhere else then shows that it already was.
 */
export type AttentionRequest =
  | { type: "send"; recipient: string; recipientAddress: string; name: string | null; asset: "USDC" | "EURC"; amount: string; note: string | null }
  | { type: "swap"; tokenIn: string; tokenOut: string; symbolIn: string; symbolOut: string; decimalsIn: number; amount: string; quotedOut: string | null; decimalsOut: number | null };

export const attentionItems = pgTable(
  "attention_items",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: networkEnum().notNull(),
    automationId: uuid().references(() => automations.id, { onDelete: "cascade" }),
    runId: uuid(),
    /** automation_step */
    kind: text().notNull(),
    /** Why it waits: a policy code (NOT_ON_ALLOWLIST, NEW_RECIPIENT_COOLDOWN, OVER_GRANT, SWAP_STEP, PRICE_REACHED). */
    reason: text().notNull(),
    reasonParams: jsonb().$type<Record<string, string>>(),
    request: jsonb().$type<AttentionRequest>().notNull(),
    /** pending | approved | declined | expired */
    status: text().$type<"pending" | "approved" | "declined" | "expired">().notNull().default("pending"),
    /** The send or swap the approval opened. */
    intentId: uuid(),
    intentKind: text().$type<"send" | "swap">(),
    decidedAt: timestampTz(),
    /** app | chat | voice | push | web */
    decidedVia: text(),
    expiresAt: timestampTz().notNull(),
    remindedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("attention_items_user_idx").on(table.userId, table.network, table.status, table.createdAt),
    uniqueIndex("attention_items_run_idx")
      .on(table.runId)
      .where(sql`${table.runId} is not null`),
  ],
);
