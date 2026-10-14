// The Stage 3 budget endpoints the shared api-client does not carry yet (packages/api-client/src/budget.ts is the
// lead's): the proposal with the away pack, the save that carries its signatures, the revoke and the rotation, revoke-
// all with the older grants' revoke, and the reservation of a silent send. Same base URL, token and device proof as
// `api` (session/api.ts), the same ApiError on a refusal. The lead may fold these into api.budget; the shapes match
// apps/api/src/budget/{routes,service,away}.ts.
import { ApiError, type Problem, type RevokeRequest } from "@kawase/api-client";

import { API_URL, api } from "@/session/api";
import { deviceProofHeaders } from "@/session/device-proof";
import { sessionStorage } from "@/session/storage";

import type { BudgetPolicyView, BudgetTerms, BudgetView } from "./types";

const HTTP_NO_CONTENT = 204;

/** One away-pack grant as the api hands it out. */
export type AwayOffer = { purpose: string; subject: string; typedData: Record<string, unknown>; receipt: Record<string, unknown> };

export type AwayProposal = { proposalId: string; nonce: string; expiresAt: number; perContactPerWeek: string; offers: AwayOffer[] };

/** POST /budget/proposal with `pack: true`. */
export type PackProposal = {
  policy: BudgetPolicyView;
  typedData: Record<string, unknown>;
  away: AwayProposal;
  /** incrementNonce: turns the old pack off and this one on. */
  rotation: RevokeRequest;
  /** The old any-recipient allowance's revoke, when one is still on. */
  allowanceRevoke: RevokeRequest | null;
};

export type SignedRequest = { requestId: string; relayed: boolean; signed: string };
export type ChainOutcome = { status: "confirmed" | "reverted" | "failed"; tx: string | null } | null;

export type SaveInput = {
  policy: BudgetPolicyView;
  signature: string;
  away?: { proposalId: string; signatures: { salt: string; signature: string }[] } | undefined;
  rotation?: SignedRequest | undefined;
  allowanceRevoke?: SignedRequest | undefined;
};

export type SaveAnswer = { budget: BudgetView | null; allowanceRevoke: ChainOutcome; rotation: ChainOutcome };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await sessionStorage.getToken();
  const sent = body === undefined ? undefined : JSON.stringify(body);
  const headers: Record<string, string> = { accept: "application/json" };
  if (sent !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  Object.assign(headers, await deviceProofHeaders({ method, path, body: sent ?? "" }).catch(() => ({})));
  const response = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, { method, headers, ...(sent !== undefined ? { body: sent } : {}) });
  if (response.status === HTTP_NO_CONTENT) return undefined as T;
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) throw new ApiError(parsed as Problem);
  return parsed as T;
}

export const budgetApi = {
  get: () => api.budget.get() as Promise<{ budget: BudgetView | null }>,
  pause: () => api.budget.pause() as Promise<{ budget: BudgetView | null }>,
  resume: () => api.budget.resume() as Promise<{ budget: BudgetView | null }>,
  /** The terms with the away pack, the rotation and the old allowance's revoke, for one approval. */
  proposePack: (terms: BudgetTerms) => call<PackProposal>("POST", "/budget/proposal", { ...terms, pack: true }),
  save: (input: SaveInput) => call<SaveAnswer>("PUT", "/budget", input),
  /** Pauses, and hands out the kill-switch (incrementNonce ×2) and the revoke of every older grant. */
  killSwitch: () => call<{ revoke: RevokeRequest & { legacy?: RevokeRequest | null } }>("POST", "/budget/kill-switch"),
  submitKillSwitch: (input: SignedRequest) => api.budget.submitKillSwitch(input),
  /** A send the phone signs with no prompt, counted against this week first. */
  reserveSend: (intentId: string, amountUsd: bigint) => call<{ ok: true; leftThisWeek: string } | { ok: false; reason: string }>("POST", "/budget/spend", { intentId, amountUsd: amountUsd.toString() }),
};
