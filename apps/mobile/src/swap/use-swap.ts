// One swap's life on the device, shared by the swap screen and the chat card (the same contract as useSend): the
// intent as the api sees it, polled while it moves; re-quotes and edits that make a new version; and the approval.
// A swap is always the owner's own yes (Face ID, or an email code on the web), then the wallet signs the one
// transaction the api built (approve + swap to itself), which the api checks again before broadcasting.
//
// Ownership of what is shown (Codex review R17): reads are tagged with the epoch they started in, a newer action
// bumps it, and a final outcome is never replaced by a non-final one. A lost connection while the swap moves is
// shown as "checking", never as "nothing happened", and nothing is re-sent on its own.
import { randomUUID } from "expo-crypto";
import * as React from "react";
import { toast } from "sonner-native";

import { ApiError, type SwapIntent, type SwapRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const POLL_MS = 2_000;
const MOVING: ReadonlySet<SwapIntent["state"]> = new Set(["approved", "executing", "unknown_outcome"]);
const OPEN: ReadonlySet<SwapIntent["state"]> = new Set(["submitted", "working", "input_required", "auth_required", "ready_for_approval"]);

export const isSwapMoving = (intent: SwapIntent) => MOVING.has(intent.state);
export const isSwapOpen = (intent: SwapIntent) => OPEN.has(intent.state);
export const isSwapFinished = (intent: SwapIntent) => !isSwapMoving(intent) && !isSwapOpen(intent);

function supersedes(current: SwapIntent | undefined, next: SwapIntent) {
  if (!current || current.id !== next.id) return true;
  if (next.version < current.version) return false;
  if (isSwapFinished(current) && !isSwapFinished(next)) return false;
  return true;
}

export type SwapController = {
  intent: SwapIntent | undefined;
  busy: boolean;
  connectionLost: boolean;
  /** A new amount or direction, or an empty patch to quote again: a new version of the same swap. */
  revise: (patch: SwapRequest) => Promise<SwapIntent | undefined>;
  approve: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
  set: (intent: SwapIntent) => void;
};

export function useSwap(initial?: SwapIntent | undefined): SwapController {
  const { t } = useT();
  const [intent, setIntent] = React.useState<SwapIntent | undefined>(initial);
  const [busy, setBusy] = React.useState(false);
  const [connectionLost, setConnectionLost] = React.useState(false);
  const epoch = React.useRef(0);
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const id = intent?.id;

  const show = React.useCallback((next: SwapIntent, startedIn?: number) => {
    if (startedIn !== undefined && startedIn !== epoch.current) return;
    setIntent((current) => (supersedes(current, next) ? next : current));
  }, []);
  const set = React.useCallback(
    (next: SwapIntent) => {
      epoch.current += 1;
      show(next);
    },
    [show],
  );

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const startedIn = epoch.current;
    try {
      const { intent: fresh } = await api.swaps.get(id);
      setConnectionLost(false);
      show(fresh, startedIn);
    } catch {
      setConnectionLost(true);
    }
  }, [id, show]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const moving = intent ? isSwapMoving(intent) : false;
  React.useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [moving, refresh]);

  const act = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    epoch.current += 1;
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      if (error instanceof ApiError) {
        toast(
          error.code === "quote_unavailable"
            ? t("swap.quoteUnavailable")
            : error.code === "intent_stale" || error.code === "intent_final"
              ? t("swap.changed")
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

  const revise = (patch: SwapRequest) =>
    act(async () => {
      if (!id) return undefined;
      const { intent: next } = await api.swaps.revise(id, patch);
      show(next);
      return next;
    });

  const approve = async (prompt: string) => {
    if (!intent) return;
    await act(async () => {
      const answer = await api.swaps.approve(intent.id, intent.version, randomUUID());
      if (answer.status !== "sign") {
        if (answer.status === "changed") toast(t("swap.changed"));
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
      const signed = await signer.signTransaction(toSerializable(answer.transaction));
      const submitted = await api.swaps.signature(intent.id, answer.approvalId, signed);
      if (submitted.status === "changed") toast(t("swap.changed"));
      show(submitted.intent);
    });
  };

  const cancel = async () => {
    if (!intent || !isSwapOpen(intent)) return;
    await act(async () => {
      const { intent: next } = await api.swaps.cancel(intent.id);
      show(next);
    });
  };

  return { intent, busy, connectionLost, revise, approve, cancel, refresh, set };
}
