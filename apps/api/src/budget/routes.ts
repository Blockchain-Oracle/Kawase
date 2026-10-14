// /budget (D38): the signed weekly budget, its ledger, and the leaf path for swaps and earn moves inside it.
//   GET  /                         the budget on the active network (or null), spent and left this week
//   POST /proposal                 the typed data to sign for new terms (the phone compares before signing); with
//                                  `pack: true` also the away pack, the nonce rotation and the old allowance's revoke
//   PUT  /                         a signed budget: verified against the wallet, replaces the one before; with the
//                                  away pack's signatures, the rotation and the revoke signed in the same approval
//   POST /pause · /resume          silent: pausing only ever makes Kawase do less
//   DELETE /                       ends the budget (the on-chain kill-switch is below)
//   POST /kill-switch              pauses, and hands the wallet incrementNonce ×2 to sign (relayed when it can be), plus
//                                  `legacy`: the revoke of every older grant without the kill-switch
//   POST /kill-switch/submit       { requestId, relayed, signed } → the relayer (or the wallet's own transaction) sends it
//   POST /spend                    { intentId, amountUsd } a send the phone signs with no prompt, reserved first
//   GET  /ledger                   this week's silent actions
//   POST /swaps/:id/leaf           { version } → sign_leaf (leaves to sign) or outside_budget
//   POST /swaps/:id/leaf/signature { approvalId, signatures } → executing (ops redeems)
//   POST /earn/:id/leaf            same for a vault deposit or withdraw
//   POST /earn/:id/leaf/signature
// Mounted by the lead at /budget: `app.route("/budget", budgetRoutes({ budget, swaps, earn }))`.
import { Hono } from "hono";
import { z } from "zod";

import { requireAccount, requireUser } from "../auth/middleware";
import type { EarnService } from "../earn/service";
import { HTTP, problem } from "../http/problem";
import { requireBrakeOverride } from "../safety/brake";
import type { SwapService } from "../swap/service";
import type { AppEnv } from "../types";
import { BUDGET_CATEGORIES } from "@kawase/wallet";
import type { BudgetService } from "./service";

const MONEY_DIGITS = 30;
const MAX_VENUES = 40;
const VENUE_MAX = 64;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const MAX_LEAVES = 6;

