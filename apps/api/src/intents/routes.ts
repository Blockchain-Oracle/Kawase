// `GET /intents/:id` (plan §A.4.11: "a tap opens the exact card (`/i/[intentId]`) on its network"): any money action
// of the person's by its id — a push, the inbox or an email link opens it — with its kind and network, read fresh
// (an expired draft expires, a moving one is tracked) by the same service that owns it. Someone else's id is
// simply not found.
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { IntentLookup } from "@kawase/api-client";
import { intents, type Db } from "@kawase/db";

import { requireUser } from "../auth/middleware";
import type { BridgeService } from "../bridge/service";
import type { EarnService } from "../earn/service";
import { HTTP, problem } from "../http/problem";
import type { SendService } from "../send/service";
import type { SwapService } from "../swap/service";
import type { AppEnv } from "../types";

export function intentRoutes(deps: { db: Db; sends: SendService; swaps: SwapService; bridges: BridgeService; earn: EarnService }) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  app.get("/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    const userId = c.get("userId")!;
    const [row] = await deps.db
      .select({ kind: intents.kind, network: intents.network, threadId: intents.threadId, request: intents.request })
      .from(intents)
      .where(and(eq(intents.id, id.data), eq(intents.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    const base = { network: row.network, threadId: row.threadId };
    let found: IntentLookup;
    switch (row.kind) {
      case "send":
        found = { kind: "send", ...base, intent: await deps.sends.get(userId, id.data) };
        break;
      case "swap":
        found = { kind: "swap", ...base, intent: await deps.swaps.get(userId, id.data) };
        break;
      case "bridge":
        found = { kind: "bridge", ...base, intent: await deps.bridges.get(userId, id.data) };
        break;
      case "earn":
        found = { kind: "earn", ...base, intent: await deps.earn.get(userId, id.data) };
        break;
      default: {
        const positionId = (row.request as { positionId?: string | null }).positionId ?? null;
        found = { kind: "margin", ...base, positionId };
      }
    }
    return c.json(found);
  });
  return app;
}
