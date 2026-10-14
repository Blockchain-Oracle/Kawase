// `GET /feed?network=` — the agent's feed: Done · Held · Skipped · Watching · Found, with the next run's countdown
// (service.ts). The lead mounts it: `app.route("/feed", feedRoutes(new FeedService(db, { activity, suggestions }, log)))`.
import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { FeedService } from "./service";

const network = z.enum(["mainnet", "testnet"]);
/** "<source>:<uuid>" with room to spare. */
const ITEM_ID_MAX = 80;

export function feedRoutes(feed: FeedService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => {
    const parsed = network.safeParse(c.req.query("network") ?? c.get("user")!.activeNetwork);
    if (!parsed.success) throw problem(HTTP.badRequest, "validation");
    return c.json(await feed.get(c.get("user")!, parsed.data));
  });
  // `GET /feed/item/:id` — one row with the race it came from and the person's words (the detail sheet).
  app.get("/item/:id", async (c) => {
    const parsed = network.safeParse(c.req.query("network") ?? c.get("user")!.activeNetwork);
    const id = c.req.param("id");
    if (!parsed.success || id.length > ITEM_ID_MAX) throw problem(HTTP.badRequest, "validation");
    const detail = await feed.detail(c.get("user")!, parsed.data, id);
    if (!detail) throw problem(HTTP.notFound, "not_found");
    return c.json(detail);
  });
  return app;
}