const baseUnits = z.string().regex(/^\d+$/).max(MONEY_DIGITS);
const categories = z.array(z.enum(BUDGET_CATEGORIES)).max(BUDGET_CATEGORIES.length);
const venues = z.array(z.string().min(1).max(VENUE_MAX)).max(MAX_VENUES);
const proposalSchema = z.object({ weeklyCap: baseUnits, perActionCap: baseUnits, categories, venues, pack: z.boolean().optional() });
const MAX_AWAY = 120;
/** A salt as a decimal or hex string: 32 bytes is at most 78 digits. */
const SALT_MAX = 80;
const signedRequest = z.object({ requestId: z.string().min(1).max(VENUE_MAX), relayed: z.boolean(), signed: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const savedSchema = z.object({
  policy: z.object({
    wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int().positive(),
    weeklyCap: baseUnits,
    perActionCap: baseUnits,
    categories,
    venues,
    issuedAt: z.number().int().nonnegative(),
    version: z.number().int().positive(),
  }),
  signature: z.string().regex(SIGNATURE),
  away: z.object({ proposalId: z.uuid(), signatures: z.array(z.object({ salt: z.string().regex(/^\d+$|^0x[0-9a-fA-F]+$/).max(SALT_MAX), signature: z.string().regex(SIGNATURE) })).max(MAX_AWAY) }).optional(),
  rotation: signedRequest.optional(),
  allowanceRevoke: signedRequest.optional(),
});
const spendSchema = z.object({ intentId: z.uuid(), amountUsd: baseUnits });
const leafSchema = z.object({ version: z.number().int().positive() });
const killSubmitSchema = z.object({ requestId: z.string().min(1).max(VENUE_MAX), relayed: z.boolean(), signed: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const leafSignatureSchema = z.object({ approvalId: z.uuid(), signatures: z.array(z.string().regex(SIGNATURE)).min(1).max(MAX_LEAVES) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function budgetRoutes(deps: { budget: BudgetService; swaps: SwapService; earn: EarnService }) {
  const { budget, swaps, earn } = deps;
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/", async (c) => c.json({ budget: await budget.current(c.get("user")!) }));
  app.get("/ledger", async (c) => c.json({ rows: await budget.ledger(c.get("user")!) }));
  app.post("/proposal", requireAccount, async (c) => c.json(await budget.proposal(c.get("user")!, await parse(proposalSchema, await c.req.json()))));
  app.put("/", requireAccount, async (c) => {
    const input = await parse(savedSchema, await c.req.json());
    const saved = await budget.save(c.get("user")!, {
      policy: { ...input.policy, wallet: input.policy.wallet as `0x${string}` },
      signature: input.signature as `0x${string}`,
      away: input.away ? { proposalId: input.away.proposalId, signatures: input.away.signatures.map((entry) => ({ salt: entry.salt, signature: entry.signature as `0x${string}` })) } : undefined,
      rotation: input.rotation ? { ...input.rotation, signed: input.rotation.signed as `0x${string}` } : undefined,
      allowanceRevoke: input.allowanceRevoke ? { ...input.allowanceRevoke, signed: input.allowanceRevoke.signed as `0x${string}` } : undefined,
    });
    return c.json(saved);
  });
  app.post("/pause", async (c) => c.json({ budget: await budget.setPaused(c.get("user")!, true) }));
  app.post("/resume", requireAccount, async (c) => c.json({ budget: await budget.setPaused(c.get("user")!, false) }));
  app.delete("/", async (c) => c.json({ budget: await budget.end(c.get("user")!) }));
  // Only ever takes power away, so neither step needs a step-up.
  app.post("/kill-switch", async (c) => c.json({ revoke: await budget.killSwitch(c.get("user")!) }));
  app.post("/kill-switch/submit", async (c) => {
    const input = await parse(killSubmitSchema, await c.req.json());
    const sent = await budget.submitKillSwitch(c.get("user")!, { requestId: input.requestId, relayed: input.relayed, signed: input.signed as `0x${string}` });
    if (sent.status === "confirmed") await budget.afterKillSwitch(c.get("user")!);
    return c.json(sent);
  });
  app.post("/spend", requireAccount, async (c) => {
    const input = await parse(spendSchema, await c.req.json());
    return c.json(await budget.reserveSend(c.get("user")!, { intentId: input.intentId, amountUsd: BigInt(input.amountUsd) }));
  });

  // A braked draft (risky: price impact past the person's rule, leverage…) is never silent: it needs their override on
  // the card, which is the ordinary path's Face ID. So the leaf path refuses it outright.
  app.post("/swaps/:id/leaf", requireAccount, async (c) => {
    const input = await parse(leafSchema, await c.req.json());
    requireBrakeOverride((await swaps.get(c.get("userId")!, c.req.param("id"))).results, false);
    return c.json(await swaps.approveLeaf(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }, budget));
  });
  app.post("/swaps/:id/leaf/signature", requireAccount, async (c) => {
    const input = await parse(leafSignatureSchema, await c.req.json());
    return c.json(await swaps.submitLeaf(c.get("user")!, c.req.param("id"), { approvalId: input.approvalId, signatures: input.signatures as `0x${string}`[] }, budget));
  });
  app.post("/earn/:id/leaf", requireAccount, async (c) => {
    const input = await parse(leafSchema, await c.req.json());
    requireBrakeOverride((await earn.get(c.get("userId")!, c.req.param("id"))).results, false);
    return c.json(await earn.approveLeaf(c.get("user")!, c.req.param("id"), { version: input.version, surface: "app" }, budget));
  });
  app.post("/earn/:id/leaf/signature", requireAccount, async (c) => {
    const input = await parse(leafSignatureSchema, await c.req.json());
    return c.json(await earn.submitLeaf(c.get("user")!, c.req.param("id"), { approvalId: input.approvalId, signatures: input.signatures as `0x${string}`[] }, budget));
  });
  return app;
}
