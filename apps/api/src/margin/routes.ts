import { Hono } from "hono";
import { z } from "zod";

import { requireBrakeOverride } from "../safety/brake";
import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { signedRevokeSchema } from "../wallet/routes";
import type { SignedRevoke } from "../wallet/service";
import type { MarginProtection } from "./protection";
import type { MarginService } from "./service";

const TEXT_MAX = 40;
const LEVERAGE_MAX = 10;

const requestSchema = z.object({
  action: z.enum(["open", "close"]).optional(),
  market: z.string().max(TEXT_MAX).nullable().optional(),
  side: z.enum(["long", "short"]).nullable().optional(),
  margin: z.string().max(TEXT_MAX).nullable().optional(),
  leverage: z.number().min(1).max(LEVERAGE_MAX).nullable().optional(),
  positionId: z.uuid().nullable().optional(),
  fraction: z.number().gt(0).max(1).nullable().optional(),
});
/** `override`: the person confirmed a braked (risky) action on its card. */
const simulateSchema = z.object({ version: z.number().int().positive() });
const approveSchema = z.object({ version: z.number().int().positive(), override: z.boolean().optional() });
const signatureSchema = z.object({ approvalId: z.uuid(), signedTransaction: z.string().regex(/^0x[0-9a-fA-F]*$/) });
const networkSchema = z.enum(["mainnet", "testnet"]);
const PRICE_MAX = 32;
const SIGNATURES_MAX = 10;
const price = z.string().max(PRICE_MAX).nullable().optional();
const protectSchema = z.object({ takeProfit: price, stopLoss: price });
/** The six grants, and the revoke of the ones they replace, signed in the same yes (the api turns those off first). */
const activateSchema = z.object({ signatures: z.array(z.object({ grantId: z.uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) })).max(SIGNATURES_MAX), revoke: signedRevokeSchema.optional() });
const positionSchema = z.object({ positionId: z.uuid() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function marginRoutes(margin: MarginService, protection?: MarginProtection) {
  const app = new Hono<AppEnv>();
  // Markets are public data (R13): a guest sees them too, on the network they name (mainnet by default).
  // Public data: the network asked for (Markets' Long or short board reads mainnet's for everyone, a testnet session
  // included), else the session's, else mainnet. The session's used to win, so a testnet guest's board came back empty.
  app.get("/markets", async (c) => {
    const asked = networkSchema.safeParse(c.req.query("network"));
    const network = asked.success ? asked.data : (c.get("user")?.activeNetwork ?? "mainnet");
    return c.json(await margin.markets(network));
  });
  app.use("/positions", requireUser);
  app.get("/positions", async (c) => c.json({ positions: await margin.positions(c.get("user")!) }));
  // Take-profit / stop-loss: the grants Kawase closes a position under (signed together), and each position's targets.
  if (protection) {
    app.use("/protection", requireAccount);
    app.use("/protection/*", requireAccount);
    const position = (id: string | undefined) => (id === undefined ? undefined : positionSchema.shape.positionId.safeParse(id).success ? id : undefined);
    app.get("/protection", async (c) => c.json(await protection.view(c.get("user")!, position(c.req.query("positionId")))));
    app.post("/protection/grant", async (c) => {
      const input = await parse(positionSchema, await c.req.json().catch(() => ({})));
      return c.json(await protection.requestGrant(c.get("user")!, input.positionId));
    });
    app.post("/protection/grant/activate", async (c) => {
      const input = await parse(activateSchema, await c.req.json());
      const signatures = input.signatures.map((entry) => ({ grantId: entry.grantId, signature: entry.signature as `0x${string}` }));
      return c.json(await protection.activate(c.get("user")!, signatures, input.revoke as SignedRevoke | undefined));
    });
    // No position named: every position's grants (and any from before grants were per position).
    app.delete("/protection/grant", async (c) => c.json(await protection.revoke(c.get("user")!, position(c.req.query("positionId")))));
    app.put("/positions/:id/protection", requireAccount, async (c) => {
      const input = await parse(protectSchema, await c.req.json());
      return c.json(await protection.protect(c.get("user")!, c.req.param("id"), input));
    });
  }
  app.use("/orders/*", requireUser);
  app.use("/orders", requireUser);
  app.post("/orders", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await margin.create(c.get("user")!, input, { surface: "app" }) }, HTTP.created);
  });
  app.get("/orders/:id", async (c) => c.json({ intent: await margin.get(c.get("userId")!, c.req.param("id")) }));
  app.patch("/orders/:id", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json({ intent: await margin.revise(c.get("user")!, c.req.param("id"), input) });
  });
  app.post("/orders/:id/cancel", async (c) => c.json({ intent: await margin.cancel(c.get("userId")!, c.req.param("id")) }));
  // The rehearsal before the signature: this version run on the chain as it is now (nothing is sent).
  app.post("/orders/:id/simulate", requireAccount, async (c) => {
    const input = await parse(simulateSchema, await c.req.json());
    return c.json({ simulation: await margin.simulate(c.get("user")!, c.req.param("id"), input.version) });
  });
  app.post("/orders/:id/approve", requireAccount, async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    // The brake: a risky draft goes ahead only with the person's explicit override.
    requireBrakeOverride((await margin.get(c.get("userId")!, c.req.param("id"))).results, input.override);
    return c.json(await margin.approve(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }));
  });
  app.post("/orders/:id/signature", requireAccount, async (c) => {
    const input = await parse(signatureSchema, await c.req.json());
    return c.json(await margin.submitSignature(c.get("user")!, c.req.param("id"), { approvalId: input.approvalId, signedTransaction: input.signedTransaction as `0x${string}` }));
  });
  return app;
}
