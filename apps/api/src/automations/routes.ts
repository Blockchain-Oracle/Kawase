import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { AutomationService } from "./service";

const RECIPIENT_MAX = 80;
const AMOUNT_MAX = 40;
const NOTE_MAX = 140;
const ZONE_MAX = 64;
const MAX_WEEKDAY = 6;
const MAX_MONTHDAY = 28;

const inputSchema = z.object({
  recipient: z.string().min(1).max(RECIPIENT_MAX),
  amount: z.string().max(AMOUNT_MAX),
  asset: z.enum(["USDC", "EURC"]).optional(),
  every: z.enum(["day", "week", "month"]),
  weekday: z.number().int().min(0).max(MAX_WEEKDAY).optional(),
  monthday: z.number().int().min(1).max(MAX_MONTHDAY).optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  timezone: z.string().max(ZONE_MAX).optional(),
  note: z.string().max(NOTE_MAX).nullable().optional(),
});
const MAX_GRANTS = 3;
const autoSaveSchema = z.object({
  keep: z.string().max(AMOUNT_MAX).optional(),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  topUp: z.boolean().optional(),
  every: z.enum(["day", "week", "month"]).optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  timezone: z.string().max(ZONE_MAX).optional(),
});
const activateSchema = z.object({
  signatures: z
    .array(z.object({ grantId: z.uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }))
    .min(1)
    .max(MAX_GRANTS),
});

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function automationRoutes(automations: AutomationService) {
  const app = new Hono<AppEnv>();
  // Automations act on the person's money without asking again: accounts only.
  app.use("*", requireAccount);

  app.get("/", async (c) => c.json({ automations: await automations.list(c.get("user")!) }));
  app.post("/", async (c) => {
    const input = await parse(inputSchema, await c.req.json());
    return c.json({ automation: await automations.create(c.get("user")!, input) }, HTTP.created);
  });
  app.post("/auto-save", async (c) => {
    const input = await parse(autoSaveSchema, await c.req.json());
    return c.json({ automation: await automations.createAutoSave(c.get("user")!, input) }, HTTP.created);
  });
  app.get("/:id", async (c) => c.json({ automation: await automations.get(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/recheck", async (c) => c.json({ automation: await automations.recheck(c.get("user")!, c.req.param("id")) }));
  app.post("/:id/grant", async (c) => c.json(await automations.grantRequest(c.get("user")!, c.req.param("id"))));
  app.post("/:id/activate", async (c) => {
    const input = await parse(activateSchema, await c.req.json());
    const signatures = input.signatures.map((entry) => ({ grantId: entry.grantId, signature: entry.signature as `0x${string}` }));
    return c.json({ automation: await automations.activate(c.get("user")!, c.req.param("id"), { signatures }) });
  });
  app.post("/:id/pause", async (c) => c.json({ automation: await automations.pause(c.get("user")!, c.req.param("id")) }));
  app.post("/:id/resume", async (c) => c.json({ automation: await automations.resume(c.get("user")!, c.req.param("id")) }));
  app.post("/:id/skip", async (c) => c.json({ automation: await automations.skip(c.get("user")!, c.req.param("id")) }));
  app.post("/:id/cancel", async (c) => c.json(await automations.cancel(c.get("user")!, c.req.param("id"))));
  return app;
}
