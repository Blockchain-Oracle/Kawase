// Errors leave the api as RFC 9457 problem details (application/problem+json), with a stable `type` code the
// app can translate, never a stack trace.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const HTTP = {
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  gone: 410,
  unprocessable: 422,
  tooManyRequests: 429,
  internal: 500,
  badGateway: 502,
  serviceUnavailable: 503,
} as const;

export type ProblemCode =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "nonce_invalid"
  | "proof_invalid"
  | "session_key_unknown"
  | "account_recovery_required"
  | "wallet_not_registered"
  | "wallet_not_set_up"
  | "grant_not_pending"
  | "signature_mismatch"
  | "transaction_mismatch"
  /** A new grant replaces one the chain still honours: the old one's revoke must be signed and land first. */
  | "revoke_required"
  | "revoke_failed"
  | "network_unavailable"
  /** The network is on, but Kawase's relayer there has no gas yet (a funded relayer makes it ready). */
  | "network_not_ready"
  /** Kawase's relayer has paid this person's fees as often, or as much, as one person gets in a day. */
  | "relay_limit"
  /** Kawase's relayer has spent its gas budget for the day on this network. */
  | "relayer_budget_spent"
  | "consent_required"
  | "handle_invalid"
  | "handle_reserved"
  | "handle_taken"
  | "idempotency_mismatch"
  | "rate_limited"
  | "faucet_claimed_today"
  | "faucet_testnet_only"
  | "agent_unavailable"
  | "voice_unavailable"
  | "turn_in_progress"
  | "turn_already_processed"
  | "recipient_unknown"
  | "recipient_no_wallet"
  | "recipient_is_self"
  | "address_invalid"
  | "contact_exists"
  | "intent_stale"
  | "intent_final"
  | "intent_blocked"
  | "network_mismatch"
  | "request_unavailable"
  | "quote_unavailable"
  | "simulation_failed"
  | "marketplace_unavailable"
  | "agent_wallet_short"
  // Margin protection (take-profit / stop-loss): a target on the wrong side, or a close no route can carry now.
  | "protection_unavailable"
  | "take_profit_wrong_side"
  | "stop_loss_wrong_side"
  | "stop_loss_past_liquidation"
  | "launchpad_unavailable"
  | "change_not_pending"
  | "practice_mode"
  | "brake_override"
  | "token_invalid"
  // Contact discovery (M11): more email fingerprints than one address book in a request, or than a day allows.
  | "discovery_batch_too_large"
  | "discovery_quota"
  | "upstream"
  | "internal";

export class ProblemError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ProblemCode;
  readonly detail: string | undefined;
  readonly extra: Record<string, unknown> | undefined;

  constructor(status: ContentfulStatusCode, code: ProblemCode, detail?: string, extra?: Record<string, unknown>) {
    super(detail ?? code);
    this.name = "ProblemError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra;
  }
}

export const problem = (
  status: ContentfulStatusCode,
  code: ProblemCode,
  detail?: string,
  extra?: Record<string, unknown>,
) => new ProblemError(status, code, detail, extra);

const TITLES: Record<ProblemCode, string> = {
  validation: "The request is not valid",
  unauthenticated: "Sign in first",
  forbidden: "Not allowed",
  not_found: "Not found",
  conflict: "Already exists",
  nonce_invalid: "The sign-in challenge is unknown, used or expired",
  proof_invalid: "The sign-in proof does not verify",
  session_key_unknown: "The session key is not registered on this user",
  account_recovery_required: "Use the original sign-in method to recover this account",
  wallet_not_registered: "No wallet is registered for this account",
  wallet_not_set_up: "The wallet is not set up on this network",
  grant_not_pending: "There is no allowance waiting for a signature",
  signature_mismatch: "The signature does not match the wallet",
  transaction_mismatch: "The signed transaction differs from the request",
  revoke_required: "The grant this replaces must be revoked in the same approval",
  revoke_failed: "The old grant's revoke did not go through; nothing changed",
  network_unavailable: "This network is not available",
  network_not_ready: "Kawase is getting this network ready",
  relay_limit: "Kawase has paid your network fees enough times today",
  relayer_budget_spent: "Kawase's free network fees are used up for today",
  consent_required: "A consent is required first",
  handle_invalid: "The handle is not valid",
  handle_reserved: "The handle is reserved",
  handle_taken: "The handle is taken",
  idempotency_mismatch: "The same Idempotency-Key was used for a different request",
  rate_limited: "Too many requests",
  faucet_claimed_today: "Test money was already sent today",
  faucet_testnet_only: "The faucet only sends test money on testnet",
  agent_unavailable: "The agent is not available on this server",
  voice_unavailable: "Voice is not available on this server",
  turn_in_progress: "This conversation is still working; check its current status",
  turn_already_processed: "This request was already handled; reopen the conversation",
  recipient_unknown: "No one by that name or handle",
  recipient_no_wallet: "That person has no wallet yet",
  recipient_is_self: "That is your own address",
  address_invalid: "That is not an Arc address",
  contact_exists: "A contact with that name exists",
  intent_stale: "This was changed since you saw it",
  intent_final: "This is already finished",
  intent_blocked: "Something needs fixing before this can go",
  network_mismatch: "This was made on the other network",
  request_unavailable: "This request is no longer open",
  quote_unavailable: "No swap price right now; try again in a moment",
  simulation_failed: "This would not go through right now; nothing was sent",
  marketplace_unavailable: "Paying for services is not available here",
  agent_wallet_short: "The agent wallet does not hold enough",
  protection_unavailable: "Kawase cannot protect this position right now",
  take_profit_wrong_side: "The take-profit is on the wrong side of the price",
  stop_loss_wrong_side: "The stop-loss is on the wrong side of the price",
  stop_loss_past_liquidation: "The stop-loss must come before liquidation",
  launchpad_unavailable: "Launchpads are read on Arc mainnet",
  change_not_pending: "That change is no longer waiting for approval",
  practice_mode: "Practice mode is on: nothing real moves",
  brake_override: "A risky action: confirm it on its card",
  token_invalid: "Not a token on this network",
  discovery_batch_too_large: "Too many contacts in one check; send them in smaller batches",
  discovery_quota: "Enough contacts were checked today; try again tomorrow",
  upstream: "A provider did not answer",
  internal: "Something went wrong",
};

export function problemResponse(c: Context, error: ProblemError, requestId: string) {
  return c.json(
    {
      type: `https://kawase.xyz/problems/${error.code}`,
      title: TITLES[error.code],
      status: error.status,
      detail: error.detail,
      instance: c.req.path,
      requestId,
      ...error.extra,
    },
    error.status,
    { "content-type": "application/problem+json" },
  );
}
