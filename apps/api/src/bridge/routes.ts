import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { BridgeService } from "./service";

const AMOUNT_MAX = 40;

const requestSchema = z.object({
  destination: z.enum(["base", "ethereum", "arbitrum", "optimism", "polygon", "avalanche"]).nullable().optional(),
  amount: z.string().max(AMOUNT_MAX).nullable().optional(),
});
const approveSchema = z.object({ version: z.number().int().positive() });
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: z.string().regex(/^0x[0-9a-fA-F]*$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function bridgeRoutes(bridges: BridgeService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/destinations", (c) => c.json({ destinations: bridges.destinations(c.get("user")!.activeNetwork) }));
  app.post("/", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await bridges.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/:id", async (c) => c.json({ intent: await bridges.get(c.get("userId")!, c.req.param("id")) }));
  app.patch("/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await bridges.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/:id/cancel", async (c) => c.json({ intent: await bridges.cancel(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await bridges.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  app.post("/:id/simulate", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json({ simulation: await bridges.simulate(c.get("user")!, c.req.param("id"), input.version) });
  });
  app.post("/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(
      await bridges.submitSignature(c.get("user")!, c.req.param("id"), {
        approvalId: input.approvalId,
        signedTransaction: input.signedTransaction as `0x${string}`,
      }),
    );
  });
  return app;
}
