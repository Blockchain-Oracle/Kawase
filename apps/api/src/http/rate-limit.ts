// A token bucket per key (ip or user) in memory: enough for one api instance. Replaced by a shared store if
// the api ever runs more than one instance.
import type { MiddlewareHandler } from "hono";

import { HTTP, problem } from "./problem";

const MS_PER_SECOND = 1000;
/** Above this many keys, buckets idle for a whole window (full again anyway) are dropped, so the map can't grow forever. */
const SWEEP_ABOVE = 10_000;

type Bucket = { tokens: number; updatedAt: number };

export type RateLimitOptions = {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
  /** Which key a request counts against; the default is the client ip. */
  keyOf?: (headers: Headers, userId?: string) => string;
};

export function createRateLimit({ limit, windowSeconds, keyOf }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = limit / (windowSeconds * MS_PER_SECOND);

  const windowMs = windowSeconds * MS_PER_SECOND;
  const sweep = (now: number) => {
    for (const [key, bucket] of buckets) if (now - bucket.updatedAt >= windowMs) buckets.delete(key);
  };

  const take = (key: string, now = Date.now()): boolean => {
    if (buckets.size > SWEEP_ABOVE) sweep(now);
    const bucket = buckets.get(key) ?? { tokens: limit, updatedAt: now };
    bucket.tokens = Math.min(limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return true;
  };

  const middleware: MiddlewareHandler<{ Variables: { userId?: string } }> = async (c, next) => {
    const key = keyOf
      ? keyOf(c.req.raw.headers, c.get("userId"))
      : (c.get("userId") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous");
    if (!take(key))
      throw problem(HTTP.tooManyRequests, "rate_limited", undefined, { retryAfterSeconds: windowSeconds });
    await next();
  };

  return { middleware, take };
}
