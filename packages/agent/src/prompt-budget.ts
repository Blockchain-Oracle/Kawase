// The weekly budget's rules for the agent (decision D38). Owned by the Budget lane; prompt.ts only places them.
// Until the budget ships this adds nothing, so the agent keeps today's allowance rules in prompt.ts.
import type { AgentContext } from "./context";

export function budgetLines(_context: AgentContext): string[] {
  return [];
}
