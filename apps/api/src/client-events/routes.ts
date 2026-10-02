// `POST /client-events`: a failure the app saw on a phone the team can't watch (TestFlight, store builds), written
// to the api's log as one structured line so it can be read from Coolify. No account needed (sign-in is what
// usually fails) and nothing is stored. The app redacts before sending; the api redacts again before logging.
import { Hono } from "hono";
import { z } from "zod";

import { CLIENT_EVENT_LIMITS, redactDiagnostic } from "@kawase/api-client";

import { HTTP, problem } from "../http/problem";
import { createRateLimit } from "../http/rate-limit";
import type { AppEnv } from "../types";

/** Reports per minute per client ip: a failing retry loop on one phone must not flood the log. */
const REPORTS_PER_MINUTE = 20;
const SECONDS_PER_MINUTE = 60;
/** A longer message is cut rather than refused (the report matters more than its length), up to this many times the limit. */
const MESSAGE_SLACK = 4;

const field = z.string().max(CLIENT_EVENT_LIMITS.fieldMax);
const version = z.string().max(CLIENT_EVENT_LIMITS.versionMax);

const eventSchema = z.object({
  stage: field.min(1),
  outcome: z.literal("failed"),
  category: field.min(1),
  code: field.optional(),
  message: z.string().max(CLIENT_EVENT_LIMITS.messageMax * MESSAGE_SLACK).optional(),
  attemptId: z.uuid().optional(),
  appVersion: version.optional(),
  buildNumber: version.optional(),
  platform: field.min(1),
});

export function clientEventRoutes() {
  const app = new Hono<AppEnv>();
  const limit = createRateLimit({ limit: REPORTS_PER_MINUTE, windowSeconds: SECONDS_PER_MINUTE });
  app.use("*", limit.middleware);

  app.post("/", async (c) => {
    const parsed = eventSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const { message, code, ...event } = parsed.data;
    c.get("log").warn(
      {
        clientEvent: {
          ...event,
          ...(code ? { code: redactDiagnostic(code, CLIENT_EVENT_LIMITS.fieldMax) } : {}),
          ...(message ? { message: redactDiagnostic(message) } : {}),
        },
      },
      "client event",
    );
    return c.body(null, HTTP.noContent);
  });

  return app;
}
