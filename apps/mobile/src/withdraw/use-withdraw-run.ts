// Running a withdrawal (money-out.md "How": review lines → Face ID always → the moves → tracker → receipt). The
// withdrawal lives on the server (it survives the app closing); the person confirms once with Face ID for what they
// reviewed, then the app asks the server for each next step's intent — created with the amount known by then, or
// the same intent while it still stands — and the wallet signs exactly what that step's engine built (swap, send
// with R6, cross-chain). A step that does not go stops the run there and says why; "Finish it" picks up from that
// step, after a restart too (R7: nothing is re-sent on its own; a step whose outcome is unknown shows as checking).
// When every step left is signed on Arc (conversions, transfers, the burn that starts a bridge), the server offers
// them as one transaction: the wallet signs once, the chain takes all of it or none, and only a delivery on another
// chain is followed afterwards.
import { randomUUID } from "expo-crypto";
import * as React from "react";
import type { TypedDataDefinition } from "viem";

import type { UnsignedTransaction, WithdrawalNextView, WithdrawalView, WithdrawPlanInput } from "@kawase/api-client";

import { useT } from "@/i18n";
import { sayIfPractice } from "@/safety/practice-refusal";
import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const POLL_MS = 2_500;
const MINUTE_MS = 60_000;
/** A bridge is followed this long on screen (CCTP standard can take ~15 minutes); the server keeps following after. */
const BRIDGE_FOLLOW_MINUTES = 20;
const STEP_FOLLOW_MINUTES = 3;
/** A step whose quote moved between version and signature is re-approved this many times inside the one yes. */
const CHANGED_RETRIES = 2;

