import { Hono } from "hono";
import { z } from "zod";

import { REQUEST_NOTE_MAX } from "@kawase/config";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { InboxService } from "../inbox/service";
import type { AppEnv } from "../types";
import type { RequestService } from "./service";

const AMOUNT_MAX = 40;
const TOKEN_MAX = 64;
const PAYER_MAX = 80;

const createSchema = z.object({
  amount: z.string().trim().min(1).max(AMOUNT_MAX),
  /** "USDC", "EURC", a verified symbol or any token's address (R1). */
  asset: z.string().regex(/^(0x[0-9a-fA-F]{40}|[A-Za-z0-9.]{1,16})$/),
  note: z.string().max(REQUEST_NOTE_MAX).nullable().optional(),
  /** Who to ask in the app too: an @handle or a saved contact's name (a link only when it is neither). */
  payer: z.string().trim().max(PAYER_MAX).nullable().optional(),
});
const askSchema = z.object({ payer: z.string().trim().min(1).max(PAYER_MAX) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function requestRoutes(requests: RequestService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => c.json({ requests: await requests.list(c.get("userId")!) }));
  app.post("/", async (c) => {
    const input = await parse(createSchema, await c.req.json());
    return c.json({ request: await requests.create(c.get("user")!, input) }, HTTP.created);
  });
  app.get("/:id", async (c) => c.json({ request: await requests.get(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/cancel", async (c) => c.json({ request: await requests.cancel(c.get("userId")!, c.req.param("id")) }));
  app.post("/:id/ask", async (c) => {
    const { payer } = await parse(askSchema, await c.req.json().catch(() => undefined));
    return c.json({ request: await requests.ask(c.get("user")!, c.req.param("id"), payer) });
  });
  return app;
}

/** What a shared link shows to anyone who opens it; no session needed. */
export function publicRequestRoutes(requests: RequestService) {
  const app = new Hono<AppEnv>();
  app.get("/:token", async (c) => {
    const token = c.req.param("token").slice(0, TOKEN_MAX);
    return c.json({ request: await requests.openPublic(token) });
  });
  return app;
}

export function inboxRoutes(inbox: InboxService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => c.json(await inbox.list(c.get("userId")!)));
  app.post("/read-all", async (c) => {
    await inbox.readAll(c.get("userId")!);
    return c.body(null, HTTP.noContent);
  });
  app.post("/:id/read", async (c) => {
    await inbox.read(c.get("userId")!, c.req.param("id"));
    return c.body(null, HTTP.noContent);
  });
  return app;
}
