// One wallet-signed intent's life on the device (swaps, bridges): the intent as the api sees it, polled while it
// moves; new versions from edits and re-quotes; and the approval. Inside the weekly budget (D38) a swap or a vault
// move is signed with no prompt: one-shot leaves the phone checks itself (budget/silent.ts) and Kawase's ops wallet
// redeems. Everything else (outside the budget, a bridge, a perp, a loan) is the owner's own yes (Face ID, or the web's
// confirm) followed by the wallet signing the one transaction the api built (a batch to itself), which the api checks
// again before broadcasting.
//
// Ownership of what is shown (Codex review R17): reads are tagged with the epoch they started in, a newer action
// bumps it, and a final outcome is never replaced by a non-final one. A lost connection while it moves is shown as
// "checking", never as "nothing happened", and nothing is re-sent on its own.
import { randomUUID } from "expo-crypto";
import * as React from "react";
import { toast } from "sonner-native";

import { ApiError, hasBrake, type IntentState, type UnsignedTransaction } from "@kawase/api-client";

import type { TypedDataDefinition } from "viem";

import { trySilentLeaves, releaseIfDead } from "@/budget/silent";
import { guardCopyKeys } from "@/budget/reasons";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { sayIfPractice } from "@/safety/practice-refusal";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const POLL_MS = 2_000;
/** Signatures one approval may chain (a two-step Bring to Arc is two). */
const MAX_STEPS = 2;
const MOVING: ReadonlySet<IntentState> = new Set(["approved", "executing", "unknown_outcome"]);
const OPEN: ReadonlySet<IntentState> = new Set(["submitted", "working", "input_required", "auth_required", "ready_for_approval"]);

type Intent = { id: string; state: IntentState; version: number; network: "mainnet" | "testnet"; results?: readonly { code: string }[] };

/** The intents whose approval can go through the budget's leaves (the api's /budget/{swaps,earn}/:id/leaf). */
function leafKindOf(calls: unknown): "swap" | "earn" | undefined {
  if (calls === api.swaps) return "swap";
  if (calls === api.earn) return "earn";
  return undefined;
}

/** Reasons the person already knows from their own settings: no toast when the confirm appears. */
const QUIET_REASONS = new Set(["no_budget", "paused", "guard_mode", "practice", "category_off"]);
type Approve<T> =
  | { status: "executing" | "changed" | "final"; intent: T }
  | { status: "sign"; intent: T; approvalId: string; transaction: UnsignedTransaction }
  // A gasless move (Bring to Arc): one EIP-712 signature instead of a transaction; the api hands it on.
  | { status: "sign_typed"; intent: T; approvalId: string; typedData: Record<string, unknown> };

/** The api calls one kind of wallet intent needs. */
export type WalletIntentApi<T extends Intent, R> = {
  get: (id: string) => Promise<{ intent: T }>;
  revise: (id: string, patch: R) => Promise<{ intent: T }>;
  cancel: (id: string) => Promise<{ intent: T }>;
  /** `override`: the person goes ahead past the brake shown on the card (swaps, margin). */
  approve: (id: string, version: number, idempotencyKey?: string, override?: boolean) => Promise<Approve<T>>;
  signature: (id: string, approvalId: string, signed: string, kind?: "transaction" | "typed") => Promise<Approve<T>>;
};

export const isIntentMoving = (intent: Intent) => MOVING.has(intent.state);
export const isIntentOpen = (intent: Intent) => OPEN.has(intent.state);
export const isIntentFinished = (intent: Intent) => !isIntentMoving(intent) && !isIntentOpen(intent);

function supersedes<T extends Intent>(current: T | undefined, next: T) {
  if (!current || current.id !== next.id) return true;
  if (next.version < current.version) return false;
  if (isIntentFinished(current) && !isIntentFinished(next)) return false;
  return true;
}

export type WalletIntentController<T, R> = {
  intent: T | undefined;
  busy: boolean;
  connectionLost: boolean;
  /** An edit, or an empty patch to quote again: a new version of the same intent. */
  revise: (patch: R) => Promise<T | undefined>;
  approve: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
  set: (intent: T) => void;
  /** Forget the intent shown (back to the start of a flow). */
  reset: () => void;
};

