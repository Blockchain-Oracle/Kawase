import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { SendService } from "./service";

const RECIPIENT_MAX = 80;
const AMOUNT_MAX = 40;
const NOTE_MAX = 140;
const TOKEN_MAX = 64;

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const requestSchema = z.object({
  /** Paying a payment request: its link token (recipient, asset and amount then come from the request). */
  requestToken: z.string().max(TOKEN_MAX).nullable().optional(),
  recipient: z.string().max(RECIPIENT_MAX).nullable().optional(),
  amount: z.string().max(AMOUNT_MAX).nullable().optional(),
  asset: z.enum(["USDC", "EURC"]).nullable().optional(),
  note: z.string().max(NOTE_MAX).nullable().optional(),
});
const approveSchema = z.object({ version: z.number().int().positive() });
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: hex });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function sendRoutes(sends: SendService) {
  const app = new Hono<AppEnv>();
  // Guests may draft (the draft then asks them to sign in first); only accounts approve.
  app.use("*", requireUser);

  app.post("/", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await sends.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/:id", async (c) => c.json({ intent: await sends.get(c.get("userId")!, c.req.param("id")) }));
  /** A fix or an edit: the same send, a new draft version. */
  app.patch("/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await sends.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/:id/cancel", async (c) => c.json({ intent: await sends.cancel(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await sends.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  app.post("/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(
      await sends.submitSignature(c.get("user")!, c.req.param("id"), {
        approvalId: input.approvalId,
        signedTransaction: input.signedTransaction as `0x${string}`,
      }),
    );
  });
  return app;
}
