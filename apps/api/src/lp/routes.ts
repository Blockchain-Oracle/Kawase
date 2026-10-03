import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { LpService } from "./service";

const TEXT_MAX = 64;
const depositSchema = z.object({ pool: z.string().max(TEXT_MAX), asset: z.string().max(TEXT_MAX), amount: z.string().max(TEXT_MAX) });
const submitSchema = z.object({ requestId: z.uuid(), signedTransaction: z.string().regex(/^0x[0-9a-fA-F]+$/) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

/** `/lp`: Aero pools are public market data (R13); quoting, positions and every transaction need an account. */
export function lpRoutes(lp: LpService) {
  const app = new Hono<AppEnv>();
  app.get("/pools", async (c) => c.json({ pools: await lp.pools() }));
  app.use("/quote", requireAccount);
  app.post("/quote", async (c) => c.json(await lp.quote(c.get("user")!, await parse(depositSchema, await c.req.json()))));
  app.use("/deposit", requireAccount);
  app.post("/deposit", async (c) => c.json(await lp.deposit(c.get("user")!, await parse(depositSchema, await c.req.json()))));
  app.use("/positions", requireAccount);
  app.use("/positions/*", requireAccount);
  app.get("/positions", async (c) => c.json(await lp.positions(c.get("user")!)));
  app.post("/positions/:id/withdraw", async (c) => c.json(await lp.withdraw(c.get("user")!, c.req.param("id"))));
  app.use("/claim", requireAccount);
  app.post("/claim", async (c) => c.json(await lp.claim(c.get("user")!)));
  app.use("/submit", requireAccount);
  app.post("/submit", async (c) => {
    const input = await parse(submitSchema, await c.req.json());
    return c.json(await lp.submit(c.get("user")!, input.requestId, input.signedTransaction as `0x${string}`));
  });
  return app;
}
