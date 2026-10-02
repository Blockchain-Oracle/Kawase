// Data & privacy (cards/automate-safety.md, capability matrix "Thread: … delete, export transcript"): how long Kawase
// keeps conversations (chat and voice transcripts are the same threads), deleting them all now, and exporting them.
// A retention period is enforced by a sweep that deletes threads whose last message is older than it.
import { and, asc, count, eq, lt, min, sql } from "drizzle-orm";

import type { PrivacySettings } from "@kawase/api-client";
import { threadMessages, threads, users, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";

import type { AuditWriter } from "../audit/writer";
import type { SessionUser } from "../types";

const MS_PER_DAY = 86_400_000;

type Part = { type?: string; text?: string; toolName?: string; state?: string };

export class PrivacyService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Db,
    private readonly audit: AuditWriter,
    private readonly log: Logger,
  ) {}

  async settings(userId: string): Promise<PrivacySettings> {
    const [[user], [stats]] = await Promise.all([
      this.db.select({ days: users.transcriptRetentionDays }).from(users).where(eq(users.id, userId)),
      this.db.select({ total: count(), oldest: min(threads.createdAt) }).from(threads).where(eq(threads.userId, userId)),
    ]);
    return { transcriptRetentionDays: user?.days ?? null, conversations: Number(stats?.total ?? 0), oldest: stats?.oldest ? new Date(stats.oldest).toISOString() : null };
  }

  async setRetention(user: SessionUser, days: number | null) {
    await this.db.update(users).set({ transcriptRetentionDays: days }).where(eq(users.id, user.id));
    await this.audit.write({ userId: user.id, actor: "user", action: "privacy.retention", checks: { days } });
    await this.sweepUser(user.id, days);
    return this.settings(user.id);
  }

  async deleteAll(user: SessionUser) {
    const removed = await this.db.delete(threads).where(eq(threads.userId, user.id)).returning({ id: threads.id });
    await this.audit.write({ userId: user.id, actor: "user", action: "privacy.transcripts_deleted", checks: { threads: removed.length } });
    return this.settings(user.id);
  }

  /** Every conversation, as readable text: who said what, and which cards Kawase showed. */
  async exportText(user: SessionUser) {
    const rows = await this.db
      .select({ thread: threads, message: threadMessages })
      .from(threads)
      .leftJoin(threadMessages, eq(threadMessages.threadId, threads.id))
      .where(eq(threads.userId, user.id))
      .orderBy(asc(threads.createdAt), asc(threadMessages.seq));
    const blocks: string[] = [];
    let current: string | undefined;
    for (const { thread, message } of rows) {
      if (thread.id !== current) {
        current = thread.id;
        blocks.push(`\n# ${thread.title ?? "Conversation"} (${thread.network}, ${thread.createdAt.toISOString()})\n`);
      }
      if (!message) continue;
      const text = (message.parts as Part[])
        .map((part) => (part.type === "text" ? part.text : part.type?.startsWith("tool-") ? `[${part.type.slice("tool-".length)}]` : ""))
        .filter(Boolean)
        .join(" ");
      if (text) blocks.push(`${message.role === "user" ? "You" : "Kawase"} (${message.createdAt.toISOString()}): ${text}`);
    }
    await this.audit.write({ userId: user.id, actor: "user", action: "privacy.transcripts_exported" });
    return `Kawase conversations — exported ${new Date().toISOString()}\n${blocks.join("\n")}\n`;
  }

  private async sweepUser(userId: string, days: number | null) {
    if (!days) return 0;
    const cutoff = new Date(Date.now() - days * MS_PER_DAY);
    const removed = await this.db
      .delete(threads)
      .where(and(eq(threads.userId, userId), lt(threads.lastMessageAt, cutoff)))
      .returning({ id: threads.id });
    return removed.length;
  }

  /** Deletes every conversation past its owner's retention period. */
  async sweep() {
    const removed = await this.db.execute<{ id: string }>(sql`
      delete from ${threads} t using ${users} u
      where t.user_id = u.id and u.transcript_retention_days is not null
        and t.last_message_at < now() - make_interval(days => u.transcript_retention_days)
      returning t.id`);
    if (removed.rows.length > 0) this.log.info({ threads: removed.rows.length }, "transcripts past retention deleted");
    return removed.rows.length;
  }

  start(intervalMs: number) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sweep().catch((error: unknown) => this.log.warn({ err: error }, "retention sweep failed"));
    }, intervalMs);
    this.timer.unref();
  }
}