export function useWalletIntent<T extends Intent, R>(
  calls: WalletIntentApi<T, R>,
  messages: { changed: string; unavailable: string },
  initial?: T | undefined,
): WalletIntentController<T, R> {
  const { t } = useT();
  const [intent, setIntent] = React.useState<T | undefined>(initial);
  const [busy, setBusy] = React.useState(false);
  const [connectionLost, setConnectionLost] = React.useState(false);
  const epoch = React.useRef(0);
  const signer = useWalletSigner();
  const id = intent?.id;

  const show = React.useCallback((next: T, startedIn?: number) => {
    if (startedIn !== undefined && startedIn !== epoch.current) return;
    setIntent((current) => (supersedes(current, next) ? next : current));
  }, []);
  const set = React.useCallback(
    (next: T) => {
      epoch.current += 1;
      show(next);
    },
    [show],
  );

  const reset = React.useCallback(() => {
    epoch.current += 1;
    setIntent(undefined);
    setConnectionLost(false);
  }, []);

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const startedIn = epoch.current;
    try {
      const { intent: fresh } = await calls.get(id);
      setConnectionLost(false);
      show(fresh, startedIn);
    } catch {
      setConnectionLost(true);
    }
  }, [calls, id, show]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const moving = intent ? isIntentMoving(intent) : false;
  // A silent action that ended without moving money gives its room in the phone's weekly ledger back.
  const signerAddress = signer?.address;
  React.useEffect(() => {
    if (intent) releaseIfDead(intent, signerAddress);
  }, [intent, signerAddress]);
  React.useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [moving, refresh]);

  const act = async <V,>(work: () => Promise<V>): Promise<V | undefined> => {
    epoch.current += 1;
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      if (sayIfPractice(error, t)) {
        // Practice mode: said with the way to turn it off.
      } else if (error instanceof ApiError) {
        toast(
          error.code === "quote_unavailable"
            ? messages.unavailable
            : error.code === "intent_stale" || error.code === "intent_final"
              ? messages.changed
              : t("send.failed"),
        );
      } else {
        setConnectionLost(true);
      }
      await refresh();
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const revise = (patch: R) =>
    act(async () => {
      if (!id) return undefined;
      const { intent: next } = await calls.revise(id, patch);
      show(next);
      return next;
    });

  const approve = async (prompt: string) => {
    if (!intent) return;
    await act(async () => {
      // Inside the weekly budget: the leaves, checked on the phone and signed with no prompt. A braked draft (its warning
      // on the card) is never silent: Face ID below is the person's override.
      const leafKind = leafKindOf(calls);
      if (leafKind && signer && !hasBrake(intent.results)) {
        const silent = await trySilentLeaves(leafKind, intent as never, signer);
        if (silent.handled) {
          if (silent.answer.status === "changed") toast(messages.changed);
          show(silent.answer.intent as unknown as T);
          return;
        }
        if (silent.verdict && !silent.verdict.silent && !QUIET_REASONS.has(silent.verdict.reason)) toast(t(guardCopyKeys(silent.verdict).line));
      }
      // The brake's warning is on the card the person just tapped through; Face ID below is their override.
      const answer = await calls.approve(intent.id, intent.version, randomUUID(), hasBrake(intent.results));
      if (answer.status !== "sign" && answer.status !== "sign_typed") {
        if (answer.status === "changed") toast(messages.changed);
        show(answer.intent);
        return;
      }
      const check = await confirmWithBiometrics(prompt, t("common.cancel"));
      if (check !== "approved" || !signer) {
        toast(
          check === "unavailable" || !signer
            ? t("send.approvalUnavailable")
            : check === "failed"
              ? t("send.approvalFailed")
              : t("send.faceIdCancelled"),
        );
        show(answer.intent);
        return;
      }
      // A move in two steps (Bring to Arc: the token's approval there, then the transfer's signature) comes back with
      // its next signature: the same yes covers it.
      let step: Approve<T> = answer;
      for (let index = 0; index < MAX_STEPS; index++) {
        const current = step;
        if (current.status === "sign_typed") step = await calls.signature(intent.id, current.approvalId, await signer.signTypedData(current.typedData as unknown as TypedDataDefinition), "typed");
        else if (current.status === "sign") step = await calls.signature(intent.id, current.approvalId, await signer.signTransaction(toSerializable(current.transaction)), "transaction");
        else break;
      }
      if (step.status === "changed") toast(messages.changed);
      show(step.intent);
    });
  };

  const cancel = async () => {
    if (!intent || !isIntentOpen(intent)) return;
    await act(async () => {
      const { intent: next } = await calls.cancel(intent.id);
      show(next);
    });
  };

  return { intent, busy, connectionLost, revise, approve, cancel, refresh, set, reset };
}
