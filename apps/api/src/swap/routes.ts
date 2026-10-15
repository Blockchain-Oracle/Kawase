import { Hono } from "hono";
import { z } from "zod";

import { requireBrakeOverride } from "../safety/brake";
import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { SwapService } from "./service";
import { SWAP_VENUES } from "./venues";

const AMOUNT_MAX = 40;

/** A verified symbol ("USDC", "cirBTC") or any token address on the active network. */
const asset = z
  .string()
  .regex(/^(0x[0-9a-fA-F]{40}|[A-Za-z0-9.]{1,16})$/)
  .nullable()
  .optional();
/** `venue`: the swap venue the person picked from the route list; absent or null = the best. */
const requestSchema = z.object({ tokenIn: asset, tokenOut: asset, amount: z.string().max(AMOUNT_MAX).nullable().optional(), venue: z.enum(SWAP_VENUES).nullable().optional() });
/** `override`: the person confirmed a braked (risky) action on its card. */
const approveSchema = z.object({ version: z.number().int().positive(), override: z.boolean().optional() });
const simulateSchema = z.object({ version: z.number().int().positive() });
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: z.string().regex(/^0x[0-9a-fA-F]*$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function swapRoutes(swaps: SwapService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.post("/", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await swaps.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/:id", async (c) => c.json({ intent: await swaps.get(c.get("userId")!, c.req.param("id")) }));
  app.patch("/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await swaps.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/:id/cancel", async (c) => c.json({ intent: await swaps.cancel(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    // The brake: a risky draft goes ahead only with the person's explicit override.
    requireBrakeOverride((await swaps.get(c.get("userId")!, c.req.param("id"))).results, input.override);
    return c.json(await swaps.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  // The rehearsal before the signature: what this version would do on Arc's latest state (nothing sent, nothing kept).
  app.post("/:id/simulate", requireAccount, async (c) => {
    const input = await parse(simulateSchema, await c.req.json());
    return c.json({ simulation: await swaps.simulate(c.get("user")!, c.req.param("id"), input.version) });
  });
  app.post("/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(
      await swaps.submitSignature(c.get("user")!, c.req.param("id"), {
        approvalId: input.approvalId,
        signedTransaction: input.signedTransaction as `0x${string}`,
      }),
    );
  });
  return app;
}
