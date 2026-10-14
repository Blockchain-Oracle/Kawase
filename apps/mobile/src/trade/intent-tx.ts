// One wallet intent (send, earn, lend, margin) read as the tx kit's TxState, so every money screen of this lane draws
// the same lifecycle (BlockedCta → TxCta's phases → TxMorph receipt, TxFailureCard on a failure) from the intent the
// api already owns. The intent is the truth: nothing here sends, retries or decides money; it only names where the
// action stands, and says whether money moved in the api's own words (`outcome`).
import type { IntentState, SendOutcome } from "@kawase/api-client";

import type { Diagnosis, DiagnosisKind } from "@/components/kit/diagnosis";
import type { MoneyMoved, TxState } from "@/components/tx/tx-state";

export type TxIntent = {
  id: string;
  state: IntentState;
  outcome: SendOutcome | null;
  blocking: { code: string } | null;
  tx: { hash: string; explorerUrl: string } | null;
  updatedAt?: string;
};

const MOVING: ReadonlySet<IntentState> = new Set(["approved", "executing"]);
const ENDED_BADLY: ReadonlySet<IntentState> = new Set(["failed", "rejected", "canceled", "expired"]);
/** Policy codes the kit's diagnosis already has words for; anything else reads as "unknown". */
const KIND_OF_CODE: Record<string, DiagnosisKind> = {
  INSUFFICIENT_BALANCE: "balance",
  INSUFFICIENT_GAS: "gas",
  SIGN_IN_REQUIRED: "sign-in",
  WALLET_NOT_READY: "wallet",
  WALLET_NOT_SET_UP: "wallet",
  QUOTE_EXPIRED: "expired",
  QUOTE_UNAVAILABLE: "timeout",
  SLIPPAGE: "slippage",
};

/** Whether money moved, from the api's own ending (never guessed): reverted spends a fee, not the amount. */
function movedOf(outcome: SendOutcome | null, state: IntentState): MoneyMoved {
  if (outcome === "sent") return "yes";
  if (outcome === "checking" || state === "unknown_outcome") return "unknown";
  return "no";
}

function diagnosisOf(intent: TxIntent): Diagnosis {
  if (intent.state === "expired" || intent.outcome === "expired") return { kind: "expired", retryable: true, technical: intent.state };
  if (intent.state === "rejected") return { kind: "rejected", retryable: true, technical: intent.state };
  const code = intent.blocking?.code;
  const kind = (code && KIND_OF_CODE[code]) || "unknown";
  return { kind, retryable: true, technical: [code, intent.outcome, intent.state].filter(Boolean).join(" · ") };
}

/**
 * The TxState of an intent as this device sees it. `busy` is the approval in progress on the phone (Face ID and the
 * signature, before the api has it): that is Signing. A lost connection while it moves is "still waiting", never a
 * failure; a canceled intent the person closed is idle, not a failure.
 */
export function txStateOf(intent: TxIntent | undefined, options: { busy: boolean; connectionLost: boolean; blocked?: string | null }): TxState {
  if (!intent) return options.blocked ? { kind: "blocked", reason: options.blocked } : { kind: "idle" };
  const startedAt = intent.updatedAt ? Date.parse(intent.updatedAt) : Date.now();
  if (intent.state === "completed") return { kind: "confirmed", txHash: intent.tx?.hash ?? null };
  if (intent.state === "unknown_outcome" || (options.connectionLost && MOVING.has(intent.state)))
    return { kind: "unknown", txHash: intent.tx?.hash ?? null, diagnosis: { kind: "timeout", retryable: false, technical: intent.state } };
  if (MOVING.has(intent.state)) return { kind: "submitted", txHash: intent.tx?.hash ?? null, startedAt };
  if (intent.state === "canceled" && intent.outcome === "canceled") return { kind: "idle" };
  if (ENDED_BADLY.has(intent.state)) return { kind: "failed", diagnosis: diagnosisOf(intent), moneyMoved: movedOf(intent.outcome, intent.state), txHash: intent.tx?.hash ?? null };
  if (options.busy) return { kind: "signing", startedAt: Date.now() };
  if (options.blocked) return { kind: "blocked", reason: options.blocked };
  if (intent.state === "ready_for_approval") return { kind: "review" };
  return { kind: "idle" };
}
