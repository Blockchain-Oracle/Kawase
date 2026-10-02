// Safety tools (builder A3, cards/automate-safety.md "Stay in control"): pause all, the risk dial, limit and allowlist
// changes, and revoking grants. Spread into buildTools. Each goes through the injected context, scoped to the person
// and their network (K2): tokens and contacts are named as the person said them and resolved by code, never passed
// as addresses. A tightening applies at once; a loosening comes back as a card the person approves with Face ID —
// a policy change is never approved by the model (07-automations-contacts-safety/limits-and-safety.md §6).
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";

const NAME_MAX = 80;
const TOKEN_MAX = 40;
const MAX_HOURS = 720;
const UNAVAILABLE = { status: "refused" as const, summary: { status: "refused", reason: "Wallet & limits are not available here." } };

export function safetyTools(context: AgentContext) {
  return {
    get_limits: tool({
      description:
        "The person's limits on the active network: pause all, the risk dial (guard, balanced, autonomous), practice mode, each token's daily allowance (what Kawase holds itself to and what the chain guarantees, and what is left today), the per-payment cap, the new-recipient cooldown, the allowlist, and how many grants are on. Use it for 'what are my limits?', 'how much can you spend?', and before proposing a change.",
      inputSchema: z.object({}),
      execute: async () => (context.safetyView ? context.safetyView() : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    pause_all: tool({
      description:
        "Pause or resume everything Kawase does without the person: sends inside the allowance, automations and paid services. Pausing applies at once (say so). Resuming gives Kawase that power back, so it comes back as a card the person approves with Face ID; say it is waiting on their screen. While paused, the person's own Face ID payments still work (so they can still move their money out).",
      inputSchema: z.object({ action: z.enum(["pause", "resume"]) }),
      execute: async ({ action }) => (context.changeSafety ? context.changeSafety({ kind: "pause", on: action === "pause" }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    set_risk_mode: tool({
      description:
        "Set the risk dial when the person asks: guard (every payment waits for their confirmation on its card, chat too; every first payment to an address needs Face ID), balanced (the default: inside the daily allowance a typed request goes at once), or autonomous (you may act on your own suggestions inside their grants and report after). Moving toward guard applies at once; moving toward autonomous comes back as a card they approve with Face ID.",
      inputSchema: z.object({ mode: z.enum(["guard", "balanced", "autonomous"]) }),
      execute: async ({ mode }) =>
        context.changeSafety ? context.changeSafety({ kind: "risk_mode", mode: mode === "guard" ? "careful" : mode }) : UNAVAILABLE,
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_limit_change: tool({
      description:
        "Change one of the person's limits when they ask: a token's daily allowance (allowance: the new amount per day, or 0 to stop it), the per-payment cap (per_payment), a temporary raise for some hours (temporary_raise: the token's total per day while it lasts, or with token omitted the per-payment cap), the new-recipient cooldown (cooldown: hours and the most a new address may get meanwhile, in USDC), or practice mode (practice: on or off). Pass the token as the person said it (USDC, EURC, dollars, euros, or a token symbol they hold). Lowering applies at once; raising comes back as a card showing now and after that they approve with Face ID (for an allowance it signs a new grant on Arc and revokes the old one). Never raise a limit they did not ask to raise.",
      inputSchema: z.object({
        limit: z.enum(["allowance", "per_payment", "temporary_raise", "cooldown", "practice"]),
        token: z.string().max(TOKEN_MAX).optional().describe("As the person said it; for allowance and a token's temporary raise"),
        amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("Digits with a dot, in the token's own units (USDC for per_payment and cooldown)"),
        hours: z.number().positive().max(MAX_HOURS).optional().describe("temporary_raise: how long; cooldown: its length"),
        on: z.boolean().optional().describe("practice only"),
      }),
      execute: async (input) => (context.proposeLimitChange ? context.proposeLimitChange(input) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    propose_allowlist_change: tool({
      description:
        "Change who Kawase may pay without asking: add a saved contact to the allowlist or remove one (pass the name exactly as the person said it), or turn 'only allowlisted people' on or off. Removing someone and turning the rule on apply at once; adding someone and turning it off come back as a card they approve with Face ID.",
      inputSchema: z.object({
        action: z.enum(["add", "remove", "only_on", "only_off"]),
        contact: z.string().max(NAME_MAX).optional().describe("A saved contact's name, for add and remove"),
      }),
      execute: async (input) => (context.proposeAllowlistChange ? context.proposeAllowlistChange(input) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    revoke_grant: tool({
      description:
        "Take a permission back on Arc when the person asks: a token's daily allowance (Kawase stops using it at once; the card then revokes it on chain with Face ID), one automation's grant (pass its id from list_automations; it stops at once), or everything (the exit kit: pause all, then one Face ID revokes every grant here, then they can move their money out). The on-chain step is always the person's own signature on the card.",
      inputSchema: z.object({
        what: z.enum(["allowance", "automation", "everything"]),
        token: z.string().max(TOKEN_MAX).optional().describe("allowance: the token as the person said it"),
        automationId: z.string().uuid().optional().describe("automation: from list_automations"),
      }),
      execute: async (input) => (context.revokeGrant ? context.revokeGrant(input) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
  };
}
