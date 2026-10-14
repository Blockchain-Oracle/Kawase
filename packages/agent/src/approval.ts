// Who says yes to a money step (D38, AI SDK 7 `toolApproval`): inside the person's weekly budget, and with nothing read
// from outside Kawase since their message (trust rule H2), the step goes without a tap — the SDK records an automatic
// approval and the card says "inside your budget". Anything else waits for the person: the SDK emits an approval
// request, the card shows its confirm, and the turn continues once they answer. With no budget bound (the Budget lane
// supplies `context.budget`), every step waits: that is the safe default.
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
 * Whether one step may go without the person's tap. Never on outside text, never to someone else, never without an
 * amount; otherwise only when the budget says it fits. By voice a step that is not inside the budget keeps its card's
 * own confirm (the voice transport cannot answer an approval request; the card reaches the phone).
 */
export async function decideApproval(
  context: Pick<AgentContext, "budget" | "network" | "surface" | "intelligence">,
  trust: Pick<TurnTrust, "outside">,
  tool: BudgetedTool,
  input: StepInput,
): Promise<ToolApprovalStatus> {
  // Nothing to approve yet: the card asks how much, and its own confirm follows.
  if (!input.amount) return "not-applicable";
  const wait = (reason: ApprovalReason): ToolApprovalStatus => (context.surface === "voice" ? "not-applicable" : waits(reason));
  if (trust.outside.length > 0) return wait("outside_text");
  const action = budgetAction(tool, input, context.network);
  if (action.recipient === "other") return wait("other_recipient");
  if (!context.budget) return wait("no_budget");
  const fits = await context.budget.allows(action).catch((error: unknown) => {
    context.intelligence.warn(error, "budget check failed");
    return false;
  });
  return fits ? approved("inside_budget") : wait("over_budget");
}

/** The per-tool `toolApproval` map for one turn (the same trust the tools use, so outside text read mid-turn counts). */
export function toolApprovals(context: Pick<AgentContext, "budget" | "network" | "surface" | "intelligence">, trust: Pick<TurnTrust, "outside">) {
  const entries = (Object.keys(BUDGETED_TOOLS) as BudgetedTool[]).map((tool) => [tool, (input: StepInput) => decideApproval(context, trust, tool, input)] as const);
  return Object.fromEntries(entries) as Record<BudgetedTool, (input: StepInput) => Promise<ToolApprovalStatus>>;
}
