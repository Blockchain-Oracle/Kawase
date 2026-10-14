import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import { bearerToken } from "../auth/session";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { OnrampService } from "./service";

const TEXT_MAX = 40;
const CODE_MAX = 64;
const PHONE_MAX = 20;
const EMAIL_MAX = 254;
const ID_MAX = 100;
const PAGE_KEY_PREFIX = "kbuy_";
/** What the buy page's order key may do: read its one order, report its events, ask for a fresh session. Nothing else. */
const PAGE_PATH = /^\/onramp\/orders\/([0-9a-f-]{36})(?:\/(?:events|session))?$/;

const engineSchema = z.enum(["circle", "coinbase"]);
const methodSchema = z.enum(["apple_pay", "google_pay", "card", "bank"]);
const startSchema = z.object({
  asset: z.string().max(TEXT_MAX).nullable().optional(),
  amount: z.string().max(TEXT_MAX).nullable().optional(),
  currency: z.string().max(TEXT_MAX).nullable().optional(),
  then: z.string().max(TEXT_MAX).nullable().optional(),
  destination: z.enum(["wallet", "agent_wallet"]).nullable().optional(),
  engine: engineSchema.nullable().optional(),
  method: methodSchema.nullable().optional(),
  frame: z.enum(["page", "browser"]).nullable().optional(),
  coinbase: z
    .object({
      phone: z.string().max(PHONE_MAX),
      smsVerificationId: z.string().max(ID_MAX),
      email: z.string().max(EMAIL_MAX).nullable().optional(),
      emailVerificationId: z.string().max(ID_MAX),
      acceptedTerms: z.literal(true),
    })
    .nullable()
    .optional(),
});
const quoteSchema = z.object({ engine: engineSchema, amount: z.string().max(TEXT_MAX), currency: z.string().max(TEXT_MAX).nullable().optional(), method: methodSchema.nullable().optional() });
const verifySchema = z.object({ channel: z.enum(["sms", "email"]), destination: z.string().max(EMAIL_MAX).optional() });
const submitSchema = z.object({ otpCode: z.string().regex(/^\d{6}$/) });
const eventSchema = z.object({ event: z.string().max(CODE_MAX), code: z.string().max(CODE_MAX).nullable().optional(), payload: z.record(z.string(), z.unknown()).optional() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function onrampRoutes(onramp: OnrampService) {
  const app = new Hono<AppEnv>();
  // Whether buying works here and why not (a guest sees "sign in", R2/R13), and what each engine offers.
  app.get("/", async (c) => c.json(await onramp.availability(c.get("user"))));
  // Circle's notifications: no session, the signature is the authentication.
  app.post("/webhooks/circle", async (c) => {
    const ok = await onramp.webhook(await c.req.text(), c.req.header("x-circle-signature"), c.req.header("x-circle-key-id"));
    return ok ? c.body(null, HTTP.noContent) : c.body(null, HTTP.unauthorized);
  });
  // Kawase's own buy page runs in a WebView with no sign-in: its order key (in the URL fragment, sent as the bearer)
  // opens exactly the order's read, events and session. Anything else on the order paths needs a real session.
  app.use("/orders/*", async (c, next) => {
    const token = bearerToken(c.req.raw.headers);
    if (token?.startsWith(PAGE_KEY_PREFIX)) {
      const id = PAGE_PATH.exec(c.req.path)?.[1];
      const userId = id ? await onramp.pageKeyUser(id, token) : undefined;
      if (!userId) throw problem(HTTP.unauthorized, "unauthenticated");
      c.set("userId", userId);
      await next();
      return;
    }
    return requireUser(c, next);
  });
  app.use("/orders", requireUser);
  app.use("/quote", requireUser);
  app.use("/verifications", requireUser);
  app.use("/verifications/*", requireUser);
  app.post("/orders", requireAccount, async (c) => {
    const input = await parse(startSchema, await c.req.json());
    const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    return c.json(await onramp.start(c.get("user")!, input, "app", { clientIp }), HTTP.created);
  });
  app.get("/orders/:id", async (c) => c.json({ order: await onramp.get(c.get("userId")!, c.req.param("id")) }));
  app.post("/orders/:id/events", async (c) => {
    const input = await parse(eventSchema, await c.req.json());
    return c.json({ order: await onramp.event(c.get("userId")!, c.req.param("id"), input) });
  });
  app.post("/orders/:id/session", async (c) => c.json(await onramp.session(c.get("userId")!, c.req.param("id"))));
  app.post("/quote", requireAccount, async (c) => c.json(await onramp.quote(c.get("user")!, await parse(quoteSchema, await c.req.json()))));
  app.post("/verifications", requireAccount, async (c) => {
    const input = await parse(verifySchema, await c.req.json());
    return c.json(await onramp.verifyStart(c.get("user")!, input.channel, input.destination), HTTP.created);
  });
  app.post("/verifications/:id/submit", requireAccount, async (c) => {
    const input = await parse(submitSchema, await c.req.json());
    // The channel is only echoed back for the app's bookkeeping; Coinbase knows it from the verification id.
    const channel = c.req.query("channel") === "email" ? "email" : "sms";
    return c.json(await onramp.verifySubmit(c.get("user")!, c.req.param("id"), input.otpCode, channel));
  });
  return app;
}
