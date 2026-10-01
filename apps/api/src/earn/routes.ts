import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { EarnService } from "./service";

const AMOUNT_MAX = 40;

const requestSchema = z.object({
  action: z.enum(["deposit", "withdraw"]).optional(),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
  amount: z.string().max(AMOUNT_MAX).nullable().optional(),
});
const approveSchema = z.object({ version: z.number().int().positive() });
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: z.string().regex(/^0x[0-9a-fA-F]*$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function earnRoutes(earn: EarnService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/", async (c) => c.json(await earn.overview(c.get("user")!)));
  app.post("/intents", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await earn.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/intents/:id", async (c) => c.json({ intent: await earn.get(c.get("userId")!, c.req.param("id")) }));
  app.patch("/intents/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await earn.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/intents/:id/cancel", async (c) => c.json({ intent: await earn.cancel(c.get("userId")!, c.req.param("id")) }));
  app.post("/intents/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await earn.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  app.post("/intents/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(
      await earn.submitSignature(c.get("user")!, c.req.param("id"), {
        approvalId: input.approvalId,
        signedTransaction: input.signedTransaction as `0x${string}`,
      }),
    );
  });
  return app;
}
