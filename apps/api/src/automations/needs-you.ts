// The Needs-you queue (cards/automate-safety.md "Automate anything"; stage 8c). A step an automation may not take on
// its own — a swap (R5: every swap is the person's own yes; a route cannot be pinned by caveats), a payment above its
// grant, or one the person's safety rules hold back (allowlist, new-recipient cooldown) — waits here, told in the inbox
// and by push, shown in Activity under "Needs you". Approving is answered once: the row is claimed under a conditional
// update, so a second tap — on another device, from the push, on the web — finds it answered and says when and where.
// Approving re-checks everything by opening the very flow a person would use by hand (a send or a swap with fresh
// facts and a fresh quote), which the person then confirms on its card. Unanswered items expire after a day; a run
// that waited ends as "not answered", never as sent.
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { formatUnits } from "viem";

import type { NeedsYouApproval, NeedsYouItem, SendIntent, SwapIntent } from "@kawase/api-client";
import { attentionItems, automationRuns, automations, type AttentionRequest, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { AuditWriter } from "../audit/writer";
import type { InboxService } from "../inbox/service";
import type { Executor } from "../send/facts";
import type { SendService } from "../send/service";
import type { SwapService } from "../swap/service";
import type { SessionUser } from "../types";

type ItemRow = typeof attentionItems.$inferSelect;

/** An item waits a day for an answer. */
export const NEEDS_YOU_TTL_MS = 86_400_000;
/** An item still waiting after half a day is told once more. */
const REMIND_AFTER_MS = 43_200_000;
const USDC_DECIMALS = 6;
const LIST_LIMIT = 50;

export type OpenNeedsYou = {
  userId: string;
  network: NetworkId;
  automationId: string | null;
  runId: string | null;
  reason: string;
  reasonParams?: Record<string, string> | undefined;
  request: AttentionRequest;
};

/** What the inbox row and the push say about an item (display values; the app formats them). */
function inboxParams(item: { id: string; reason: string; request: AttentionRequest }, reminder = false): Record<string, string> {
  const request = item.request;
  const common = { itemId: item.id, reason: item.reason, ...(reminder ? { reminder: "1" } : {}) };
  if (request.type === "send") return { ...common, type: "send", amount: request.amount, asset: request.asset, to: request.recipientAddress, ...(request.name ? { name: request.name } : {}) };
  return { ...common, type: "swap", amount: request.amount, symbolIn: request.symbolIn, symbolOut: request.symbolOut, decimalsIn: String(request.decimalsIn) };
}

export class NeedsYouService {
  private sends: SendService | undefined;
  private swaps: SwapService | undefined;
  private audit: AuditWriter | undefined;

  /** Every answer is recorded (G9); the why page reads it back. */
  setAudit(audit: AuditWriter) {
    this.audit = audit;
  }

  constructor(
    private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly log: Logger,
  ) {}

  /** The flows an approval opens (wired after construction: they are built alongside). */
  bind(flows: { sends: SendService; swaps: SwapService }) {
    this.sends = flows.sends;
    this.swaps = flows.swaps;
  }

  view(row: ItemRow, automationKind: string | null = null): NeedsYouItem {
    return {
      id: row.id,
      network: row.network,
      automationId: row.automationId,
      automationKind,
      reason: row.reason,
      reasonParams: row.reasonParams ?? null,
      request: row.request,
      status: row.status,
      intentId: row.intentId,
      intentKind: row.intentKind ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decidedVia: row.decidedVia,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Puts one step in the queue, marks its run as waiting, and tells the person (inbox + push), all at once. */
  async open(input: OpenNeedsYou, executor: Executor = this.db): Promise<ItemRow | undefined> {
    const run = async (tx: Executor) => {
      const [row] = await tx
        .insert(attentionItems)
        .values({
          userId: input.userId,
          network: input.network,
          automationId: input.automationId,
          runId: input.runId,
          kind: "automation_step",
          reason: input.reason,
          reasonParams: input.reasonParams ?? null,
          request: input.request,
          expiresAt: new Date(Date.now() + NEEDS_YOU_TTL_MS),
        })
        .onConflictDoNothing()
        .returning();
      if (!row) return undefined;
      if (input.runId) await tx.update(automationRuns).set({ status: "needs_you", reason: input.reason, reasonParams: input.reasonParams ?? null, updatedAt: new Date() }).where(eq(automationRuns.id, input.runId));
      await this.inbox.add(tx, { userId: input.userId, network: input.network, kind: "needs_you", params: inboxParams(row), dedupeKey: `needs_you:${row.id}` });
      return row;
    };
    const row = executor === this.db ? await this.db.transaction((tx) => run(tx)) : await run(executor);
    if (row) {
      this.log.info({ itemId: row.id, automationId: input.automationId, reason: input.reason }, "needs you");
      void this.audit?.write({ userId: input.userId, actor: "system", action: "needs_you.opened", subjectType: "attention_item", subjectId: row.id, network: input.network, checks: { automationId: input.automationId, runId: input.runId }, reasonCode: input.reason, decision: "waiting" });
    }
    return row;
  }

  async list(user: SessionUser) {
    const rows = await this.db
      .select({ item: attentionItems, kind: automations.kind })
      .from(attentionItems)
      .leftJoin(automations, eq(automations.id, attentionItems.automationId))
      .where(and(eq(attentionItems.userId, user.id), eq(attentionItems.network, user.activeNetwork)))
      .orderBy(desc(attentionItems.createdAt))
      .limit(LIST_LIMIT);
    const items = rows.map(({ item, kind }) => this.view(this.fresh(item), kind));
    return { items, pending: items.filter((item) => item.status === "pending").length };
  }

  async get(userId: string, id: string): Promise<NeedsYouItem> {
    const { row, kind } = await this.own(userId, id);
    return this.view(this.fresh(row), kind);
  }

  private async own(userId: string, id: string) {
    const [found] = await this.db
      .select({ item: attentionItems, kind: automations.kind })
      .from(attentionItems)
      .leftJoin(automations, eq(automations.id, attentionItems.automationId))
      .where(and(eq(attentionItems.id, id), eq(attentionItems.userId, userId)));
    if (!found) throw problem(HTTP.notFound, "not_found", "no such item");
    return { row: found.item, kind: found.kind };
  }

  /** A pending item past its time reads as expired even before the sweeper records it. */
  private fresh(row: ItemRow): ItemRow {
    return row.status === "pending" && row.expiresAt.getTime() < Date.now() ? { ...row, status: "expired" } : row;
  }

  /**
   * Yes, from anywhere. Claimed once (pending → approved under a conditional update); then the step opens as the same
   * send or swap a person would make by hand, checked again on fresh facts, for the person to confirm on its card.
   */
  async approve(user: SessionUser, id: string, via: string): Promise<NeedsYouApproval> {
    const { row, kind } = await this.own(user.id, id);
    if (row.status !== "pending") return { status: "answered", item: this.view(row, kind) };
    if (row.expiresAt.getTime() < Date.now()) {
      await this.expire([row]);
      return { status: "answered", item: this.view({ ...row, status: "expired" }, kind) };
    }
    if (row.network !== user.activeNetwork) throw problem(HTTP.conflict, "network_mismatch", `this waits on ${row.network}`);
    const [claimed] = await this.db
      .update(attentionItems)
      .set({ status: "approved", decidedAt: new Date(), decidedVia: via, updatedAt: new Date() })
      .where(and(eq(attentionItems.id, id), eq(attentionItems.status, "pending")))
      .returning();
    if (!claimed) {
      const { row: now } = await this.own(user.id, id);
      return { status: "answered", item: this.view(now, kind) };
    }
    const request = row.request;
    let opened: { kind: "send"; intent: SendIntent } | { kind: "swap"; intent: SwapIntent };
    try {
      if (request.type === "send") {
        if (!this.sends) throw new Error("sends are not wired");
        const intent = await this.sends.create(user, { recipient: request.recipientAddress, amount: formatUnits(BigInt(request.amount), USDC_DECIMALS), asset: request.asset, note: request.note }, { surface: "app" });
        opened = { kind: "send", intent };
      } else {
        if (!this.swaps) throw new Error("swaps are not wired");
        const intent = await this.swaps.create(user, { tokenIn: request.tokenIn, tokenOut: request.tokenOut, amount: formatUnits(BigInt(request.amount), request.decimalsIn) }, { surface: "app" });
        opened = { kind: "swap", intent };
      }
    } catch (error) {
      // Nothing opened: the item waits again, so a retry can answer it.
      await this.db.update(attentionItems).set({ status: "pending", decidedAt: null, decidedVia: null }).where(eq(attentionItems.id, id));
      throw error;
    }
    await this.db.transaction(async (tx) => {
      await tx.update(attentionItems).set({ intentId: opened.intent.id, intentKind: opened.kind, updatedAt: new Date() }).where(eq(attentionItems.id, id));
      // The run now follows the opened payment: the reconciler settles it from that intent's outcome.
      if (row.runId) await tx.update(automationRuns).set({ status: "executing", intentId: opened.intent.id, updatedAt: new Date() }).where(eq(automationRuns.id, row.runId));
    });
    this.log.info({ itemId: id, via, intentId: opened.intent.id }, "needs you approved");
    void this.audit?.write({ userId: user.id, actor: "user", action: "needs_you.approved", subjectType: "attention_item", subjectId: id, network: row.network, intentId: opened.intent.id, checks: { reason: row.reason, via }, decision: "opened" });
    const item = this.view({ ...claimed, intentId: opened.intent.id, intentKind: opened.kind }, kind);
    return opened.kind === "send" ? { status: "opened", item, kind: "send", intent: opened.intent } : { status: "opened", item, kind: "swap", intent: opened.intent };
  }

  async decline(user: SessionUser, id: string, via: string): Promise<NeedsYouItem> {
    const { row, kind } = await this.own(user.id, id);
    const [declined] = await this.db
      .update(attentionItems)
      .set({ status: "declined", decidedAt: new Date(), decidedVia: via, updatedAt: new Date() })
      .where(and(eq(attentionItems.id, id), eq(attentionItems.status, "pending")))
      .returning();
    if (!declined) return this.view(this.fresh(row), kind);
    if (row.runId) await this.db.update(automationRuns).set({ status: "skipped", reason: "DECLINED_BY_YOU", updatedAt: new Date() }).where(eq(automationRuns.id, row.runId));
    void this.audit?.write({ userId: user.id, actor: "user", action: "needs_you.declined", subjectType: "attention_item", subjectId: id, network: row.network, checks: { reason: row.reason, via }, decision: "declined" });
    return this.view(declined, kind);
  }

  private async expire(rows: ItemRow[]) {
    if (rows.length === 0) return;
    const ids = rows.map((row) => row.id);
    await this.db.update(attentionItems).set({ status: "expired", updatedAt: new Date() }).where(and(inArray(attentionItems.id, ids), eq(attentionItems.status, "pending")));
    const runs = rows.map((row) => row.runId).filter((id): id is string => Boolean(id));
    if (runs.length > 0) await this.db.update(automationRuns).set({ status: "skipped", reason: "NOT_ANSWERED", updatedAt: new Date() }).where(and(inArray(automationRuns.id, runs), eq(automationRuns.status, "needs_you")));
  }

  /** Expires what waited a day, and tells the person once more about what has waited half of one. */
  async sweep() {
    const now = new Date();
    const overdue = await this.db.select().from(attentionItems).where(and(eq(attentionItems.status, "pending"), lt(attentionItems.expiresAt, now)));
    await this.expire(overdue);
    const waiting = await this.db
      .select()
      .from(attentionItems)
      .where(and(eq(attentionItems.status, "pending"), isNull(attentionItems.remindedAt), lt(attentionItems.createdAt, new Date(now.getTime() - REMIND_AFTER_MS))));
    for (const row of waiting) {
      await this.db.transaction(async (tx) => {
        await tx.update(attentionItems).set({ remindedAt: now }).where(eq(attentionItems.id, row.id));
        await this.inbox.add(tx, { userId: row.userId, network: row.network, kind: "needs_you", params: inboxParams(row, true), dedupeKey: `needs_you_reminder:${row.id}` });
      });
    }
  }

  /** How many wait for this person on this network (the Activity badge). */
  async pendingCount(userId: string, network: NetworkId) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attentionItems)
      .where(and(eq(attentionItems.userId, userId), eq(attentionItems.network, network), eq(attentionItems.status, "pending")));
    return row?.count ?? 0;
  }
}
