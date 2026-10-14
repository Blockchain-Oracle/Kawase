// What the api's /budget answers look like on the phone (apps/api/src/budget/{service,leaf}.ts). Amounts are strings
// of base units (US dollars in 6 decimals for the budget; each token's own for a leaf). Nothing here is trusted on
// its own: the guard verifies the budget's signature and decodes every leaf itself (guard.ts).
import type { BudgetCategory } from "@kawase/wallet";

/** The budget as the wallet signed it, with this week's spend (GET /budget). */
export type BudgetView = {
  network: "mainnet" | "testnet";
  policy: { wallet: string; chainId: number; weeklyCap: string; perActionCap: string; categories: BudgetCategory[]; venues: string[]; issuedAt: number; version: number };
  signature: string;
  paused: boolean;
  spentThisWeek: string;
  leftThisWeek: string;
  weekStartsAt: string;
  weekEndsAt: string;
};

/** One silent action this week (GET /budget/ledger). `counts` is false once its intent failed or was canceled. */
export type BudgetLedgerRow = { id: string; intentId: string | null; category: string; venue: string; amountUsd: string; createdAt: string; counts: boolean };

/** Why the server says an action is not silent (the guard has its own, stricter list). */
export type ServerBudgetRefusal = "no_budget" | "paused" | "guard" | "practice" | "category_off" | "venue_off" | "over_action_cap" | "over_week" | "unpriced" | "token_unvetted";

/** One leaf as the api hands it out: typed data to sign (salt as a decimal string) and the receipt it decoded. */
export type LeafOffer = { typedData: Record<string, unknown>; receipt: Record<string, unknown> };

/** POST /budget/{swaps,earn}/:id/leaf and …/leaf/signature, around the intent the flow already shows. */
export type LeafResponse<Intent> =
  | { status: "sign_leaf"; intent: Intent; approvalId: string; leaves: LeafOffer[]; expiresAt: string; budget: { category: BudgetCategory; venue: string; amountUsd: string; leftThisWeek: string } }
  | { status: "outside_budget"; intent: Intent; reason: ServerBudgetRefusal }
  | { status: "executing"; intent: Intent }
  | { status: "changed"; intent: Intent }
  | { status: "final"; intent: Intent };
