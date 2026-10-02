import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { OnrampService } from "./service";

const TEXT_MAX = 40;
const CODE_MAX = 64;

const startSchema = z.object({
  asset: z.string().max(TEXT_MAX).nullable().optional(),
  amount: z.string().max(TEXT_MAX).nullable().optional(),
  currency: z.string().max(TEXT_MAX).nullable().optional(),
  then: z.string().max(TEXT_MAX).nullable().optional(),
});
const eventSchema = z.object({ event: z.string().max(CODE_MAX), code: z.string().max(CODE_MAX).nullable().optional(), payload: z.record(z.string(), z.unknown()).optional() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function onrampRoutes(onramp: OnrampService) {
  const app = new Hono<AppEnv>();
  // Whether buying works here and why not (a guest sees "sign in", R2/R13).
  app.get("/", async (c) => c.json(await onramp.availability(c.get("user"))));
  // Circle's notifications: no session, the signature is the authentication.
  app.post("/webhooks/circle", async (c) => {
    const ok = await onramp.webhook(await c.req.text(), c.req.header("x-circle-signature"), c.req.header("x-circle-key-id"));
    return ok ? c.body(null, HTTP.noContent) : c.body(null, HTTP.unauthorized);
  });
  app.use("/orders/*", requireUser);
  app.use("/orders", requireUser);
  app.post("/orders", requireAccount, async (c) => {
    const input = await parse(startSchema, await c.req.json());
    return c.json(await onramp.start(c.get("user")!, input, "app"), HTTP.created);
  });
  app.get("/orders/:id", async (c) => c.json({ order: await onramp.get(c.get("userId")!, c.req.param("id")) }));
  app.post("/orders/:id/events", async (c) => {
    const input = await parse(eventSchema, await c.req.json());
    return c.json({ order: await onramp.event(c.get("userId")!, c.req.param("id"), input) });
  });
  return app;
}
