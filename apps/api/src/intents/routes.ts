// `GET /intents/:id` (plan §A.4.11: "a tap opens the exact card (`/i/[intentId]`) on its network"): any money action
// of the person's by its id — a push, the inbox or an email link opens it — with its kind and network, read fresh
// (an expired draft expires, a moving one is tracked) by the same service that owns it. Any other id a notification
// carries resolves too, so every link lands somewhere exact: an automation (its live card), one of its runs, an
// invoice, a Buy order, a split or a request. Someone else's id is simply not found.
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { IntentLookup } from "@kawase/api-client";
import { automationRuns, automations, intents, invoices, onrampOrders, paymentRequests, splits, type Db } from "@kawase/db";

import { requireUser } from "../auth/middleware";
import type { AutomationService } from "../automations/service";
import type { BridgeService } from "../bridge/service";
import type { EarnService } from "../earn/service";
import { HTTP, problem } from "../http/problem";
import type { OnrampService } from "../onramp/service";
import type { SendService } from "../send/service";
import type { SwapService } from "../swap/service";
import type { AppEnv } from "../types";

type Deps = {
  db: Db;
  sends: SendService;
  swaps: SwapService;
  bridges: BridgeService;
  earn: EarnService;
  automations?: AutomationService | undefined;
  onramp?: OnrampService | undefined;
};

/** An id that is not an intent: which of the person's other things it is, if any. */
async function other(deps: Deps, userId: string, id: string): Promise<IntentLookup | undefined> {
  const { db } = deps;
  const [automation, run, invoice, order, split, request] = await Promise.all([
    db.select({ network: automations.network, threadId: automations.threadId }).from(automations).where(and(eq(automations.id, id), eq(automations.userId, userId))),
    db
      .select({ network: automations.network })
      .from(automationRuns)
      .innerJoin(automations, eq(automations.id, automationRuns.automationId))
      .where(and(eq(automationRuns.id, id), eq(automationRuns.userId, userId))),
    db.select({ network: invoices.network }).from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, userId))),
    db.select({ network: onrampOrders.network }).from(onrampOrders).where(and(eq(onrampOrders.id, id), eq(onrampOrders.userId, userId))),
    db.select({ network: splits.network }).from(splits).where(and(eq(splits.id, id), eq(splits.userId, userId))),
    db.select({ network: paymentRequests.network }).from(paymentRequests).where(and(eq(paymentRequests.id, id), eq(paymentRequests.userId, userId))),
  ]);
  if (automation[0] && deps.automations)
    return { kind: "automation", network: automation[0].network, threadId: automation[0].threadId, automation: await deps.automations.get(userId, id) };
  if (run[0]) return { kind: "automation_run", network: run[0].network, threadId: null, runId: id };
  if (invoice[0]) return { kind: "invoice", network: invoice[0].network, threadId: null, invoiceId: id };
  if (order[0] && deps.onramp) return { kind: "onramp", network: order[0].network, threadId: null, order: await deps.onramp.get(userId, id) };
  if (split[0]) return { kind: "split", network: split[0].network, threadId: null, splitId: id };
  if (request[0]) return { kind: "request", network: request[0].network, threadId: null, requestId: id };
  return undefined;
}

export function intentRoutes(deps: Deps) {
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
    if (!row) {
      const found = await other(deps, userId, id.data);
      if (!found) throw problem(HTTP.notFound, "not_found");
      return c.json(found);
    }
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
