// Every write is recorded (G9, cards/automate-safety.md "Audit: every write recorded"): each request that changed
// something — any method but GET/HEAD/OPTIONS, answered without an error — leaves one audit row naming who (the user and
// their device's session), what (the route pattern, never the raw URL: no tokens or names in the log), which object (the
// route's id), on which network, and the outcome. Services add richer rows of their own (intents, grants).
// Written after the response is decided and never awaited by it: auditing can never slow or fail the person's action.
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

import type { AppEnv } from "../types";
import type { AuditWriter } from "./writer";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);
const FIRST_ERROR_STATUS = 400;
/** Writes that are not the person's own actions (sign-in handshakes, the client's crash beacon). */
const NOT_ACTIONS = new Set(["/auth/nonce", "/client-events"]);
const ID_PARAMS = ["id", "token"] as const;

export function auditWrites(audit: AuditWriter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    if (READS.has(c.req.method) || c.res.status >= FIRST_ERROR_STATUS) return;
    const route = routePath(c, -1);
    if (NOT_ACTIONS.has(route)) return;
    const user = c.get("user");
    const subjectId = ID_PARAMS.map((name) => c.req.param(name)).find((value): value is string => Boolean(value));
    void audit.write({
      userId: c.get("userId") ?? null,
      actor: "user",
      actorRef: c.get("sessionId"),
      action: `${c.req.method} ${route}`,
      subjectId,
      network: user?.activeNetwork,
      decision: String(c.res.status),
      checks: { requestId: c.get("requestId") },
    });
  };
}
