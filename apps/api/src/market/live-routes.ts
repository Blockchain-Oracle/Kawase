// GET /markets/live?tokens=0x…,0x…: live trades on Arc mainnet as a stream, one JSON per line (NDJSON, like the route
// race): first `{type:"snapshot", trades}` (the last ~30 minutes per token), then `{type:"trade", trade}` as swaps land,
// and `{type:"ping"}` every 15 s so proxies keep the line open. Public: market data needs no account (value first).
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { getAddress, isAddress, type Address } from "viem";

import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { LiveTrade, LiveTrades } from "./live";

const TOKENS_MAX = 30;
const PING_MS = 15_000;

export function liveTradeRoutes(live: LiveTrades) {
  const app = new Hono<AppEnv>();
  app.get("/", async (c) => {
    const tokens = (c.req.query("tokens") ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length === 0 || tokens.length > TOKENS_MAX || !tokens.every((token) => isAddress(token)))
      throw problem(HTTP.badRequest, "validation", `1 to ${TOKENS_MAX} token addresses`);
    const addresses = [...new Set(tokens.map((token) => getAddress(token)))] as Address[];
    c.header("content-type", "application/x-ndjson; charset=utf-8");
    c.header("cache-control", "no-store");
    c.header("x-accel-buffering", "no");
    return stream(c, async (out) => {
      const queue: LiveTrade[] = [];
      let wake: (() => void) | undefined;
      const { snapshot, stop } = await live.subscribe(addresses, (trade) => {
        queue.push(trade);
        wake?.();
      });
      const ping = setInterval(() => wake?.(), PING_MS);
      out.onAbort(() => {
        stop();
        clearInterval(ping);
        wake?.();
      });
      try {
        await out.write(`${JSON.stringify({ type: "snapshot", trades: snapshot })}\n`);
        while (!out.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = undefined;
            if (queue.length === 0 && !out.aborted) await out.write(`${JSON.stringify({ type: "ping" })}\n`);
          }
          while (queue.length > 0 && !out.aborted)
            await out.write(`${JSON.stringify({ type: "trade", trade: queue.shift() })}\n`);
        }
      } finally {
        stop();
        clearInterval(ping);
      }
    });
  });
  return app;
}
