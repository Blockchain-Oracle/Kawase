// Assets over HTTP. The portfolio is the person's own; token pages, charts, markets and search are public market
// data (R13: guests can look at everything real), read on the network the session is on, or the one asked for.
import { Hono, type Context } from "hono";
import { z } from "zod";

import { isNetworkId, networkForChainId, type NetworkId } from "@kawase/networks";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { AssetService } from "./service";
import { tokenTrades } from "./trades";
import type { Db } from "@kawase/db";
import { NETWORKS } from "@kawase/networks";

const QUERY_MAX = 64;
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const visibilitySchema = z.object({ address, visibility: z.enum(["auto", "shown", "hidden"]) });
const rangeSchema = z.enum(["1H", "1D", "1W", "1M", "1Y", "ALL"]);
const segmentSchema = z.enum(["trending", "new", "meme", "fx", "perps"]);
const watchSchema = z.object({ on: z.boolean() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

/** The network asked for, else the session's, else mainnet (where markets live). */
function networkOf(c: Context<AppEnv>): NetworkId {
  const asked = c.req.query("network");
  if (asked !== undefined) {
    if (!isNetworkId(asked)) throw problem(HTTP.badRequest, "validation", "unknown network");
    return asked;
  }
  return c.get("user")?.activeNetwork ?? "mainnet";
}

function networkOfChain(chainId: string): NetworkId {
  const network = networkForChainId(Number(chainId));
  if (!network) throw problem(HTTP.notFound, "not_found", "Kawase reads tokens on Arc only");
  return network.id;
}

export function portfolioRoutes(assets: AssetService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.get("/", async (c) => c.json({ portfolio: await assets.portfolio(c.get("user")!) }));
  /** Show a token the rules hid, hide one, or hand it back to the rules. */
  app.post("/visibility", requireAccount, async (c) => {
    const input = await parse(visibilitySchema, await c.req.json());
    return c.json(await assets.setVisibility(c.get("user")!, input.address, input.visibility));
  });
  return app;
}

export function tokenRoutes(assets: AssetService, db?: Db) {
  const app = new Hono<AppEnv>();
  app.get("/search", async (c) => {
    const query = (c.req.query("q") ?? "").slice(0, QUERY_MAX);
    return c.json({ results: await assets.search(c.get("user"), networkOf(c), query) });
  });
  app.get("/:chainId/:address", async (c) => {
    const tokenAddress = await parse(address, c.req.param("address"));
    return c.json({ token: await assets.token(c.get("user"), networkOfChain(c.req.param("chainId")), tokenAddress) });
  });
  /** The person's own: whether it is starred, and their trades' profit and loss. */
  app.get("/:chainId/:address/mine", requireUser, requireAccount, async (c) => {
    const tokenAddress = await parse(address, c.req.param("address"));
    const network = networkOfChain(c.req.param("chainId"));
    const user = c.get("user")!;
    const { prices } = await assets.prices(network, [tokenAddress.toLowerCase()]).catch(() => ({ prices: new Map<string, { priceUsd: number | null }>() }));
    const [watched, trades] = await Promise.all([
      assets.watched(user.id, network, tokenAddress),
      db ? tokenTrades(db, { userId: user.id, network, token: tokenAddress, usdc: NETWORKS[network].addresses.usdc, priceUsd: prices.get(tokenAddress.toLowerCase())?.priceUsd ?? null }) : Promise.resolve(null),
    ]);
    return c.json({ watched, trades });
  });
  app.post("/:chainId/:address/watch", requireUser, requireAccount, async (c) => {
    const tokenAddress = await parse(address, c.req.param("address"));
    const body = await parse(watchSchema, await c.req.json());
    return c.json(await assets.watch(c.get("user")!, networkOfChain(c.req.param("chainId")), tokenAddress, body.on));
  });
  app.get("/:chainId/:address/chart", async (c) => {
    const tokenAddress = await parse(address, c.req.param("address"));
    const range = await parse(rangeSchema, c.req.query("range") ?? "1D");
    return c.json({ range, candles: await assets.chart(networkOfChain(c.req.param("chainId")), tokenAddress, range) });
  });
  return app;
}

export function marketRoutes(assets: AssetService) {
  const app = new Hono<AppEnv>();
  /** The person's starred tokens (the Markets "Watchlist" segment). */
  app.get("/watchlist", requireUser, requireAccount, async (c) => c.json({ rows: await assets.watchlist(c.get("user")!, networkOf(c)) }));
  app.get("/", async (c) => {
    const segment = await parse(segmentSchema, c.req.query("segment") ?? "trending");
    return c.json({ market: await assets.markets(networkOf(c), segment) });
  });
  return app;
}

