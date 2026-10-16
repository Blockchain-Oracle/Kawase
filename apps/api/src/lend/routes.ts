import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { LendService } from "./service";

const TEXT_MAX = 64;

const requestSchema = z.object({
  action: z.enum(["supply", "withdraw", "borrow", "repay"]).optional(),
  asset: z.string().max(TEXT_MAX).nullable().optional(),
  amount: z.string().max(TEXT_MAX).nullable().optional(),
  collateralAsset: z.string().max(TEXT_MAX).nullable().optional(),
  collateralAmount: z.string().max(TEXT_MAX).nullable().optional(),
});
const simulateSchema = z.object({ version: z.number().int().positive() });
const approveSchema = z.object({ version: z.number().int().positive() });
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: z.string().regex(/^0x[0-9a-fA-F]*$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function lendRoutes(lend: LendService) {
  const app = new Hono<AppEnv>();
  // Where an asset can earn is public market data (R13).
  app.get("/options", async (c) => c.json(await lend.options(c.get("user"), (c.req.query("asset") ?? "USDC").slice(0, TEXT_MAX), c.req.query("amount")?.slice(0, TEXT_MAX) ?? null)));
  app.use("/account", requireUser);
  app.get("/account", async (c) => c.json(await lend.account(c.get("user")!)));
  app.use("/orders/*", requireUser);
  app.use("/orders", requireUser);
  app.post("/orders", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await lend.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/orders/:id", async (c) => c.json({ intent: await lend.get(c.get("userId")!, c.req.param("id")) }));
  app.patch("/orders/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await lend.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/orders/:id/cancel", async (c) => c.json({ intent: await lend.cancel(c.get("userId")!, c.req.param("id")) }));
  // The rehearsal before the signature: this version run on the chain as it is now (nothing is sent).
  app.post("/orders/:id/simulate", requireAccount, async (c) => {
    const input = await parse(simulateSchema, await c.req.json());
    return c.json({ simulation: await lend.simulate(c.get("user")!, c.req.param("id"), input.version) });
  });
  app.post("/orders/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await lend.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  app.post("/orders/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(await lend.submitSignature(c.get("user")!, c.req.param("id"), { approvalId: input.approvalId, signedTransaction: input.signedTransaction as `0x${string}` }));
  });
  return app;
}
