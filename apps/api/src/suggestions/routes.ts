// Home's "For you": `GET /suggestions`, dismiss one, or mute a kind ("don't show this kind").
import { Hono } from "hono";
import { z } from "zod";

import { SUGGESTION_KINDS } from "@kawase/api-client";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { SuggestionService } from "./service";

const ID_MAX = 200;
const muteSchema = z.object({ muted: z.boolean() });

export function suggestionRoutes(suggestions: SuggestionService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/", async (c) => c.json(await suggestions.list(c.get("user")!)));

  app.post("/:id/dismiss", async (c) => {
    const id = z.string().min(1).max(ID_MAX).safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    await suggestions.dismiss(c.get("userId")!, id.data);
    return c.body(null, HTTP.noContent);
  });

  app.put("/kinds/:kind", async (c) => {
    const kind = z.enum(SUGGESTION_KINDS).safeParse(c.req.param("kind"));
    const parsed = muteSchema.safeParse(await c.req.json());
    if (!kind.success) throw problem(HTTP.notFound, "not_found");
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json({ muted: await suggestions.mute(c.get("userId")!, kind.data, parsed.data.muted) });
  });

  return app;
}
