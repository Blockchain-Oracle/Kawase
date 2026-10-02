// `GET /search?q=` — the chat history sheet's search: every conversation, not just the titles already loaded.
import { Hono } from "hono";
import { z } from "zod";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { QUERY_MAX, type SearchService } from "./service";

const querySchema = z.object({ q: z.string().trim().min(1).max(QUERY_MAX) });

export function searchRoutes(search: SearchService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.get("/", async (c) => {
    const parsed = querySchema.safeParse({ q: c.req.query("q") ?? "" });
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json(await search.search(c.get("userId")!, parsed.data.q));
  });
  return app;
}
