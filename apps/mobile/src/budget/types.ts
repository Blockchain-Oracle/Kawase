// What the api's /budget answers look like on the phone: the api-client's budget types (packages/api-client/src/
// budget.ts, mirroring apps/api/src/budget/{service,leaf}.ts), plus the Stage 3 fields the api now adds to the view (the
// away pack and the old allowances still on). Amounts are strings of base units (US dollars in 6 decimals for the
// budget; each token's own for a leaf). Nothing here is trusted on its own: the guard verifies the budget's signature
// and decodes every leaf and grant itself (guard.ts, sign-budget.ts).
import type { BudgetView as ServerBudgetView } from "@kawase/api-client";

export type { BudgetCategory, BudgetLedgerRow, BudgetPolicyView, BudgetTerms, LeafOffer, LeafResponse, ServerBudgetRefusal } from "@kawase/api-client";

/** What the budget screen says about the away pack (apps/api/src/budget/away.ts AwaySummary). */
export type AwaySummary = {
  state: "live" | "pending" | "none";
  contacts: number;
  vaults: number;
  moves: number;
  perContactPerWeek: string | null;
  expiresAt: string | null;
};

export type BudgetView = ServerBudgetView & {
  away?: AwaySummary | undefined;
  /** Old any-recipient allowances still on: the next save turns them off. */
  legacyAllowances?: number | undefined;
};
