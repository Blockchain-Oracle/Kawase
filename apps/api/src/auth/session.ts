// Kawase's own device sessions: an opaque token the client keeps, its hash on the server.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { sessions, users, type Db } from "@kawase/db";

const TOKEN_BYTES = 32;
const MS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 86_400;
const SESSION_TTL_DAYS = 90;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * SECONDS_PER_DAY;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Db, userId: string, deviceId: string) {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * MS_PER_SECOND);
  const [session] = await db
    .insert(sessions)
    .values({ userId, deviceId, tokenHash: hashToken(token), expiresAt })
    .returning();
  if (!session) throw new Error("session insert returned no row");
  return { token, session };
}

export async function findSession(db: Db, token: string) {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    );
  return row;
}

export async function revokeSession(db: Db, sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Reads `Authorization: Bearer <token>`. */
export function bearerToken(headers: Headers): string | undefined {
  const header = headers.get("authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}
