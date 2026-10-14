// A wallet intent (swap, move) read as the kit's money lifecycle, so the swap and move tickets draw the same CTA, phase
// bar, steps, receipt morph and failure card as every other money action (premium bar §3). The api's intent is the
// source of truth; this only maps it: open → review (or blocked, or signing while the approval runs), approved or
// executing → sent, unknown outcome or "checking" → still waiting (never re-sent), sent → confirmed, not sent or
// reverted → failed with "no money moved". It also journals the intent before the signature and forgets it once it
// ends, so a kill mid-flight comes back to the same intent (read only, never sent again), and plays the outcome's
// sound and haptic once per intent.
import type { IntentState, SendOutcome } from "@kawase/api-client";
import * as React from "react";

import type { Diagnosis } from "@/components/kit";
import { forgetIntent, hydrateJournal, type IntentKind, intentsOf, journalIntent, type TxState } from "@/components/tx";
import { fire } from "@/feedback/fire";

type WalletIntent = {
  id: string;
  network: "mainnet" | "testnet";
  state: IntentState;
  outcome: SendOutcome | null;
  tx: { hash: string; explorerUrl: string } | null;
};

const OPEN: ReadonlySet<IntentState> = new Set(["submitted", "working", "input_required", "auth_required", "ready_for_approval"]);
const MOVING: ReadonlySet<IntentState> = new Set(["approved", "executing"]);
const REVERTED: Diagnosis = { kind: "unknown", retryable: true, technical: "reverted" };
const NOT_SENT: Diagnosis = { kind: "unknown", retryable: true, technical: "not_sent" };

/**
 * The lifecycle state of `intent`. `signingSince` is set while the person's approval (Face ID, the wallet's signature)
 * is running; `blocked` is the blocker's words while the version cannot be approved.
 */
export function intentTx(intent: WalletIntent | undefined, signingSince: number | null, blocked: string | null): TxState {
  if (!intent) return { kind: "idle" };
  if (OPEN.has(intent.state)) {
    if (signingSince !== null) return { kind: "signing", startedAt: signingSince };
    return blocked ? { kind: "blocked", reason: blocked } : { kind: "review" };
  }
  const hash = intent.tx?.hash ?? null;
  if (MOVING.has(intent.state)) return { kind: "submitted", txHash: hash, startedAt: signingSince ?? Date.now() };
  if (intent.state === "unknown_outcome" || intent.outcome === "checking") return { kind: "unknown", txHash: hash, diagnosis: { kind: "timeout", retryable: false } };
  if (intent.outcome === "sent" || intent.outcome === "practiced") return { kind: "confirmed", txHash: hash };
  if (intent.outcome === "reverted") return { kind: "failed", diagnosis: REVERTED, moneyMoved: "no", txHash: hash };
  if (intent.outcome === "not_sent") return { kind: "failed", diagnosis: NOT_SENT, moneyMoved: "no", txHash: hash };
  // Canceled or expired: nothing was approved; the ticket starts again.
  return { kind: "idle" };
}

/** One sound and haptic per intent outcome: confirmed (or `sound`), failed, still waiting. */
export function useOutcomeFeedback(intentId: string | undefined, state: TxState, sound: "confirmed" | "send" = "confirmed") {
  const said = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!intentId) return;
    const key = `${intentId}:${state.kind}`;
    if (said.current === key) return;
    if (state.kind === "confirmed") fire("filled", { sound, identity: `${intentId}:done` });
    else if (state.kind === "failed") fire("fail", { sound: "error", identity: `${intentId}:failed` });
    else if (state.kind === "unknown") fire("warn");
    else return;
    said.current = key;
  }, [intentId, state.kind, sound]);
}

/**
 * The intent journal for a ticket: `mark` before the approval (what, kind, network), `forget` once it ends, and on mount
 * the newest in-flight intent of this kind for this person, to read back instead of starting a new one.
 */
export function useTicketJournal(kind: IntentKind, network: "mainnet" | "testnet", owner: string | undefined) {
  const [resumable, setResumable] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!owner) return;
    let live = true;
    void hydrateJournal().then(() => {
      if (!live) return;
      const open = intentsOf(network, owner).filter((entry) => entry.kind === kind).sort((a, b) => b.sentAt - a.sentAt);
      setResumable(open[0]?.id ?? null);
    });
    return () => {
      live = false;
    };
  }, [kind, network, owner]);
  const mark = React.useCallback(
    (id: string, what: string) => {
      if (owner) journalIntent({ id, what, kind, network, owner: owner.toLowerCase(), sentAt: Date.now() });
    },
    [kind, network, owner],
  );
  const forget = React.useCallback((id: string) => {
    forgetIntent(id);
    setResumable((current) => (current === id ? null : current));
  }, []);
  return { resumable, mark, forget };
}

/** The intent ended (confirmed, failed, canceled or expired): it leaves the journal. */
export const intentEnded = (intent: WalletIntent) => !OPEN.has(intent.state) && !MOVING.has(intent.state) && intent.state !== "unknown_outcome" && intent.outcome !== "checking";
