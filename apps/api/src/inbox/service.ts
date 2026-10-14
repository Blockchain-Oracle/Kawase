// The in-app inbox (J1): what happened, in one list per person — money received, a request paid, a send completed.
// It is the source of truth that push and email (Stage 9) will later read from. The same event reported twice is one
// item (a dedupe key per event).
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { InboxItem, InboxKind } from "@kawase/api-client";
import { inboxItems, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import { blockedAddresses } from "../contacts/blocks";
import type { NotifyService } from "../notify/service";
import type { Executor } from "../send/facts";
import type { Chains } from "../wallet/chain";

const PAGE = 100;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The exact thing an automation's item is about, from its dedupe key (`automation_skipped:<run>`, `rule_alert:<run>`,
 * `automation_reminder:<automation>:<at>`), so its push and inbox row open that run's story or that automation's card
 * rather than the list (plan §A.4.11). Params set by the producer win.
 */
export function subjectOf(kind: InboxKind, dedupeKey: string): Record<string, string> {
  const [, first] = dedupeKey.split(":");
  if (!first || !UUID.test(first)) return {};
  if (kind === "automation_skipped" || kind === "rule_alert") return { runId: first };
  if (kind === "automation_reminder") return { automationId: first };
  return {};
}

export type NewInboxItem = {
  userId: string;
  network: NetworkId;
  kind: InboxKind;
  params: Record<string, string>;
  dedupeKey: string;
  requestId?: string | null | undefined;
  intentId?: string | null | undefined;
  txHash?: string | null | undefined;
};

export class InboxService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    /** Push and email (Stage 9): queued with the item, in its transaction. */
    private readonly notify?: NotifyService,
  ) {}

  /** Adds the item and queues its push and email; false when the same event (its dedupe key) was already told. */
  async add(executor: Executor, item: NewInboxItem): Promise<boolean> {
    const [added] = await executor
      .insert(inboxItems)
      .values({
        userId: item.userId,
        network: item.network,
        kind: item.kind,
        params: { ...subjectOf(item.kind, item.dedupeKey), ...item.params },
        dedupeKey: item.dedupeKey,
        requestId: item.requestId ?? null,
        intentId: item.intentId ?? null,
        txHash: item.txHash ?? null,
      })
      .onConflictDoNothing({ target: inboxItems.dedupeKey })
      .returning({ id: inboxItems.id });
    // The same event reported again is not told again.
    if (added && this.notify) await this.notify.enqueue(executor, added.id, item.userId);
    return Boolean(added);
  }

  async list(userId: string): Promise<{ items: InboxItem[]; unread: number }> {
    const rows = await this.db
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.userId, userId))
      .orderBy(desc(inboxItems.createdAt))
      .limit(PAGE);
    const [count] = await this.db
      .select({ unread: sql<number>`count(*)::int` })
      .from(inboxItems)
      .where(and(eq(inboxItems.userId, userId), isNull(inboxItems.readAt)));
    // Asks from someone blocked since are not shown either (new ones never arrive: RequestService).
    const blocked = await blockedAddresses(this.db, userId);
    const shown = rows.filter((row) => !(row.kind === "request_received" && blocked.has(String((row.params as Record<string, string>).from ?? "").toLowerCase())));
    const hiddenUnread = rows.filter((row) => !row.readAt).length - shown.filter((row) => !row.readAt).length;
    return {
      unread: Math.max(0, (count?.unread ?? 0) - hiddenUnread),
      items: shown.map((row) => {
        const explorer = this.chains.get(row.network)?.network.viemChain.blockExplorers?.default.url;
        return {
          id: row.id,
          kind: row.kind,
          network: row.network,
          params: { ...subjectOf(row.kind, row.dedupeKey), ...row.params },
          requestId: row.requestId,
          intentId: row.intentId,
          txHash: row.txHash,
          explorerUrl: row.txHash && explorer ? `${explorer}/tx/${row.txHash}` : null,
          createdAt: row.createdAt.toISOString(),
          readAt: row.readAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async read(userId: string, id: string) {
    await this.db
      .update(inboxItems)
      .set({ readAt: new Date() })
      .where(and(eq(inboxItems.id, id), eq(inboxItems.userId, userId), isNull(inboxItems.readAt)));
  }

  async readAll(userId: string) {
    await this.db
      .update(inboxItems)
      .set({ readAt: new Date() })
      .where(and(eq(inboxItems.userId, userId), isNull(inboxItems.readAt)));
  }
}