export type RunPhase = "idle" | "confirming" | "running" | "done" | "stopped";
type Answer = { status: string; approvalId?: string; transaction?: UnsignedTransaction; typedData?: Record<string, unknown> };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useWithdrawRun() {
  const { t } = useT();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [withdrawal, setWithdrawal] = React.useState<WithdrawalView>();
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const running = React.useRef(false);

  /** A withdrawal opened from Activity or a restart: where it stands now. */
  const load = React.useCallback(async (id: string) => {
    const { withdrawal: found } = await api.withdrawals.get(id);
    setWithdrawal(found);
    setPhase(found.status === "done" ? "done" : found.status === "canceled" ? "idle" : "stopped");
    return found;
  }, []);

  const reset = React.useCallback(() => {
    if (running.current) return;
    setWithdrawal(undefined);
    setPhase("idle");
  }, []);

  /** Approves one version and, when the wallet must sign, signs exactly what the api built. */
  const sign = React.useCallback(
    async (intent: NonNullable<WithdrawalNextView["intent"]>): Promise<string> => {
      const key = randomUUID();
      // The brake (most of the balance to a new address) was on the review the person confirmed: their override.
      const approve = (): Promise<Answer> =>
        intent.kind === "swap"
          ? api.swaps.approve(intent.id, intent.version, key, intent.brake)
          : intent.kind === "send"
            ? api.sends.approve(intent.id, intent.version, key, intent.brake)
            : api.crosschain.approve(intent.id, intent.version, key);
      const answer = await approve();
      if (answer.status !== "sign" && answer.status !== "sign_typed") return answer.status;
      if (!signer || !answer.approvalId) throw new Error("no signer");
      const typed = answer.status === "sign_typed";
      const signed = typed ? await signer.signTypedData(answer.typedData as unknown as TypedDataDefinition) : await signer.signTransaction(toSerializable(answer.transaction!));
      const submitted: Answer =
        intent.kind === "swap"
          ? await api.swaps.signature(intent.id, answer.approvalId, signed)
          : intent.kind === "send"
            ? await api.sends.signature(intent.id, answer.approvalId, signed, typed ? "typed" : undefined)
            : await api.crosschain.signature(intent.id, answer.approvalId, typed ? { signature: signed } : { signedTransaction: signed });
      return submitted.status;
    },
    [signer],
  );

  /** Every step left as one transaction: built by the server, signed once by the wallet, broadcast once. */
  const signBatch = React.useCallback(
    async (id: string): Promise<string> => {
      // The brake (a first-time destination) was on the review the person confirmed with Face ID: their override.
      const answer = await api.withdrawals.batch(id, true);
      setWithdrawal(answer.withdrawal);
      if (answer.status !== "sign") return answer.status;
      if (!signer) throw new Error("no signer");
      const signed = await signer.signTransaction(toSerializable(answer.transaction));
      const submitted = await api.withdrawals.batchSignature(id, answer.approvalId, signed);
      setWithdrawal(submitted.withdrawal);
      return submitted.status;
    },
    [signer],
  );

  /** Follows the step until it lands, stops, or the screen's watch ends (the server keeps the record). */
  const follow = React.useCallback(async (id: string, stepId: string, bridge: boolean) => {
    const until = Date.now() + (bridge ? BRIDGE_FOLLOW_MINUTES : STEP_FOLLOW_MINUTES) * MINUTE_MS;
    while (Date.now() < until) {
      await sleep(POLL_MS);
      try {
        const { withdrawal: fresh } = await api.withdrawals.get(id);
        setWithdrawal(fresh);
        const step = fresh.steps.find((entry) => entry.id === stepId);
        if (!step || step.state === "done" || step.state === "failed") return step?.state ?? "failed";
      } catch {
        // A missed read is read again; nothing is decided from it.
      }
    }
    return "active";
  }, []);

  const runLoop = React.useCallback(
    async (id: string) => {
      running.current = true;
      setPhase("running");
      let changed = 0;
      try {
        for (;;) {
          const next = await api.withdrawals.next(id);
          setWithdrawal(next.withdrawal);
          if (!next.step) {
            setPhase("done");
            return "done" as const;
          }
          if (next.batch) {
            const status = await signBatch(id);
            if (status === "changed" || status === "steps") {
              if (changed++ >= CHANGED_RETRIES) {
                setPhase("stopped");
                return "stopped" as const;
              }
              continue;
            }
            if (status !== "executing") {
              setPhase("stopped");
              return "stopped" as const;
            }
            // One transaction: the last step settles last (a bridge's delivery on the other chain).
            const lastId = next.batch.steps.at(-1)!;
            const last = next.withdrawal.steps.find((entry) => entry.id === lastId);
            const outcome = await follow(id, lastId, last?.kind === "bridge");
            if (outcome !== "done") {
              setPhase("stopped");
              return "stopped" as const;
            }
            continue;
          }
          if (!next.intent || next.intent.blocking) {
            setPhase("stopped");
            return "stopped" as const;
          }
          const status = await sign(next.intent);
          if (status === "changed") {
            if (changed++ >= CHANGED_RETRIES) {
              setPhase("stopped");
              return "stopped" as const;
            }
            continue;
          }
          const outcome = await follow(id, next.step.id, next.step.kind === "bridge");
          if (outcome !== "done") {
            setPhase("stopped");
            return "stopped" as const;
          }
        }
      } catch (error) {
        sayIfPractice(error, t);
        setPhase("stopped");
        return "stopped" as const;
      } finally {
        running.current = false;
      }
    },
    [follow, sign, signBatch, t],
  );

  const confirm = React.useCallback(
    async (prompt: string, cancelLabel: string): Promise<"approved" | "declined" | "unavailable"> => {
      setPhase("confirming");
      const check = await confirmWithBiometrics(prompt, cancelLabel);
      if (check === "approved" && signer) return "approved";
      setPhase(withdrawal ? "stopped" : "idle");
      return check === "unavailable" || !signer ? "unavailable" : "declined";
    },
    [signer, withdrawal],
  );

  /** One Face ID for the reviewed plan, then the server-held withdrawal runs step by step. */
  const start = React.useCallback(
    async (input: WithdrawPlanInput, prompt: string, cancelLabel: string) => {
      if (running.current) return "stopped" as const;
      const check = await confirm(prompt, cancelLabel);
      if (check !== "approved") return check;
      try {
        const { withdrawal: created } = await api.withdrawals.start(input);
        setWithdrawal(created);
        return await runLoop(created.id);
      } catch {
        setPhase("idle");
        return "failed" as const;
      }
    },
    [confirm, runLoop],
  );

  /** "Finish it": another Face ID, then the first step not done (the same intent while it stands). */
  const resume = React.useCallback(
    async (prompt: string, cancelLabel: string) => {
      if (running.current || !withdrawal) return "stopped" as const;
      const check = await confirm(prompt, cancelLabel);
      if (check !== "approved") return check;
      return runLoop(withdrawal.id);
    },
    [confirm, runLoop, withdrawal],
  );

  return { withdrawal, phase, start, resume, load, reset };
}
