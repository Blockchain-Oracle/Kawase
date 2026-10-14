// The weekly budget (D38), as the api's /budget answers it (apps/api/src/budget/{routes,service,leaf}.ts). Amounts are
// strings of base units: US dollars in 6 decimals for the budget, each token's own for a leaf. Nothing here is trusted
// on its own: the phone's guard verifies the budget's signature and decodes every leaf itself (mobile budget/guard.ts).
import type { EarnIntent, RevokeRequest, SwapIntent } from "./types";

/** What a budget can cover (@kawase/wallet BUDGET_CATEGORIES). */
export type BudgetCategory = "swap" | "bridge" | "earn" | "x402" | "send";

/** The terms the wallet signs. */
export type BudgetPolicyView = {
  wallet: string;
  chainId: number;
  weeklyCap: string;
  perActionCap: string;
  categories: BudgetCategory[];
  venues: string[];
  issuedAt: number;
  version: number;
};

/** The budget as the wallet signed it, with this week's spend (GET /budget). */
export type BudgetView = {
  network: "mainnet" | "testnet";
  policy: BudgetPolicyView;
  signature: string;
  paused: boolean;
  spentThisWeek: string;
  leftThisWeek: string;
  weekStartsAt: string;
  weekEndsAt: string;
};

/** New terms as the person set them (base units). */
export type BudgetTerms = { weeklyCap: string; perActionCap: string; categories: BudgetCategory[]; venues: string[] };

/** POST /budget/proposal: the terms with the wallet, chain and next version filled in, and the typed data to sign. */
export type BudgetProposal = { policy: BudgetPolicyView; typedData: Record<string, unknown> };

/** One silent action this week (GET /budget/ledger). `counts` is false once its intent failed or was canceled. */
export type BudgetLedgerRow = { id: string; intentId: string | null; category: string; venue: string; amountUsd: string; createdAt: string; counts: boolean };

/** Why the server says an action is not silent (the phone's guard has its own, stricter list). */
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

type Call = <T>(method: string, path: string, body?: unknown, options?: { idempotencyKey?: string | undefined }) => Promise<T>;

/** The budget's endpoints, spread into the client as `api.budget`. */
export function budgetEndpoints(call: Call) {
  return {
    budget: {
      /** The budget on the active network, or null. */
      get: () => call<{ budget: BudgetView | null }>("GET", "/budget"),
      ledger: () => call<{ rows: BudgetLedgerRow[] }>("GET", "/budget/ledger"),
      /** What to sign for new terms; the phone builds the same typed data itself and compares before it signs. */
      proposal: (terms: BudgetTerms) => call<BudgetProposal>("POST", "/budget/proposal", terms),
      /** The signed terms: verified against the wallet, they replace the budget before. */
      save: (policy: BudgetPolicyView, signature: string) => call<{ budget: BudgetView | null }>("PUT", "/budget", { policy, signature }),
      /** Silent: pausing only ever makes Kawase do less. */
      pause: () => call<{ budget: BudgetView | null }>("POST", "/budget/pause"),
      resume: () => call<{ budget: BudgetView | null }>("POST", "/budget/resume"),
      end: () => call<{ budget: null }>("DELETE", "/budget"),
      /** Pauses, and hands the wallet `incrementNonce` to sign (relayed when it can be): every leaf and grant ends. */
      killSwitch: () => call<{ revoke: RevokeRequest }>("POST", "/budget/kill-switch"),
      submitKillSwitch: (input: { requestId: string; relayed: boolean; signed: string }) => call<{ tx: string; status: "confirmed" | "reverted" }>("POST", "/budget/kill-switch/submit", input),
      /** A swap inside the budget: the leaves to sign, or why it is not silent (then the ordinary approve). */
      swapLeaf: (intentId: string, version: number, idempotencyKey?: string) => call<LeafResponse<SwapIntent>>("POST", `/budget/swaps/${intentId}/leaf`, { version }, { idempotencyKey }),
      swapLeafSignature: (intentId: string, approvalId: string, signatures: string[]) => call<LeafResponse<SwapIntent>>("POST", `/budget/swaps/${intentId}/leaf/signature`, { approvalId, signatures }),
      earnLeaf: (intentId: string, version: number, idempotencyKey?: string) => call<LeafResponse<EarnIntent>>("POST", `/budget/earn/${intentId}/leaf`, { version }, { idempotencyKey }),
      earnLeafSignature: (intentId: string, approvalId: string, signatures: string[]) => call<LeafResponse<EarnIntent>>("POST", `/budget/earn/${intentId}/leaf/signature`, { approvalId, signatures }),
    },
  };
}
