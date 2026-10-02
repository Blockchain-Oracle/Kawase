// `GET /public/stats`: aggregate counts for the showcase (no session needed; the global rate limit applies).
import { Hono } from "hono";

import { MS_PER_SECOND, PUBLIC_STATS_CACHE_MS } from "@kawase/config";

import type { AppEnv } from "../types";
import type { PublicStatsService } from "./service";

const CACHE_CONTROL = `public, max-age=${PUBLIC_STATS_CACHE_MS / MS_PER_SECOND}`;

export function publicRoutes(stats: PublicStatsService) {
  const app = new Hono<AppEnv>();
  app.get("/stats", async (c) => {
    c.header("cache-control", CACHE_CONTROL);
    return c.json(await stats.stats());
  });
  return app;
}
