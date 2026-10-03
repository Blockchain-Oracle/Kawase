// `/fees/reserve`: the wallet's fee reserve ("~N actions left"); `/fx`: the display currency's rate (public).
import { Hono } from "hono";

import { requireAccount } from "../auth/middleware";
import type { AppEnv } from "../types";
import type { FeeService } from "./service";

export function feeRoutes(fees: FeeService) {
  const app = new Hono<AppEnv>();
  app.get("/reserve", requireAccount, async (c) => c.json({ reserve: await fees.reserve(c.get("user")!) }));
  return app;
}

export function fxRoutes(fees: FeeService) {
  const app = new Hono<AppEnv>();
  // The asked currency, else the person's own, else dollars.
  app.get("/", async (c) => c.json({ fx: await fees.fx(c.req.query("currency") ?? c.get("user")?.displayCurrency ?? "USD") }));
  return app;
}
