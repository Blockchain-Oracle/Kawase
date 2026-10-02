// The audit log (G9, cards/automate-safety.md "Audit: every write recorded"). Append-only; each row hashes the one
// before it, so a gap or an edit shows. Rows are written one at a time under a transaction-scoped advisory lock, so the
// chain never forks. A failure to audit is logged and never fails the person's action (the action already happened).
import { createHash } from "node:crypto";
import { desc, sql } from "drizzle-orm";

import { auditLog, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

/** One lock id for the whole chain (an arbitrary constant, unique to the audit log). */
const AUDIT_LOCK = 4_242_001;
const GENESIS = "genesis";

export type AuditEntry = {
  userId: string | null;
  /** user, agent, system, admin */
  actor: "user" | "agent" | "system" | "admin";
  actorRef?: string | undefined;
  action: string;
  subjectType?: string | undefined;
  subjectId?: string | undefined;
  network?: NetworkId | undefined;
  intentId?: string | undefined;
  checks?: Record<string, unknown> | undefined;
  decision?: string | undefined;
  reasonCode?: string | undefined;
  modelId?: string | undefined;
  toolCallId?: string | undefined;
  deviceId?: string | undefined;
  policyVersion?: string | undefined;
};

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    return v;
  });

export class AuditWriter {
  constructor(
    private readonly db: Db,
    private readonly log: Logger,
  ) {}

  async write(entry: AuditEntry): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_LOCK})`);
        const [last] = await tx.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(1);
        const prevHash = last?.hash ?? GENESIS;
        const createdAt = new Date();
        const row = {
          userId: entry.userId,
          actor: entry.actor,
          actorRef: entry.actorRef ?? null,
          action: entry.action,
          subjectType: entry.subjectType ?? null,
          subjectId: entry.subjectId ?? null,
          network: entry.network ?? null,
          intentId: entry.intentId ?? null,
          policyVersion: entry.policyVersion ?? null,
          checks: entry.checks ?? null,
          decision: entry.decision ?? null,
          reasonCode: entry.reasonCode ?? null,
          modelId: entry.modelId ?? null,
          toolCallId: entry.toolCallId ?? null,
          deviceId: entry.deviceId ?? null,
        };
        const hash = createHash("sha256").update(prevHash).update(canonical({ ...row, createdAt: createdAt.toISOString() })).digest("hex");
        await tx.insert(auditLog).values({ ...row, prevHash, hash, createdAt });
      });
    } catch (error) {
      this.log.error({ err: error, action: entry.action }, "audit write failed");
    }
  }

  /** Recomputes the chain over the last `limit` rows; true when every row hashes its predecessor. */
  async verify(limit: number): Promise<boolean> {
    const rows = (await this.db.select().from(auditLog).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(limit)).reverse();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      if (row.prevHash !== rows[i - 1]!.hash) return false;
      const { id: _id, hash, prevHash, createdAt, ...fields } = row;
      void _id;
      const expected = createHash("sha256").update(prevHash ?? GENESIS).update(canonical({ ...fields, createdAt: createdAt.toISOString() })).digest("hex");
      if (expected !== hash) return false;
    }
    return true;
  }
}
