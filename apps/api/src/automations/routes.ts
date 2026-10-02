import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { NeedsYouService } from "./needs-you";
import type { AutomationService } from "./service";

const RECIPIENT_MAX = 80;
const TOKEN_MAX = 60;
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
/** Payroll signs one grant per person. */
const MAX_GRANTS = 20;
const MAX_PERCENT = 100;
const autoSaveSchema = z.object({
  keep: z.string().max(AMOUNT_MAX).optional(),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  topUp: z.boolean().optional(),
  every: z.enum(["day", "week", "month"]).optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  timezone: z.string().max(ZONE_MAX).optional(),
});
const ruleSchema = z.object({
  trigger: z.enum(["balance_above", "balance_below", "money_in", "price", "money_out"]),
  threshold: z.string().max(AMOUNT_MAX).optional(),
  from: z.string().max(RECIPIENT_MAX).optional(),
  minAmount: z.string().max(AMOUNT_MAX).optional(),
  action: z.enum(["bridge", "save", "notify", "send", "swap"]),
  destination: z.enum(["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"]).optional(),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  amountMode: z.enum(["fixed", "excess", "percent", "roundup"]).optional(),
  amount: z.string().max(AMOUNT_MAX).optional(),
  reserve: z.string().max(AMOUNT_MAX).optional(),
  percent: z.number().positive().max(MAX_PERCENT).optional(),
  recipient: z.string().max(RECIPIENT_MAX).optional(),
  asset: z.enum(["USDC", "EURC"]).optional(),
  capPerDay: z.string().max(AMOUNT_MAX).optional(),
  tokenIn: z.string().max(TOKEN_MAX).optional(),
  tokenOut: z.string().max(TOKEN_MAX).optional(),
  priceAmount: z.string().max(AMOUNT_MAX).optional(),
  minOut: z.string().max(AMOUNT_MAX).optional(),
  roundTo: z.string().max(AMOUNT_MAX).optional(),
});
const TOKEN_MAX_LINES = 20;
const scheduleFields = {
  every: z.enum(["day", "week", "month"]),
  weekday: z.number().int().min(0).max(MAX_WEEKDAY).optional(),
  monthday: z.number().int().min(1).max(MAX_MONTHDAY).optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  timezone: z.string().max(ZONE_MAX).optional(),
};
const payrollSchema = z.object({
  ...scheduleFields,
  lines: z.array(z.object({ recipient: z.string().min(1).max(RECIPIENT_MAX), amount: z.string().max(AMOUNT_MAX), asset: z.enum(["USDC", "EURC"]).optional() })).min(1).max(TOKEN_MAX_LINES),
  note: z.string().max(NOTE_MAX).nullable().optional(),
});
const dcaSchema = z.object({ ...scheduleFields, from: z.string().min(1).max(TOKEN_MAX), to: z.string().min(1).max(TOKEN_MAX), amount: z.string().max(AMOUNT_MAX) });
const editSchema = z.object({ ...scheduleFields, every: scheduleFields.every.optional(), amount: z.string().max(AMOUNT_MAX).optional(), note: z.string().max(NOTE_MAX).nullable().optional() });
const viaSchema = z.object({ via: z.enum(["app", "push", "web", "chat"]).optional() });
const activateSchema = z.object({
  signatures: z
    // An alert rule needs no grant (it moves no money); the service checks the exact grants each kind needs.
    .array(z.object({ grantId: z.uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }))
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
  app.post("/rule", async (c) => {
    const input = await parse(ruleSchema, await c.req.json());
    return c.json({ automation: await automations.createRule(c.get("user")!, input) }, HTTP.created);
  });
  app.post("/payroll", async (c) => {
    const input = await parse(payrollSchema, await c.req.json());
    return c.json({ automation: await automations.createPayroll(c.get("user")!, input) }, HTTP.created);
  });
  app.post("/dca", async (c) => {
    const input = await parse(dcaSchema, await c.req.json());
    return c.json({ automation: await automations.createDca(c.get("user")!, input) }, HTTP.created);
  });
  app.get("/:id", async (c) => c.json({ automation: await automations.get(c.get("userId")!, c.req.param("id")) }));
  /** Edit in place: narrowing now; widening answers with the new grant to sign. */
  app.patch("/:id", async (c) => {
    const input = await parse(editSchema, await c.req.json());
    return c.json(await automations.edit(c.get("user")!, c.req.param("id"), input));
  });
  app.post("/:id/edit/activate", async (c) => {
    const input = await parse(activateSchema, await c.req.json());
    const signatures = input.signatures.map((entry) => ({ grantId: entry.grantId, signature: entry.signature as `0x${string}` }));
    return c.json({ automation: await automations.editActivate(c.get("user")!, c.req.param("id"), { signatures }) });
  });
  /** Practice first: on without a grant, every run a "would have". */
  app.post("/:id/practice", async (c) => c.json({ automation: await automations.practice(c.get("user")!, c.req.param("id")) }));
  /** The next runs on fresh facts, the first dry-run on chain; nothing happens. */
  app.post("/:id/simulate", async (c) => c.json(await automations.simulate(c.get("user")!, c.req.param("id"))));
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

/** The Needs-you queue: steps automations may not take alone, answered once from anywhere (app, push, web, chat). */
export function needsYouRoutes(needsYou: NeedsYouService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => c.json(await needsYou.list(c.get("user")!)));
  app.get("/:id", async (c) => c.json({ item: await needsYou.get(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/approve", async (c) => {
    const input = await parse(viaSchema, await c.req.json().catch(() => ({})));
    return c.json(await needsYou.approve(c.get("user")!, c.req.param("id"), input.via ?? "app"));
  });
  app.post("/:id/decline", async (c) => {
    const input = await parse(viaSchema, await c.req.json().catch(() => ({})));
    return c.json({ item: await needsYou.decline(c.get("user")!, c.req.param("id"), input.via ?? "app") });
  });
  return app;
}
