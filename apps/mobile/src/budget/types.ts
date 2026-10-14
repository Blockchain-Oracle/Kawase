// What the api's /budget answers look like on the phone: the api-client's budget types (packages/api-client/src/
// budget.ts, mirroring apps/api/src/budget/{service,leaf}.ts). Amounts are strings of base units (US dollars in 6
// decimals for the budget; each token's own for a leaf). Nothing here is trusted on its own: the guard verifies the
// budget's signature and decodes every leaf itself (guard.ts).
export type { BudgetLedgerRow, BudgetView, LeafOffer, LeafResponse, ServerBudgetRefusal } from "@kawase/api-client";
