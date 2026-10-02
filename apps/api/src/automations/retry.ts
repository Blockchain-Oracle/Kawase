// Underfunded (X13): a scheduled run skipped because the wallet was short is tried once more when money arrives, while
// its period lasts — so "skip, notify, retry once on money in" holds without the person doing anything. A retry is a
// pending run keyed by the run it retries, so the same money arriving twice, or two arrivals, never retry it twice;
// a retry that is short again is not retried. The grant's period cap still bounds it on chain.
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, notLike, or } from "drizzle-orm";

import { automationRuns, automations, type Db } from "@kawase/db";
import { schedulePeriodSeconds } from "@kawase/intents";
import type { NetworkId } from "@kawase/networks";

type Executor = Pick<Db, "select" | "insert">;

const MS_PER_SECOND = 1_000;
/** Longer than any period (monthly runs use 28 days): 31 days. */
const LOOK_BACK_MS = 2_678_400_000;

export async function queueUnderfundedRetries(executor: Executor, userId: string, network: NetworkId) {
  const rows = await executor
    .select({ run: automationRuns, schedule: automations.schedule })
    .from(automationRuns)
    .innerJoin(automations, eq(automations.id, automationRuns.automationId))
    .where(
      and(
        eq(automationRuns.userId, userId),
        eq(automations.network, network),
        eq(automations.status, "active"),
        eq(automations.practice, false),
        inArray(automations.kind, ["scheduled_send"]),
        eq(automationRuns.status, "skipped"),
        eq(automationRuns.reason, "INSUFFICIENT_BALANCE"),
        gt(automationRuns.scheduledFor, new Date(Date.now() - LOOK_BACK_MS)),
        or(isNull(automationRuns.triggerRef), notLike(automationRuns.triggerRef, "retry:%")),
      ),
    );
  let queued = 0;
  for (const { run, schedule } of rows) {
    if (Date.now() > run.scheduledFor.getTime() + schedulePeriodSeconds(schedule) * MS_PER_SECOND) continue;
    const inserted = await executor
      .insert(automationRuns)
      .values({ automationId: run.automationId, userId, scheduledFor: new Date(), status: "pending", intentId: randomUUID(), triggerRef: `retry:${run.id}`, trigger: { retryOf: run.id } })
      .onConflictDoNothing()
      .returning({ id: automationRuns.id });
    queued += inserted.length;
  }
  return queued;
}
