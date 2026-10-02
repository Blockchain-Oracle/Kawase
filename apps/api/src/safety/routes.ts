import { Hono } from "hono";
import { isAddress } from "viem";
import { z } from "zod";

import { MS_PER_SECOND, SECONDS_PER_DAY } from "@kawase/config";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { SafetyService } from "./service";

const MAX_BOOST_DAYS = 30;
const MAX_COOLDOWN_S = MAX_BOOST_DAYS * SECONDS_PER_DAY;
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;
const units = z.string().regex(/^\d{1,40}$/);
const token = z.string().refine((value) => isAddress(value, { strict: false }), "expected a token address");
/** An end time in the future, at most 30 days away. */
const until = z.iso.datetime({ offset: true }).refine((value) => {
  const at = Date.parse(value);
  return at > Date.now() && at <= Date.now() + MAX_BOOST_DAYS * MS_PER_DAY;
}, "must be in the next 30 days");

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allowance"), token, perDay: units }),
  z.object({ kind: z.literal("allowance_off"), token }),
  z.object({ kind: z.literal("boost"), token, extra: units, until }),
  z.object({ kind: z.literal("per_payment"), value: units }),
  z.object({ kind: z.literal("per_payment_temp"), value: units, until }),
  z.object({ kind: z.literal("cooldown"), seconds: z.number().int().min(0).max(MAX_COOLDOWN_S), cap: units }),
  z.object({ kind: z.literal("allowlist_only"), on: z.boolean() }),
  z.object({ kind: z.literal("allowlist"), contactId: z.uuid(), on: z.boolean() }),
  z.object({ kind: z.literal("risk_mode"), mode: z.enum(["careful", "balanced", "autonomous"]) }),
  z.object({ kind: z.literal("practice"), on: z.boolean() }),
  z.object({ kind: z.literal("pause"), on: z.boolean() }),
]);
const requestSchema = z.object({ change: changeSchema, via: z.enum(["app", "chat", "voice"]).optional() });
const approveSchema = z.object({ signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

/** Wallet & limits on the person's active network. Only accounts: a guest has no wallet to limit. */
export function safetyRoutes(safety: SafetyService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/", async (c) => c.json(await safety.view(c.get("user")!)));
  app.get("/tokens", async (c) => c.json(await safety.tokens(c.get("user")!, c.req.query("address") || undefined)));
  /** A change: a tightening applies at once; a loosening answers with what the wallet signs. */
  app.post("/changes", async (c) => {
    const input = await parse(requestSchema, await c.req.json());
    return c.json(await safety.change(c.get("user")!, input.change, input.via ?? "app"));
  });
  app.post("/changes/:id/approve", async (c) => {
    const input = await parse(approveSchema, await c.req.json());
    return c.json(await safety.approve(c.get("user")!, c.req.param("id"), input.signature as `0x${string}`));
  });
  /** The exit kit: pause, then the one transaction that revokes every grant on this network. */
  app.post("/exit-kit", async (c) => c.json(await safety.exitKit(c.get("user")!)));
  return app;
}
