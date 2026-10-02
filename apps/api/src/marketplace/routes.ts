// The Agent wallet page and the marketplace (cards/marketplace.md). All on the person's active network.
import { Hono } from "hono";
import { z } from "zod";

import { MARKETPLACE_CATEGORIES } from "@kawase/config";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { MarketplaceService } from "./service";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const baseUnits = z.string().regex(/^\d+$/);
const QUERY_MAX = 200;
const NAME_MAX = 120;
const BLOCKED_MAX = 100;

const settingsSchema = z.object({
  dailyBudget: baseUnits.optional(),
  perCallCap: baseUnits.optional(),
  askFirst: z.boolean().optional(),
  allowedCategories: z.array(z.enum(MARKETPLACE_CATEGORIES)).optional(),
  blockedSellers: z.array(z.object({ key: z.string().min(1).max(NAME_MAX), name: z.string().min(1).max(NAME_MAX) })).max(BLOCKED_MAX).optional(),
});
const grantSubmitSchema = z.object({ grantId: z.uuid(), signature: hex });
const topUpSchema = z.object({ amount: baseUnits });
const decideSchema = z.object({ decision: z.enum(["approve", "decline"]) });
const searchSchema = z.object({ q: z.string().max(QUERY_MAX).default(""), category: z.enum(MARKETPLACE_CATEGORIES).optional() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function marketplaceRoutes(marketplace: MarketplaceService) {
  const app = new Hono<AppEnv>();

  /** Searching the catalog is public (guests can look at everything real, R13). */
  app.get("/services", requireUser, async (c) => {
    const input = await parse(searchSchema, { q: c.req.query("q") ?? "", category: c.req.query("category") });
    return c.json(await marketplace.search(c.get("user")!, input.q, input.category));
  });

  app.use("/agent-wallet/*", requireAccount);
  app.use("/agent-wallet", requireAccount);
  app.use("/purchases/*", requireAccount);
  app.use("/purchases", requireAccount);

  app.get("/agent-wallet", async (c) => c.json(await marketplace.view(c.get("user")!)));

  app.patch("/agent-wallet/settings", async (c) => {
    const input = await parse(settingsSchema, await c.req.json());
    return c.json({ settings: await marketplace.updateSettings(c.get("user")!, input) });
  });

  app.post("/agent-wallet/grant", async (c) => c.json(await marketplace.grantRequest(c.get("user")!)));

  app.post("/agent-wallet/grant/submit", async (c) => {
    const input = await parse(grantSubmitSchema, await c.req.json());
    return c.json(await marketplace.grantSubmit(c.get("user")!, input.grantId, input.signature as `0x${string}`));
  });

  app.post("/agent-wallet/top-up", async (c) => {
    const input = await parse(topUpSchema, await c.req.json());
    return c.json(await marketplace.topUp(c.get("user")!, BigInt(input.amount)));
  });

  app.post("/agent-wallet/return", async (c) => c.json(await marketplace.returnToWallet(c.get("user")!)));

  app.get("/purchases", async (c) => c.json({ purchases: await marketplace.purchases(c.get("user")!) }));

  app.post("/purchases/:id/decision", async (c) => {
    const input = await parse(decideSchema, await c.req.json());
    return c.json(await marketplace.decide(c.get("user")!, c.req.param("id"), input.decision));
  });

  return app;
}
