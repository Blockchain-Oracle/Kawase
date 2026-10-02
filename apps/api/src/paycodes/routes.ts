// `POST /pay-codes/resolve`: what a scanned or pasted code means on the active network (guests too: they see what it
// is, and paying asks them to sign in).
import { Hono } from "hono";
import { z } from "zod";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { PayCodeService } from "./service";

const CODE_MAX = 2_000;
const schema = z.object({ code: z.string().trim().min(1).max(CODE_MAX) });

export function payCodeRoutes(codes: PayCodeService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.post("/resolve", async (c) => {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json(await codes.resolve(c.get("user")!, parsed.data.code));
  });
  return app;
}
