// Automation tools added in 8c (builder A3): DCA drafts, editing in place, the dry run ("would have"), and
// the run history with why. Spread into buildTools; each goes through the injected context (K2). Nothing moves from a
// call: a draft is a card the person turns on (or practises first), and a widening edit is a card they sign.
import { tool } from "ai";
import { z } from "zod";

import type { AgentContext } from "./context";

const TOKEN_MAX = 60;
const NOTE_MAX = 140;
const LAST_WEEKDAY = 6;
const LAST_MONTHDAY = 28;
const TIMEZONE_MAX = 64;
const RUNS_MAX = 20;
const RUNS_DEFAULT = 5;
const UNAVAILABLE = { summary: { status: "unavailable" } };
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const schedule = {
  every: z.enum(["day", "week", "month"]),
  weekday: z.number().int().min(0).max(LAST_WEEKDAY).optional().describe("0 = Sunday … 6 = Saturday, for weekly"),
  monthday: z.number().int().min(1).max(LAST_MONTHDAY).optional().describe("Day of the month, for monthly"),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM, only if they said a time"),
  timezone: z.string().max(TIMEZONE_MAX).optional().describe("IANA zone, only if they named one"),
};

export function automationTools(context: AgentContext) {
  return {
    draft_dca: tool({
      description:
        "Draft a recurring buy (DCA): \"buy $10 of ARGUS every day\", \"swap 20 euros to dollars every Friday\". Pass the token paid with and the token bought as the person said them (dollars = USDC, euros = EURC, or a token's name), the amount of the token paid with, and how often. Every run waits in Needs you with a fresh quote and the person confirms the swap (every swap is their own yes); it can also be practised first. Nothing is set up by this call.",
      inputSchema: z.object({ from: z.string().max(TOKEN_MAX), to: z.string().max(TOKEN_MAX), amount: decimal, ...schedule }),
      execute: async (input) => (context.draftDca ? context.draftDca(input) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    edit_automation: tool({
      description:
        "Change one of the person's automations in place when they ask: the amount per run, how often, the day, the time, or the note. Pass the automationId from list_automations. Less per run, a longer period or another time applies at once; more per run or a shorter period gives Kawase more than they signed, so the card asks them to sign a new permission (and revokes the old one) with Face ID. Say which happened.",
      inputSchema: z.object({
        automationId: z.string().uuid(),
        amount: decimal.optional(),
        every: z.enum(["day", "week", "month"]).optional(),
        weekday: schedule.weekday,
        monthday: schedule.monthday,
        time: schedule.time,
        note: z.string().max(NOTE_MAX).optional(),
      }),
      execute: async (input) => (context.editAutomation ? context.editAutomation(input) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    simulate_automation: tool({
      description:
        "Show what an automation would do on its next runs, on today's facts, without doing anything: the first run is dry-run on Arc (would it go through, would the wallet have enough), the next ones repeat it. Use it for \"what would this do?\", before turning one on, or when they want to practise first.",
      inputSchema: z.object({ automationId: z.string().uuid() }),
      execute: async (input) => (context.simulateAutomation ? context.simulateAutomation(input) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
    get_automation_runs: tool({
      description:
        "The recent runs of one automation (or of all of them) with what happened and why: sent (with the transaction), skipped and the reason (not enough money, already sent this period, paused, a held address), waiting for them in Needs you, or a practice \"would have\". Use it for \"did it run?\", \"why didn't it pay?\".",
      inputSchema: z.object({ automationId: z.string().uuid().optional(), limit: z.number().int().min(1).max(RUNS_MAX).optional().describe(`How many, ${RUNS_DEFAULT} if unsure`) }),
      execute: async (input) => (context.automationRuns ? context.automationRuns({ automationId: input.automationId, limit: input.limit ?? RUNS_DEFAULT }) : UNAVAILABLE),
      toModelOutput: ({ output }) => ({ type: "json", value: output.summary }),
    }),
  };
}
