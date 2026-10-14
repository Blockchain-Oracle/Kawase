// The 8c automation part of the agent's view (builder A3): DCA drafts, edits, the dry run and the run
// history with why. Kept apart from context.ts so the lanes merge cleanly; context.ts spreads it in.
import { formatUnits } from "viem";

import type { AgentContext, ModelSummary } from "@kawase/agent";
import type { AutomationRunView, AutomationView } from "@kawase/api-client";

import type { AutomationService } from "../automations/service";
import { ProblemError } from "../http/problem";
import type { SessionUser } from "../types";
import { summarizeAutomation } from "./automation-summary";

const USDC_DECIMALS = 6;
type EditOut = Awaited<ReturnType<NonNullable<AgentContext["editAutomation"]>>>;
type SimulateOut = Awaited<ReturnType<NonNullable<AgentContext["simulateAutomation"]>>>;

function runLine(run: AutomationRunView): ModelSummary {
  return {
    at: run.scheduledFor,
    status: run.status === "practiced" ? "practice (would have)" : run.status === "needs_you" ? "waiting for them in Needs you" : run.status,
    why: run.reason,
    ...(run.reasonParams ? { details: run.reasonParams } : {}),
    ...(run.practice ? { chainSaid: run.practice.ok ? "would have gone through" : `would have been refused: ${run.practice.error ?? ""}` } : {}),
    ...(run.tx ? { tx: run.tx.hash } : {}),
  };
}

export function automationsContext(input: { user: SessionUser; automations: AutomationService; threadId: string }): Partial<AgentContext> {
  const { user, automations, threadId } = input;
  const guard = async <T>(work: () => Promise<T>, fallback: (reason: string) => T): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProblemError) return fallback(error.detail ?? error.code);
      throw error;
    }
  };
  const card = (automation: AutomationView) => ({ automation, summary: summarizeAutomation(automation) });

  return {
    async draftDca(request) {
      return card(await automations.createDca(user, request, { threadId }));
    },
    async editAutomation({ automationId, ...edit }) {
      return guard<EditOut>(
        async () => {
          const result = await automations.edit(user, automationId, edit);
          return {
            automation: result.automation,
            edit: result,
            summary: {
              status: result.grant ? "needs_signature" : "changed",
              next: result.grant ? "It gives the automation more than they signed: the card asks them to sign the new permission (and revoke the old one) with Face ID." : "Changed at once.",
              automation: summarizeAutomation(result.automation),
            },
          };
        },
        (reason) => ({ automation: undefined as never, edit: undefined as never, summary: { status: "refused", reason } }),
      );
    },
    async simulateAutomation({ automationId }) {
      return guard<SimulateOut>(
        async () => {
          const simulation = await automations.simulate(user, automationId);
          return {
            simulation,
            summary: {
              network: simulation.network,
              runs: simulation.runs.map((run) => ({
                at: run.at,
                would: run.outcome,
                amount: run.amount && run.asset ? `${run.asset === "USDC" || run.asset === "EURC" ? formatUnits(BigInt(run.amount), USDC_DECIMALS) : run.amount} ${run.asset}` : null,
                to: run.to,
                why: run.reason,
                ...(run.chain ? { chainSaid: run.chain.ok ? "would go through" : `would be refused: ${run.chain.error ?? ""}` } : {}),
              })),
            },
          };
        },
        (reason) => ({ simulation: undefined as never, summary: { status: "refused", reason } }),
      );
    },
    async automationRuns({ automationId, limit }) {
      const list = automationId ? [await automations.get(user.id, automationId)] : await automations.list(user);
      const cards = list.map(card);
      return {
        network: user.activeNetwork,
        automations: cards,
        summary: {
          network: user.activeNetwork,
          automations: cards.map(({ automation, summary }) => ({ id: automation.id, readBack: summary.readBack, practice: automation.practice ?? false, runs: automation.runs.slice(0, limit).map(runLine) })),
        },
      };
    },
  };
}
