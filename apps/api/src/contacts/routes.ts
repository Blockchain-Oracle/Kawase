import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { Recipients } from "../send/recipients";
import type { AppEnv } from "../types";
import type { ContactService } from "./service";

const NAME_MAX = 60;
const ALIAS_MAX = 40;
const ALIASES_MAX = 8;
const NOTES_MAX = 500;
const LABEL_MAX = 40;
const ADDRESS_INPUT_MAX = 80;
const QUERY_MAX = 80;

const source = z.enum(["typed", "pasted", "scanned", "handle", "received", "agent"]);
const createSchema = z.object({
  displayName: z.string().trim().min(1).max(NAME_MAX),
  address: z.string().trim().min(1).max(ADDRESS_INPUT_MAX),
  source: source.optional(),
  kind: z.enum(["person", "business"]).optional(),
  label: z.string().trim().max(LABEL_MAX).nullable().optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(ALIAS_MAX)).max(ALIASES_MAX).optional(),
});
const updateSchema = createSchema.omit({ address: true, source: true }).partial();
const changeSchema = z.object({ address: z.string().trim().min(1).max(ADDRESS_INPUT_MAX), source: source.optional() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function contactRoutes(contacts: ContactService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/", async (c) => c.json({ contacts: await contacts.list(c.get("userId")!) }));
  app.get("/:id", async (c) => c.json({ contact: await contacts.get(c.get("userId")!, c.req.param("id")) }));
  app.post("/", async (c) => {
    const input = await parse(createSchema, await c.req.json());
    return c.json({ contact: await contacts.create(c.get("userId")!, input) }, HTTP.created);
  });
  app.patch("/:id", async (c) => {
    const input = await parse(updateSchema, await c.req.json());
    return c.json({ contact: await contacts.update(c.get("userId")!, c.req.param("id"), input) });
  });
  /** A new address waits out the cooldown; payments to the contact are frozen until then. */
  app.post("/:id/address", async (c) => {
    const input = await parse(changeSchema, await c.req.json());
    return c.json({ contact: await contacts.changeAddress(c.get("userId")!, c.req.param("id"), input) });
  });
  app.delete("/:id/address/pending", async (c) =>
    c.json({ contact: await contacts.cancelChange(c.get("userId")!, c.req.param("id")) }),
  );
  app.delete("/:id", async (c) => {
    await contacts.remove(c.get("userId")!, c.req.param("id"));
    return c.body(null, HTTP.noContent);
  });
  return app;
}

/** The send screen's recipient search: contacts first, then an exact Kawase @handle. */
export function recipientRoutes(recipients: Recipients) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => {
    const query = (c.req.query("q") ?? "").slice(0, QUERY_MAX);
    return c.json({ matches: await recipients.search(c.get("userId")!, query) });
  });
  return app;
}
