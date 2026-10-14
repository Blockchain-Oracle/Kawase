// Who says yes to a money step (D38, AI SDK 7 `toolApproval`): inside the person's weekly budget, and with nothing read
// from outside Kawase since their message (trust rule H2), the step goes without a tap — the SDK records an automatic
// approval and the card says "inside your budget". Anything else waits for the person, asked exactly once: when the
// trust rule stops the step (outside text, someone else's address) the SDK emits an approval request and the card asks
// "go ahead?" before anything is drafted; otherwise the step's own card and its confirm are that one ask. Nothing is
// ever approved without a budget bound (the Budget lane supplies `context.budget`): that is the safe default.
//
// The tools gated here only prepare a step (a fresh quote and every check); the money itself still moves on the card
// through the person's own wallet. Sends keep their own allowance rule (trust.ts) until per-contact grants replace it;
// perps, borrowing and limit changes always wait on their card and are never approved automatically.
import type { ToolApprovalStatus } from "ai";

import type { ApprovalReason, BudgetAction } from "@kawase/api-client";

import type { AgentContext } from "./context";
import type { TurnTrust } from "./trust";

/** The steps a weekly budget can cover without a tap, by the tool that prepares them. */
export const BUDGETED_TOOLS = {
  propose_trade: "swap",
  propose_swap: "swap",
  propose_bridge: "bridge",
  bring_to_arc: "bring_in",
  propose_earn: "earn",
  propose_supply: "earn",
} as const satisfies Record<string, BudgetAction["kind"]>;

export type BudgetedTool = keyof typeof BUDGETED_TOOLS;

type StepInput = {
  amount?: string | undefined;
  asset?: string | undefined;
  from?: string | undefined;
  venue?: string | undefined;
  recipient?: string | undefined;
};

const approved = (reason: ApprovalReason): ToolApprovalStatus => ({ type: "approved", reason });
const waits = (reason: ApprovalReason): ToolApprovalStatus => ({ type: "user-approval", reason });

/** The budget's view of one step. */
export function budgetAction(tool: BudgetedTool, input: StepInput, network: AgentContext["network"]): BudgetAction {
  const kind = BUDGETED_TOOLS[tool];
  return {
    tool,
    kind,
    amount: input.amount ?? null,
    asset: input.from ?? input.asset ?? (kind === "swap" ? null : "USDC"),
    venue: input.venue ?? null,
    recipient: kind === "bridge" || kind === "bring_in" ? (input.recipient ? "other" : "self") : null,
    network,
  };
}

/**
 * Whether one step may go without the person's tap, and how they are asked when it may not:
 * - `approved` only when the budget says it fits, with an amount, to the person themselves, on a turn the person
 *   started with their own message and with no outside text read since it (the card then says "inside your budget");
 * - `user-approval` when the trust rule stops the step before it is even drafted: outside text was read this turn, or it
 *   would go to someone else (the card asks "go ahead?" first, then quotes);
 * - `not-applicable` when the budget has nothing to say (no budget yet, over it, a check that failed, no amount yet):
 *   the step is drafted and its card's own confirm is the one approval (D38: above the budget, Face ID on the card).
 *   Asking here as well would make the person confirm twice for one step.
 * A turn that continues a card (their Go ahead / Not now, a network switch) carries no new words from the person, and
 * the thread before it may hold outside text this turn's trust never saw (an x402 answer, a search result, read on the
 * turn that asked). Its trust cannot be proven clean, so nothing on it is approved automatically: the card's own confirm
 * is the ask. (Asking again here could loop on the very call the person just approved.)
 * By voice the transport cannot answer an approval request; the card's own confirm reaches the phone instead.
 */
export async function decideApproval(
  context: Pick<AgentContext, "budget" | "network" | "surface" | "intelligence" | "lastUserText">,
  trust: Pick<TurnTrust, "outside">,
  tool: BudgetedTool,
  input: StepInput,
): Promise<ToolApprovalStatus> {
  const action = budgetAction(tool, input, context.network);
  const ask = (reason: ApprovalReason): ToolApprovalStatus => (context.surface === "voice" ? "not-applicable" : waits(reason));
  if (trust.outside.length > 0) return ask("outside_text");
  if (action.recipient === "other") return ask("other_recipient");
  // Nothing to approve yet: the card asks how much, and its own confirm follows.
  if (!input.amount || !context.budget) return "not-applicable";
  // A continuation: the person wrote nothing new and the thread's earlier outside text is unseen here, so never automatic.
  if (isContinuation(context)) return "not-applicable";
  const fits = await context.budget.allows(action).catch((error: unknown) => {
    context.intelligence.warn(error, "budget check failed");
    return false;
  });
  return fits ? approved("inside_budget") : "not-applicable";
}

/** The turn continues a card (an approval answer, a tool output from the device) rather than a message the person wrote. */
export function isContinuation(context: Pick<AgentContext, "lastUserText">): boolean {
  return !context.lastUserText.trim();
}

/** The per-tool `toolApproval` map for one turn (the same trust the tools use, so outside text read mid-turn counts). */
export function toolApprovals(context: Pick<AgentContext, "budget" | "network" | "surface" | "intelligence" | "lastUserText">, trust: Pick<TurnTrust, "outside">) {
  const entries = (Object.keys(BUDGETED_TOOLS) as BudgetedTool[]).map((tool) => [tool, (input: StepInput) => decideApproval(context, trust, tool, input)] as const);
  return Object.fromEntries(entries) as Record<BudgetedTool, (input: StepInput) => Promise<ToolApprovalStatus>>;
}
