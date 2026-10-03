// Who in my phone is on Kawase (I7, "import from device contacts (optional, privacy-gated)"): the app sends SHA-256
// hashes of the emails of the contacts the person chose (never the emails, names or numbers), and gets back the
// @handles of the accounts whose email matches — only accounts that let people who already have their email find them
// (`agent_preferences.discoverable`, on unless turned off), and never the person's own. Matching is by exact hash, so
// nothing is learned about anyone whose email the person did not already have. Unsalted email hashes can still be
// tried in bulk from a list (M11), so a check carries one address book at most and each person has a daily quota,
// counted from the audit log (one row per check, with how many fingerprints it carried).
import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { agentPreferences, auditLog, users, type Db } from "@kawase/db";

import type { AuditWriter } from "../audit/writer";
import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";

const CONTACTS_MAX = 500;
const HASHES_PER_CONTACT = 5;
const REF_MAX = 64;
const SHA256_HEX = /^[0-9a-f]{64}$/;
/** One phone's address book in a check (the app reads at most 500 people, most with one or two emails). */
const HASHES_PER_REQUEST = 1_000;
/** What one person can check in a day: their whole address book a few times over, far too few to sweep an email list. */
const HASHES_PER_DAY = 3_000;
const AUDIT_ACTION = "contacts.discovery";
const MS_PER_SECOND = 1000;

const matchSchema = z.object({
  contacts: z
    .array(z.object({ ref: z.string().min(1).max(REF_MAX), emailHashes: z.array(z.string().regex(SHA256_HEX)).max(HASHES_PER_CONTACT) }))
    .max(CONTACTS_MAX),
});
const meSchema = z.object({ discoverable: z.boolean() });

/** The start of today and of tomorrow, in UTC: the quota's day. */
function utcDay(now: Date): { start: Date; next: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, next: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)) };
}

export function discoveryRoutes(db: Db, audit: AuditWriter) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  /** Counts a check against today's quota, or refuses it with when the quota is back. */
  const spend = async (userId: string, count: number) => {
    const { start, next } = utcDay(new Date());
    await db.transaction(async (tx) => {
      // One check at a time per person (the app sends its batches one after another), so two sent together cannot
      // both fit under what is left; a second one is refused rather than left holding a connection while it waits.
      const lock = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${`${AUDIT_ACTION}:${userId}`}, 0)) as locked`);
      if (!lock.rows[0]?.locked) throw problem(HTTP.tooManyRequests, "rate_limited", undefined, { retryAfterSeconds: 1 });
      const [row] = await tx
        .select({ used: sql<string>`coalesce(sum((${auditLog.checks}->>'hashes')::int), 0)` })
        .from(auditLog)
        .where(and(eq(auditLog.userId, userId), eq(auditLog.action, AUDIT_ACTION), gte(auditLog.createdAt, start)));
      const used = Number(row?.used ?? 0);
      if (used + count > HASHES_PER_DAY)
        throw problem(HTTP.tooManyRequests, "discovery_quota", undefined, { limit: HASHES_PER_DAY, used, retryAfterSeconds: Math.ceil((next.getTime() - Date.now()) / MS_PER_SECOND) });
      // In this transaction: the check is counted, or it does not run.
      await audit.writeIn(tx, { userId, actor: "user", action: AUDIT_ACTION, checks: { hashes: count } });
    });
  };

  app.post("/match", requireAccount, async (c) => {
    const parsed = matchSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const hashes = [...new Set(parsed.data.contacts.flatMap((contact) => contact.emailHashes))];
    if (hashes.length === 0) return c.json({ matches: [] });
    if (hashes.length > HASHES_PER_REQUEST) throw problem(HTTP.unprocessable, "discovery_batch_too_large", undefined, { limit: HASHES_PER_REQUEST });
    await spend(c.get("userId")!, hashes.length);
    const hashed = sql<string>`encode(sha256(convert_to(lower(${users.email}), 'UTF8')), 'hex')`;
    const rows = await db
      .select({ hash: hashed, handle: users.handle, discoverable: agentPreferences.discoverable })
      .from(users)
      .leftJoin(agentPreferences, eq(agentPreferences.userId, users.id))
      .where(and(isNotNull(users.email), isNotNull(users.handle), eq(users.isAnonymous, false), ne(users.id, c.get("userId")!), inArray(hashed, hashes)));
    const byHash = new Map(rows.filter((row) => row.discoverable !== false && row.handle).map((row) => [row.hash, row.handle!]));
    const matches = parsed.data.contacts.flatMap((contact) => {
      const handle = contact.emailHashes.map((hash) => byHash.get(hash)).find(Boolean);
      return handle ? [{ ref: contact.ref, handle }] : [];
    });
    return c.json({ matches });
  });

  app.get("/me", async (c) => {
    const [row] = await db.select({ discoverable: agentPreferences.discoverable }).from(agentPreferences).where(eq(agentPreferences.userId, c.get("userId")!));
    return c.json({ discoverable: row?.discoverable ?? true });
  });

  app.put("/me", async (c) => {
    const parsed = meSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    await db
      .insert(agentPreferences)
      .values({ userId: c.get("userId")!, discoverable: parsed.data.discoverable })
      .onConflictDoUpdate({ target: agentPreferences.userId, set: { discoverable: parsed.data.discoverable, updatedAt: new Date() } });
    return c.json({ discoverable: parsed.data.discoverable });
  });

  return app;
}
