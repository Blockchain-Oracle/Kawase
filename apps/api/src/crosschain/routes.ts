import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { CrossChainService } from "./service";

const TEXT_MAX = 80;

const requestSchema = z.object({
  direction: z.enum(["out", "in"]).optional(),
  asset: z.string().max(TEXT_MAX).nullable().optional(),
  amount: z.string().max(TEXT_MAX).nullable().optional(),
  destination: z.string().max(TEXT_MAX).nullable().optional(),
  source: z.string().max(TEXT_MAX).nullable().optional(),
  recipient: z.string().max(TEXT_MAX).nullable().optional(),
  route: z.enum(["cctp", "across", "relay"]).nullable().optional(),
});
const approveSchema = z.object({ version: z.number().int().positive() });
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: hex.optional(), signature: hex.optional() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function crossChainRoutes(crosschain: CrossChainService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.get("/elsewhere", async (c) => c.json(await crosschain.elsewhere(c.get("user")!)));
  app.post("/orders", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await crosschain.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/orders/:id", async (c) => c.json({ intent: await crosschain.get(c.get("userId")!, c.req.param("id")) }));
  app.patch("/orders/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await crosschain.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/orders/:id/cancel", async (c) => c.json({ intent: await crosschain.cancel(c.get("userId")!, c.req.param("id")) }));
  app.post("/orders/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await crosschain.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  app.post("/orders/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(
      await crosschain.submitSignature(c.get("user")!, c.req.param("id"), {
        approvalId: input.approvalId,
        signedTransaction: input.signedTransaction as `0x${string}` | undefined,
        signature: input.signature as `0x${string}` | undefined,
      }),
    );
  });
  return app;
}
