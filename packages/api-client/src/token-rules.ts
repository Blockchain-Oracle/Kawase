// Token rules (D12, builder A2): what buys of tokens Kawase does not vouch for may be. Tightening applies at once;
// loosening returns a message for the wallet to sign (Face ID), then applies. Kept apart from types.ts so the lanes
// merge cleanly; the client spreads `tokenRulesEndpoints` into its routes.
import type { NetworkId } from "./types";

type Call = <T>(method: string, path: string, body?: unknown, options?: { idempotencyKey?: string | undefined }) => Promise<T>;

/** verified = only tokens Kawase vouches for (canonical or listed); warned = also unverified ones, inside the caps. */
export type TokenAccessLevel = "verified" | "warned";

export type TokenRulesValuesView = {
  access: TokenAccessLevel;
  unverifiedPerTradeUsd: number;
  unverifiedPerDayUsd: number;
  maxPriceImpactBps: number;
};

export type TokenRulesView = TokenRulesValuesView & {
  network: NetworkId;
  defaults: TokenRulesValuesView;
  /** The steps each rule can be set to. */
  choices: { unverifiedPerTradeUsd: number[]; unverifiedPerDayUsd: number[]; maxPriceImpactBps: number[] };
  /** Spent today on unverified tokens (USD), against the daily cap. */
  spentTodayUsd: number;
};

export type TokenRulesChange = { [K in keyof TokenRulesValuesView]?: TokenRulesValuesView[K] | undefined };

export type TokenRulesChangeResponse =
  | { status: "applied" | "unchanged"; rules: TokenRulesView }
  | {
      status: "needs_approval";
      changeId: string;
      before: TokenRulesValuesView;
      after: TokenRulesValuesView;
      expiresAt: string;
      /** The step-up message the wallet signs (EIP-712). */
      typedData: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
    };

export function tokenRulesEndpoints(call: Call) {
  return {
    tokenRules: {
      get: () => call<{ rules: TokenRulesView }>("GET", "/token-rules"),
      change: (change: TokenRulesChange) => call<TokenRulesChangeResponse>("POST", "/token-rules", change),
      approve: (changeId: string, signature: string) => call<TokenRulesChangeResponse>("POST", "/token-rules/approve", { changeId, signature }),
    },
  };
}
