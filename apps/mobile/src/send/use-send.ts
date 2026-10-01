// One send's life on the device, shared by the send screen and the chat card: the intent as the api sees it,
// polled while it is moving; the fixes (a re-check after a saved contact, a chosen currency, a new amount) that make
// a new version of the same send; and the approval. Inside the allowance the tap is the approval. Above it the
// device owner confirms with Face ID and the wallet signs the exact transfer the api built, which the api checks
// against the draft before anything is broadcast.
import { randomUUID } from "expo-crypto";
import * as React from "react";
import { toast } from "sonner-native";

import { ApiError, type SendIntent, type SendRequest } from "@kawase/api-client";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

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

export type SendController = {
  intent: SendIntent | undefined;
  busy: boolean;
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
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const id = intent?.id;

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const { intent: fresh } = await api.sends.get(id);
    setIntent(fresh);
  }, [id]);

  // A card reopened later shows what happened since, and a send in flight is followed until it settles.
  React.useEffect(() => {
    if (!id) return;
    void refresh().catch(() => undefined);
  }, [id, refresh]);
  const moving = intent ? isMoving(intent) : false;
  React.useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => void refresh().catch(() => undefined), POLL_MS);
    return () => clearInterval(timer);
  }, [moving, refresh]);

  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      if (error instanceof ApiError && (error.code === "intent_stale" || error.code === "intent_final")) {
        toast(t("send.changed"));
        await refresh().catch(() => undefined);
      } else toast(t("send.failed"));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const revise = (patch: SendRequest) =>
    run(async () => {
      if (!id) return undefined;
      const { intent: next } = await api.sends.revise(id, patch);
      setIntent(next);
      return next;
    });

  const approve = async (prompt: string) => {
    if (!intent) return;
    await run(async () => {
      const answer = await api.sends.approve(intent.id, intent.version, randomUUID());
      if (answer.status !== "sign") {
        if (answer.status === "changed") toast(t("send.changed"));
        setIntent(answer.intent);
        return;
      }
      // Above the allowance: the owner confirms, then the wallet signs the exact transaction the api built.
      const confirmed = await confirmWithBiometrics(prompt, t("common.cancel"));
      if (confirmed === "cancelled" || !signer) {
        toast(t("send.faceIdCancelled"));
        setIntent(answer.intent);
        return;
      }
      const signed = await signer.signTransaction(toSerializable(answer.transaction));
      const submitted = await api.sends.signature(intent.id, answer.approvalId, signed);
      if (submitted.status === "changed") toast(t("send.changed"));
      setIntent(submitted.intent);
    });
  };

  const cancel = async () => {
    if (!intent || !isOpen(intent)) return;
    await run(async () => {
      const { intent: next } = await api.sends.cancel(intent.id);
      setIntent(next);
    });
  };

  return { intent, busy, revise, approve, cancel, refresh, set: setIntent };
}
