// `GET /feed?network=` — the agent's feed: Done · Held · Skipped · Watching · Found, with the next run's countdown
// (service.ts). The lead mounts it: `app.route("/feed", feedRoutes(new FeedService(db, { activity, suggestions }, log)))`.
import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { FeedService } from "./service";

const network = z.enum(["mainnet", "testnet"]);

export function feedRoutes(feed: FeedService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => {
    const parsed = network.safeParse(c.req.query("network") ?? c.get("user")!.activeNetwork);
    if (!parsed.success) throw problem(HTTP.badRequest, "validation");
    return c.json(await feed.get(c.get("user")!, parsed.data));
  });
  return app;
}
