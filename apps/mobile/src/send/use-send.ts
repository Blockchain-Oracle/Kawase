// One send's life on the device, shared by the send screen and the chat card: the intent as the api sees it,
// polled while it is moving; the fixes (a re-check after a saved contact, a chosen currency, a new amount) that make
// a new version of the same send; and the approval. Inside the allowance the tap is the approval. Above it the
// device owner confirms (only an explicit "approved" continues) and the wallet signs the exact transfer the api
// built, which the api checks against the draft before anything is broadcast.
//
// Ownership of what is shown (Codex review R17): every read is tagged with the epoch it started in, and a newer
// action (an edit, an approval, another intent) bumps the epoch, so a slow old answer can never replace a newer
// version; a final outcome is never replaced by a non-final one. A connection lost while money may be moving is
// shown as such ("checking"), never as "nothing happened", and nothing is re-sent blindly.
import { randomUUID } from "expo-crypto";
import * as React from "react";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import { ApiError, hasBrake, type SendIntent, type SendRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";
import { sayIfProofNeeded } from "@/session/device-proof";

const POLL_MS = 2_000;
const MOVING: ReadonlySet<SendIntent["state"]> = new Set(["approved", "executing", "unknown_outcome"]);
const OPEN: ReadonlySet<SendIntent["state"]> = new Set([
  "submitted",
  "working",
  "input_required",
  "auth_required",
  "ready_for_approval",
]);

export const isMoving = (intent: SendIntent) => MOVING.has(intent.state);
export const isOpen = (intent: SendIntent) => OPEN.has(intent.state);
export const isFinished = (intent: SendIntent) => !isMoving(intent) && !isOpen(intent);

/** Whether `next` may replace `current` on screen: the same send, never an older version, never un-finishing. */
function supersedes(current: SendIntent | undefined, next: SendIntent) {
  if (!current || current.id !== next.id) return true;
  if (next.version < current.version) return false;
  if (isFinished(current) && !isFinished(next)) return false;
  return true;
}

export type SendController = {
  intent: SendIntent | undefined;
  busy: boolean;
  /** The last read failed while the send was moving: the result is not known on this device yet. */
  connectionLost: boolean;
  /** Re-checks (an empty patch) or edits the same send: a new version. */
  revise: (patch: SendRequest) => Promise<SendIntent | undefined>;
  approve: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Replaces the intent shown (a new send from the screen). */
  set: (intent: SendIntent) => void;
};

export function useSend(initial?: SendIntent | undefined): SendController {
  const { t } = useT();
  const [intent, setIntent] = React.useState<SendIntent | undefined>(initial);
  const [busy, setBusy] = React.useState(false);
  const [connectionLost, setConnectionLost] = React.useState(false);
  const epoch = React.useRef(0);
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const id = intent?.id;

  /** Shows `next` if nothing newer happened since `startedIn` and it does not move the send backwards. */
  const show = React.useCallback((next: SendIntent, startedIn?: number) => {
    if (startedIn !== undefined && startedIn !== epoch.current) return;
    setIntent((current) => (supersedes(current, next) ? next : current));
  }, []);
  const set = React.useCallback(
    (next: SendIntent) => {
      epoch.current += 1;
      show(next);
    },
    [show],
  );

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const startedIn = epoch.current;
    try {
      const { intent: fresh } = await api.sends.get(id);
      setConnectionLost(false);
      show(fresh, startedIn);
    } catch {
      setConnectionLost(true);
    }
  }, [id, show]);

  // A card reopened later shows what happened since, and a send in flight is followed until it settles.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const moving = intent ? isMoving(intent) : false;
  React.useEffect(() => {
    if (!moving) return undefined;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [moving, refresh]);

  /** Runs an action that changes the send. A refusal the api explains is shown; an answer lost on the way is re-read. */
  const act = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    epoch.current += 1;
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      if (error instanceof ApiError) {
        if (!sayIfProofNeeded(error, t)) toast(error.code === "intent_stale" || error.code === "intent_final" ? t("send.changed") : t("send.failed"));
      } else {
        // No answer: the request may have been taken. Read the send again instead of saying it failed.
        setConnectionLost(true);
      }
      await refresh();
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const revise = (patch: SendRequest) =>
    act(async () => {
      if (!id) return undefined;
      const { intent: next } = await api.sends.revise(id, patch);
      show(next);
      return next;
    });

  const approve = async (prompt: string) => {
    if (!intent) return;
    await act(async () => {
      // The brake (over half the balance to someone new) is on the card; Face ID below is the person's override.
      const answer = await api.sends.approve(intent.id, intent.version, randomUUID(), hasBrake(intent.results));
      if (answer.status !== "sign" && answer.status !== "sign_typed") {
        if (answer.status === "changed") toast(t("send.changed"));
        show(answer.intent);
        return;
      }
      // Above the allowance: the owner confirms, then the wallet signs the exact transaction the api built.
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
      // Gas-free (the wallet cannot pay the fee): one EIP-3009 authorization instead; Kawase's relayer sends it.
      const typed = answer.status === "sign_typed";
      const signed = typed ? await signer.signTypedData(answer.typedData as unknown as TypedDataDefinition) : await signer.signTransaction(toSerializable(answer.transaction));
      const submitted = await api.sends.signature(intent.id, answer.approvalId, signed, typed ? "typed" : undefined);
      if (submitted.status === "changed") toast(t("send.changed"));
      show(submitted.intent);
    });
  };

  const cancel = async () => {
    if (!intent || !isOpen(intent)) return;
    await act(async () => {
      const { intent: next } = await api.sends.cancel(intent.id);
      show(next);
    });
  };

  return { intent, busy, connectionLost, revise, approve, cancel, refresh, set };
}
