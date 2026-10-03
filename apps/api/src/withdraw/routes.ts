import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { WithdrawService } from "./service";

const TEXT_MAX = 80;
const LABEL_MAX = 40;
const ASSETS_MAX = 25;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const assetSchema = z.object({
  asset: z.string().min(1).max(TEXT_MAX),
  amount: z.string().max(TEXT_MAX).nullable().optional(),
  as: z.enum(["itself", "cash"]).nullable().optional(),
});
const planSchema = z.object({
  assets: z.array(assetSchema).max(ASSETS_MAX).optional(),
  everything: z.boolean().optional(),
  place: z.string().max(TEXT_MAX).nullable().optional(),
  exchange: z.string().max(TEXT_MAX).nullable().optional(),
  chain: z.string().max(TEXT_MAX).nullable().optional(),
  address: z.string().max(TEXT_MAX).nullable().optional(),
});
const placeSchema = z.object({
  kind: z.enum(["exchange", "wallet"]),
  label: z.string().max(LABEL_MAX).nullable().optional(),
  brand: z.string().max(TEXT_MAX).nullable().optional(),
  chain: z.string().min(1).max(TEXT_MAX),
  address: z.string().regex(ADDRESS),
});
const renameSchema = z.object({ label: z.string().max(LABEL_MAX) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

/** `/withdrawals`: the exchange table and chains are public data (guests see them, R13); the plan needs a person. */
export function withdrawRoutes(withdraw: WithdrawService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.get("/exchanges", (c) => c.json({ exchanges: withdraw.exchanges(c.get("user")!.activeNetwork) }));
  app.get("/chains", (c) => c.json({ chains: withdraw.chainsFor(c.get("user")!.activeNetwork) }));
  app.post("/plan", requireAccount, async (c) => {
    const input = await parse(planSchema, await c.req.json());
    return c.json({ plan: await withdraw.plan(c.get("user")!, input) });
  });
  return app;
}

/** `/places`: My places, per network. */
export function placeRoutes(withdraw: WithdrawService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser, requireAccount);
  app.get("/", async (c) => c.json({ places: await withdraw.places(c.get("user")!) }));
  app.post("/", async (c) => {
    const input = await parse(placeSchema, await c.req.json());
    return c.json({ place: await withdraw.savePlace(c.get("user")!, input) }, HTTP.created);
  });
  app.patch("/:id", async (c) => {
    const input = await parse(renameSchema, await c.req.json());
    return c.json({ place: await withdraw.renamePlace(c.get("user")!, c.req.param("id"), input.label) });
  });
  app.delete("/:id", async (c) => {
    await withdraw.removePlace(c.get("user")!, c.req.param("id"));
    return c.json({ ok: true as const });
  });
  return app;
}
