// Split a bill: create (equal or by hand), list, one split with who has paid, cancel what is still open.
import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { SPLIT_PEOPLE_MAX, SPLIT_TITLE_MAX, type SplitService } from "./service";

const NAME_MAX = 80;
const amountText = z.string().regex(/^\d+(\.\d+)?$/);
const schema = z.object({
  title: z.string().trim().min(1).max(SPLIT_TITLE_MAX),
  /** "USDC", "EURC", a verified symbol or any token's address on the active network (R1). */
  asset: z.string().regex(/^(0x[0-9a-fA-F]{40}|[A-Za-z0-9.]{1,16})$/),
  total: amountText,
  includeMe: z.boolean(),
  people: z
    .array(z.object({ name: z.string().trim().min(1).max(NAME_MAX), amount: amountText.optional(), ask: z.boolean().optional() }))
    .min(1)
    .max(SPLIT_PEOPLE_MAX),
});

export function splitRoutes(splits: SplitService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.get("/", async (c) => c.json({ splits: await splits.list(c.get("userId")!) }));
  app.post("/", requireAccount, async (c) => {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json({ split: await splits.create(c.get("user")!, parsed.data) }, HTTP.created);
  });
  app.get("/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    return c.json({ split: await splits.get(c.get("userId")!, id.data) });
  });
  app.post("/:id/cancel", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    return c.json({ split: await splits.cancel(c.get("userId")!, id.data) });
  });
  return app;
}
