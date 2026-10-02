import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { TokenRulesService } from "./rules";

const changeSchema = z.object({
  access: z.enum(["verified", "warned"]).optional(),
  unverifiedPerTradeUsd: z.number().int().min(0).optional(),
  unverifiedPerDayUsd: z.number().int().min(0).optional(),
  maxPriceImpactBps: z.number().int().min(0).optional(),
});
const approveSchema = z.object({ changeId: z.uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

/** `/token-rules` (D12): read, change (tightening applies; loosening returns the message to sign), approve. */
export function tokenRulesRoutes(rules: TokenRulesService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser, requireAccount);
  app.get("/", async (c) => c.json({ rules: await rules.view(c.get("user")!) }));
  app.post("/", async (c) => c.json(await rules.change(c.get("user")!, await parse(changeSchema, await c.req.json()))));
  app.post("/approve", async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await rules.approve(c.get("user")!, input.changeId, input.signature as `0x${string}`));
  });
  return app;
}
