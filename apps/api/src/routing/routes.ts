// POST /routes/race: the route race as a stream, one RouteRace JSON per line (NDJSON) as venues answer, the last
// with `done: true` (api-client `readRouteRace` reads it). Guests may race too (value first, sign last): quotes are
// read-only. Mount: `app.route("/routes", routeRaceRoutes(racer))` (the lead owns app.ts).
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { RaceInputError, type RouteRacer } from "./racer";

const TEXT_MAX = 64;
const AMOUNT_MAX = 40;
const asset = z.string().min(1).max(TEXT_MAX);
const amount = z.string().regex(/^\d+(\.\d+)?$/).max(AMOUNT_MAX);

const raceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("swap"), tokenIn: asset, tokenOut: asset, amount }),
  z.object({ kind: z.literal("bridge"), destination: asset, amount, asset: asset.nullable().optional(), toAsset: asset.nullable().optional(), recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional() }),
  z.object({ kind: z.literal("yield"), asset, amount: amount.nullable().optional() }),
]);

export function routeRaceRoutes(racer: RouteRacer) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.post("/race", async (c) => {
    const parsed = raceSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const user = c.get("user") ?? undefined;
    const request = parsed.data;
    let race;
    try {
      race = request.kind === "swap" ? await racer.swap(user, request) : request.kind === "bridge" ? await racer.bridge(user, request) : await racer.yield(user, request);
    } catch (error) {
      if (error instanceof RaceInputError) throw error.code === "network_unavailable" ? problem(HTTP.unprocessable, "network_unavailable") : problem(HTTP.unprocessable, "validation", error.code, { reason: error.code });
      throw error;
    }
    c.header("content-type", "application/x-ndjson; charset=utf-8");
    c.header("cache-control", "no-store");
    return stream(c, async (out) => {
      for await (const snapshot of race) {
        if (out.aborted) break;
        await out.write(`${JSON.stringify(snapshot)}\n`);
      }
    });
  });

  return app;
}
