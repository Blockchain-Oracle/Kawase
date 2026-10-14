// A cross-chain move read as the kit's money lifecycle. A move is not done when its Arc transaction confirms: it is
// done when the money is delivered on the other chain. So: open → review (or blocked, or signing while the approval
// runs); sent from Arc or filling there → sent; delivered → confirmed; refunded → failed with nothing lost (the money
// came back); failed after it left → failed, whether it moved unknown until the chain says; a lost answer → still
// waiting (never re-sent).
import type { CrossChainIntent } from "@kawase/api-client";

import type { Diagnosis } from "@/components/kit";
import type { TxState } from "@/components/tx";

const OPEN = new Set(["submitted", "working", "input_required", "auth_required", "ready_for_approval"]);
const REFUNDED: Diagnosis = { kind: "unknown", retryable: true, technical: "refunded" };
const FAILED: Diagnosis = { kind: "unknown", retryable: false, technical: "failed" };
const NOT_SENT: Diagnosis = { kind: "unknown", retryable: true, technical: "not_sent" };

export function moveTx(intent: CrossChainIntent | undefined, signingSince: number | null, blocked: string | null): TxState {
  if (!intent) return { kind: "idle" };
  if (OPEN.has(intent.state)) {
    if (signingSince !== null) return { kind: "signing", startedAt: signingSince };
    return blocked ? { kind: "blocked", reason: blocked } : { kind: "review" };
  }
  const hash = intent.fillTx?.hash ?? intent.tx?.hash ?? null;
  if (intent.stage === "delivered") return { kind: "confirmed", txHash: hash };
  if (intent.stage === "refunded") return { kind: "failed", diagnosis: REFUNDED, moneyMoved: "no", txHash: hash };
  if (intent.stage === "failed") return { kind: "failed", diagnosis: FAILED, moneyMoved: intent.tx ? "unknown" : "no", txHash: hash };
  if (intent.outcome === "not_sent" || intent.outcome === "reverted") return { kind: "failed", diagnosis: NOT_SENT, moneyMoved: "no", txHash: hash };
  if (intent.state === "canceled" || intent.state === "expired" || intent.outcome === "canceled" || intent.outcome === "expired") return { kind: "idle" };
  if (intent.state === "unknown_outcome" || intent.outcome === "checking") return { kind: "unknown", txHash: hash, diagnosis: { kind: "timeout", retryable: false } };
  return { kind: "submitted", txHash: hash, startedAt: signingSince ?? Date.parse(intent.createdAt) };
}

/** The move ended (delivered, refunded, failed, cancelled, expired): it leaves the journal. */
export const moveEnded = (intent: CrossChainIntent) => {
  const tx = moveTx(intent, null, null);
  return tx.kind === "confirmed" || tx.kind === "failed" || (tx.kind === "idle" && !OPEN.has(intent.state));
};
