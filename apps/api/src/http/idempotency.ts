// Writes that carry an Idempotency-Key return the stored response on a retry, and refuse the key when the
// body differs (the same key must not stand for two different requests).
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { apiIdempotency, type Db } from "@kawase/db";

import { HTTP, problem } from "./problem";

const HEADER = "idempotency-key";
const MAX_KEY_LENGTH = 200;

const hashOf = (input: string) => createHash("sha256").update(input).digest("hex");

export function idempotency(db: Db): MiddlewareHandler<{ Variables: { userId: string } }> {
  return async (c, next) => {
    const key = c.req.header(HEADER);
    const userId = c.get("userId");
    if (!key || !userId || c.req.method === "GET") return next();
    if (key.length > MAX_KEY_LENGTH) throw problem(HTTP.badRequest, "validation", "Idempotency-Key is too long");

    const requestHash = hashOf(`${c.req.method} ${c.req.path}\n${await c.req.raw.clone().text()}`);
    const [stored] = await db
      .select()
      .from(apiIdempotency)
      .where(and(eq(apiIdempotency.userId, userId), eq(apiIdempotency.key, key)));
    if (stored) {
      if (stored.requestHash !== requestHash) throw problem(HTTP.unprocessable, "idempotency_mismatch");
      return c.json(stored.response, stored.status as never, { "idempotent-replayed": "true" });
    }

    await next();

    const response = c.res.clone();
    if (response.headers.get("content-type")?.includes("json")) {
      await db
        .insert(apiIdempotency)
        .values({ userId, key, requestHash, status: response.status, response: await response.json() })
        .onConflictDoNothing();
    }
  };
}
