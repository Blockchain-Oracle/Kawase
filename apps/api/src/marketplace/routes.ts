// The Agent wallet page and the marketplace (cards/marketplace.md). All on the person's active network.
import { Hono } from "hono";
import { z } from "zod";

import { MARKETPLACE_CATEGORIES } from "@kawase/config";

import { requireAccount, requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { signedRevokeSchema } from "../wallet/routes";
import type { MarketplaceService } from "./service";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const baseUnits = z.string().regex(/^\d+$/);
const QUERY_MAX = 200;
const NAME_MAX = 120;
const BLOCKED_MAX = 100;

const settingsSchema = z.object({
  dailyBudget: baseUnits.optional(),
  perCallCap: baseUnits.optional(),
  askFirst: z.boolean().optional(),
  allowedCategories: z.array(z.enum(MARKETPLACE_CATEGORIES)).optional(),
  blockedSellers: z.array(z.object({ key: z.string().min(1).max(NAME_MAX), name: z.string().min(1).max(NAME_MAX) })).max(BLOCKED_MAX).optional(),
});
/** `revoke`: the on-chain revoke of the grant this one replaces, signed in the same yes (when one was handed out). */
const grantSubmitSchema = z.object({ grantId: z.uuid(), signature: hex, revoke: signedRevokeSchema.optional() });
const topUpSchema = z.object({ amount: baseUnits });
const decideSchema = z.object({ decision: z.enum(["approve", "decline"]) });
const searchSchema = z.object({ q: z.string().max(QUERY_MAX).default(""), category: z.enum(MARKETPLACE_CATEGORIES).optional() });

const intParam = z.coerce.number().int().min(0);
const catalogSchema = z.object({
  category: z.enum(MARKETPLACE_CATEGORIES).optional(),
  q: z.string().max(QUERY_MAX).optional(),
  maxPrice: baseUnits.optional(),
  party: z.enum(["first", "third"]).optional(),
  rail: z.enum(["gateway", "eip3009"]).optional(),
  network: z.enum(["mainnet", "testnet"]).optional(),
  limit: intParam.optional(),
  offset: intParam.optional(),
});
const URL_MAX = 2_000;
const PARAM_MAX = 200;
const PARAMS_MAX = 20;
const METHOD_MAX = 10;
const params = z.record(z.string().max(NAME_MAX), z.string().max(PARAM_MAX)).refine((value) => Object.keys(value).length <= PARAMS_MAX);
/** One listed service, as the marketplace screen's "Try" names it. */
const serviceSchema = z.object({ url: z.url().max(URL_MAX), method: z.string().max(METHOD_MAX).optional(), pathParams: params.optional(), query: params.optional() });
/** A try from the screen: the drawer's own id, so a second tap in the same drawer is the same call (never paid twice). */
const trySchema = serviceSchema.extend({ tryId: z.uuid() });
const toolSchema = z.object({ group: z.string().max(NAME_MAX).optional(), q: z.string().max(QUERY_MAX).optional(), network: z.enum(["mainnet", "testnet"]).optional(), limit: intParam.optional(), offset: intParam.optional() });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function marketplaceRoutes(marketplace: MarketplaceService) {
  const app = new Hono<AppEnv>();

  /** Searching the catalog is public (guests can look at everything real, R13). */
  app.get("/services", requireUser, async (c) => {
    const input = await parse(searchSchema, { q: c.req.query("q") ?? "", category: c.req.query("category") });
    return c.json(await marketplace.search(c.get("user")!, input.q, input.category));
  });

  /**
   * The marketplace as tools (catalog.ts): categories with counts, tools with price per call, "calls per $1", 1P/3P and
   * the rail. Public data (guests browse); `network` defaults to the person's active one.
   */
  app.get("/catalog", requireUser, async (c) => {
    const input = await parse(catalogSchema, Object.fromEntries(new URL(c.req.url).searchParams));
    return c.json(await marketplace.catalog.list(marketplace.context(input.network ?? c.get("user")!.activeNetwork), { ...input, maxPrice: input.maxPrice ? BigInt(input.maxPrice) : undefined }));
  });
  app.get("/catalog/:key", requireUser, async (c) => {
    const input = await parse(toolSchema, Object.fromEntries(new URL(c.req.url).searchParams));
    const detail = await marketplace.catalog.tool(marketplace.context(input.network ?? c.get("user")!.activeNetwork), c.req.param("key"), input);
    if (!detail) throw problem(HTTP.notFound, "not_found", "no such service");
    return c.json(detail);
  });

  // The screen's "Try for $0.10" (Stage 3): first the seller's live 402 price (nothing paid), then one paid call through
  // the agent's own path (`buy`, unchanged: the person's caps, ask-first, blocked sellers and categories all apply). The
  // drawer's id stands in for a conversation, so the same call answered twice is paid once. What comes back is the
  // seller's text, untrusted: the screen shows it as plain text and nothing acts on it.
  app.post("/inspect", requireAccount, async (c) => {
    const input = await parse(serviceSchema, await c.req.json());
    return c.json(await marketplace.inspect(c.get("user")!, input));
  });
  app.post("/try", requireAccount, async (c) => {
    const { tryId, ...input } = await parse(trySchema, await c.req.json());
    return c.json(await marketplace.buy(c.get("user")!, input, { threadId: tryId, tainted: false }));
  });

  app.use("/agent-wallet/*", requireAccount);
  app.use("/agent-wallet", requireAccount);
  app.use("/purchases/*", requireAccount);
  app.use("/purchases", requireAccount);

  app.get("/agent-wallet", async (c) => c.json(await marketplace.view(c.get("user")!)));

  app.patch("/agent-wallet/settings", async (c) => {
    const input = await parse(settingsSchema, await c.req.json());
    return c.json({ settings: await marketplace.updateSettings(c.get("user")!, input) });
  });

  app.post("/agent-wallet/grant", async (c) => c.json(await marketplace.grantRequest(c.get("user")!)));

  app.post("/agent-wallet/grant/submit", async (c) => {
    const input = await parse(grantSubmitSchema, await c.req.json());
    const revoke = input.revoke ? { requestId: input.revoke.requestId, signed: input.revoke.signed as `0x${string}` } : undefined;
    return c.json(await marketplace.grantSubmit(c.get("user")!, input.grantId, input.signature as `0x${string}`, revoke));
  });

  app.post("/agent-wallet/top-up", async (c) => {
    const input = await parse(topUpSchema, await c.req.json());
    return c.json(await marketplace.topUp(c.get("user")!, BigInt(input.amount)));
  });

  app.post("/agent-wallet/return", async (c) => c.json(await marketplace.returnToWallet(c.get("user")!)));

  app.get("/purchases", async (c) => c.json({ purchases: await marketplace.purchases(c.get("user")!) }));

  app.post("/purchases/:id/decision", async (c) => {
    const input = await parse(decideSchema, await c.req.json());
    return c.json(await marketplace.decide(c.get("user")!, c.req.param("id"), input.decision));
  });

  return app;
}
