// Who in my phone is on Kawase (I7, "import from device contacts (optional, privacy-gated)"): the app sends SHA-256
// hashes of the emails of the contacts the person chose (never the emails, names or numbers), and gets back the
// @handles of the accounts whose email matches — only accounts that let people who already have their email find them
// (`agent_preferences.discoverable`, on unless turned off), and never the person's own. Matching is by exact hash, so
// nothing is learned about anyone whose email the person did not already have.
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { agentPreferences, users, type Db } from "@kawase/db";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";

const CONTACTS_MAX = 500;
const HASHES_PER_CONTACT = 5;
const REF_MAX = 64;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const matchSchema = z.object({
  contacts: z
    .array(z.object({ ref: z.string().min(1).max(REF_MAX), emailHashes: z.array(z.string().regex(SHA256_HEX)).max(HASHES_PER_CONTACT) }))
    .max(CONTACTS_MAX),
});
const meSchema = z.object({ discoverable: z.boolean() });

export function discoveryRoutes(db: Db) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.post("/match", requireAccount, async (c) => {
    const parsed = matchSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const hashes = [...new Set(parsed.data.contacts.flatMap((contact) => contact.emailHashes))];
    if (hashes.length === 0) return c.json({ matches: [] });
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
