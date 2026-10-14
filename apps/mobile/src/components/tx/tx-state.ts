// The lifecycle of one money action as data (Mitoshi's TxState, Kawase's kinds): idle, review, blocked, signing, sent,
// still waiting, confirmed or failed. A pure reducer so any lane's action drives the same kit: the CTA, the phase bar, the
// steps row, the receipt morph and the failure card are all functions of this one value. Failed always carries whether
// money moved (the card says so, always); "unknown" is its own state because a send whose answer was lost may have gone
// through and is never re-sent.
import type { Diagnosis } from "../kit/diagnosis";

export type MoneyMoved = "no" | "yes" | "unknown";

export type TxState =
  | { kind: "idle" }
  /** The details are being reviewed; the CTA offers the confirm. */
  | { kind: "review" }
  /** Cannot start: `reason` is the blocker, named as the CTA's label. */
  | { kind: "blocked"; reason: string }
  | { kind: "signing"; startedAt: number }
  | { kind: "submitted"; txHash: string | null; startedAt: number }
  /** The chain has not answered in time. Nothing is re-sent; recovery reads the status. */
  | { kind: "unknown"; txHash: string | null; diagnosis: Diagnosis }
  | { kind: "confirmed"; txHash: string | null }
  | { kind: "failed"; diagnosis: Diagnosis; moneyMoved: MoneyMoved; txHash: string | null };

export type TxEvent =
  | { type: "review" }
  | { type: "block"; reason: string }
  | { type: "confirm"; nowMs: number }
  | { type: "submitted"; txHash: string | null; nowMs: number }
  | { type: "receipt"; txHash: string | null; status: "success" | "reverted"; diagnosis?: Diagnosis }
  | { type: "error"; diagnosis: Diagnosis; moneyMoved?: MoneyMoved }
  | { type: "timeout"; diagnosis: Diagnosis }
  | { type: "reset" };

export const TX_IDLE: TxState = { kind: "idle" };

const REVERTED: Diagnosis = { kind: "unknown", retryable: true, technical: "reverted" };

export function reduceTx(state: TxState, event: TxEvent): TxState {
  switch (event.type) {
    case "reset":
      return TX_IDLE;
    case "review":
      return state.kind === "idle" || state.kind === "blocked" || state.kind === "failed" ? { kind: "review" } : state;
    case "block":
      return state.kind === "signing" || state.kind === "submitted" || state.kind === "unknown" ? state : { kind: "blocked", reason: event.reason };
    case "confirm":
      return state.kind === "idle" || state.kind === "review" || state.kind === "failed" ? { kind: "signing", startedAt: event.nowMs } : state;
    case "submitted":
      return state.kind === "signing" ? { kind: "submitted", txHash: event.txHash, startedAt: event.nowMs } : state;
    case "receipt":
      if (event.status === "success") return { kind: "confirmed", txHash: event.txHash };
      // A reverted transaction spends gas, not the amount: the money did not move.
      return { kind: "failed", diagnosis: event.diagnosis ?? REVERTED, moneyMoved: "no", txHash: event.txHash };
    case "error":
      return { kind: "failed", diagnosis: event.diagnosis, moneyMoved: event.moneyMoved ?? "no", txHash: null };
    case "timeout":
      return { kind: "unknown", txHash: state.kind === "submitted" ? state.txHash : null, diagnosis: event.diagnosis };
  }
}

/** The CTA accepts a tap in these states only. */
export const canConfirm = (state: TxState): boolean => state.kind === "idle" || state.kind === "review" || state.kind === "failed";

/** Something is in flight: the CTA never looks disabled, it shows the phase and absorbs the tap. */
export const isInFlight = (state: TxState): boolean => state.kind === "signing" || state.kind === "submitted" || state.kind === "unknown";

/** How far the action got: 0 signing, 1 sent (or still waiting), 2 confirmed; -1 when nothing is in flight. */
export function txReached(state: TxState): number {
  switch (state.kind) {
    case "signing":
      return 0;
    case "submitted":
    case "unknown":
      return 1;
    case "confirmed":
      return 2;
    default:
      return -1;
  }
}

/** The phase bar's fill: a third per step the action has taken. */
export function txProgress(state: TxState): number {
  switch (state.kind) {
    case "signing":
      return 1 / 3;
    case "submitted":
    case "unknown":
      return 2 / 3;
    case "confirmed":
      return 1;
    default:
      return 0;
  }
}
