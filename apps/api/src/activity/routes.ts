// Activity everywhere: `GET /activity?network=` (one row per outcome, every token) and `GET /activity/why/run/:id` (why an
// automation run went the way it did). A row with a transaction has its decision record at /history/why/:tx.
import { Hono } from "hono";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { ActivityFeedService } from "./service";

const network = z.enum(["mainnet", "testnet"]);

export function activityRoutes(feed: ActivityFeedService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => {
    const parsed = network.safeParse(c.req.query("network") ?? c.get("user")!.activeNetwork);
    if (!parsed.success) throw problem(HTTP.badRequest, "validation");
    return c.json(await feed.list(c.get("user")!, parsed.data));
  });
  app.get("/why/run/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.badRequest, "validation");
    return c.json({ why: await feed.whyRun(c.get("user")!, id.data) });
  });
  return app;
}
