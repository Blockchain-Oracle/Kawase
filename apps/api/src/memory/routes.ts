// Settings → Memory: every fact the agent keeps, edit, forget one or all, and turn memory off. Guests have memory
// too; it moves into their account when they sign in.
import { Hono } from "hono";
import { z } from "zod";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { FACT_MAX, type MemoryService } from "./service";

const factSchema = z.object({ fact: z.string().trim().min(1).max(FACT_MAX) });
const settingsSchema = z.object({ enabled: z.boolean() });

export function memoryRoutes(memory: MemoryService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/", async (c) => c.json(await memory.view(c.get("userId")!)));

  app.put("/settings", async (c) => {
    const parsed = settingsSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json(await memory.setEnabled(c.get("userId")!, parsed.data.enabled));
  });

  app.post("/facts", async (c) => {
    const parsed = factSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    // Added by hand in Settings: kept even while memory is off (it is read again once it is on).
    const result = await memory.remember(c.get("userId")!, parsed.data.fact, null, true);
    if (result.status !== "saved") throw problem(HTTP.conflict, "conflict", "memory_full", { limit: "limit" in result ? result.limit : undefined });
    return c.json({ fact: result.fact }, HTTP.created);
  });

  app.patch("/facts/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    const parsed = factSchema.safeParse(await c.req.json());
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const fact = await memory.edit(c.get("userId")!, id.data, parsed.data.fact);
    if (!fact) throw problem(HTTP.notFound, "not_found");
    return c.json({ fact });
  });

  app.delete("/facts/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    if (!(await memory.forget(c.get("userId")!, id.data))) throw problem(HTTP.notFound, "not_found");
    return c.body(null, HTTP.noContent);
  });

  app.delete("/facts", async (c) => {
    await memory.forgetAll(c.get("userId")!);
    return c.body(null, HTTP.noContent);
  });

  return app;
}
