/**
 * Drives the TxState for one money action (Mitoshi's `useTxLifecycle`): the reducer fed by the action's own phases and
 * its outcome. The action passes a function that does the signing and sending; it reports `journalled` (after the
 * signature, before the send: the intent is written to the journal) and `submitted` (the hash is known) as it goes, and
 * returns how it ended. Announces the transitions that matter, and plays the money sound and haptic ONCE per confirmed
 * result (a stable identity keeps a remount from replaying it) and the failure cue on a failure. A send whose answer
 * timed out is left `unknown` for recovery and is never sent again.
 */
import { useCallback, useReducer, useRef } from "react";

import { useT } from "@/i18n";
import { fire, type SoundName } from "@/feedback/fire";

import { announce } from "../kit/announce";
import { type Diagnosis, diagnose } from "../kit/diagnosis";
import { forgetIntent, journalIntent, type JournalMark, noteTxHash } from "./journal";
import { reduceTx, type TxEvent, type TxState, TX_IDLE } from "./tx-state";

export type TxOutcome =
  | { status: "confirmed"; txHash?: string | null }
  | { status: "reverted"; diagnosis: Diagnosis; txHash?: string | null }
  | { status: "refused"; diagnosis: Diagnosis }
  | { status: "unknown"; diagnosis: Diagnosis };

export type TxProgress = {
  /** After the signature and before the send: written to the journal so a kill cannot lose it. */
  journalled: (mark: JournalMark, id: string, owner: string) => void;
  /** The transaction is on its way (its hash, when it has one). */
  submitted: (txHash?: string | null) => void;
};

export type TxRunOptions = {
  /** A stable id for this action's outcome sound (an intent id, a hash): the same result never plays twice. */
  identity?: string;
  /** Which sound says it worked: "send" for money leaving, "received" for money arriving, "confirmed" otherwise. */
  sound?: Extract<SoundName, "confirmed" | "send" | "received">;
};

export type TxRunner = {
  state: TxState;
  dispatch: (event: TxEvent) => void;
  /** Runs one action; resolves with its outcome. A thrown error becomes a refused outcome with its diagnosis. */
  run: (send: (progress: TxProgress) => Promise<TxOutcome>, options?: TxRunOptions) => Promise<TxOutcome>;
  reset: () => void;
};

export function useTxLifecycle(): TxRunner {
  const { t } = useT();
  const [state, dispatch] = useReducer(reduceTx, TX_IDLE);
  const journalId = useRef<string | null>(null);
  const run = useCallback(
    async (send: (progress: TxProgress) => Promise<TxOutcome>, options: TxRunOptions = {}): Promise<TxOutcome> => {
      dispatch({ type: "confirm", nowMs: Date.now() });
      journalId.current = null;
      const progress: TxProgress = {
        journalled: (mark, id, owner) => {
          journalId.current = id;
          journalIntent({ ...mark, id, owner: owner.toLowerCase(), sentAt: Date.now() });
        },
        submitted: (txHash = null) => {
          if (txHash && journalId.current) noteTxHash(journalId.current, txHash);
          dispatch({ type: "submitted", txHash, nowMs: Date.now() });
        },
      };
      let outcome: TxOutcome;
      try {
        outcome = await send(progress);
      } catch (error) {
        outcome = { status: "refused", diagnosis: diagnose(error) };
      }
      const settle = () => {
        if (journalId.current) forgetIntent(journalId.current);
      };
      switch (outcome.status) {
        case "confirmed":
          settle();
          dispatch({ type: "receipt", txHash: outcome.txHash ?? null, status: "success" });
          announce(t("shell.tx.confirmed"));
          fire("filled", { sound: options.sound ?? "confirmed", ...(options.identity ? { identity: options.identity } : {}) });
          break;
        case "reverted":
          settle();
          dispatch({ type: "receipt", txHash: outcome.txHash ?? null, status: "reverted", diagnosis: outcome.diagnosis });
          announce(t("shell.tx.moneyMoved.no"));
          fire("fail", { sound: "error" });
          break;
        case "refused":
          settle();
          dispatch({ type: "error", diagnosis: outcome.diagnosis });
          announce(t("shell.tx.moneyMoved.no"));
          // A cancelled prompt is the person's own choice, not a failure worth a sound.
          if (outcome.diagnosis.kind !== "rejected") fire("fail", { sound: "error" });
          break;
        case "unknown":
          // Left in the journal: recovery reads the status; this never sends again.
          dispatch({ type: "timeout", diagnosis: outcome.diagnosis });
          announce(t("shell.tx.unknown"));
          break;
      }
      return outcome;
    },
    [t],
  );
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  return { state, dispatch, run, reset };
}
