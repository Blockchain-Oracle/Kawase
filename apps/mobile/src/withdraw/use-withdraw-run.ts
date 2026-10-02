// Running a reviewed withdrawal (money-out.md "How": review lines → Face ID always → the moves → tracker → receipt).
// The person confirms once with Face ID for the whole plan they reviewed; then each step is an existing intent with
// its own engine and checks (swap, send with R6, cross-chain), built by the api and signed by the wallet, in order:
//   1. every conversion (asset → USDC on Arc), what it delivered added to the USDC that leaves;
//   2. every asset going as itself (a transfer on Arc);
//   3. one move of all the USDC: a transfer on Arc, or one bridge to the other chain (one fee instead of several).
// A step that does not go stops the run there and says why; "Finish it" picks up from that step (R7: nothing is
// re-sent on its own, and a step whose outcome is unknown is shown as checking).
import { randomUUID } from "expo-crypto";
import * as React from "react";
import type { TypedDataDefinition } from "viem";

import type { CrossChainIntent, IntentState, PolicyResultView, SendIntent, SwapIntent, TokenView, UnsignedTransaction, WithdrawPlanView } from "@kawase/api-client";

import { api } from "@/session/api";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { toSerializable } from "@/wallet/use-wallet-setup";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

import { canonicalUnits } from "@/portfolio/ticket-token";

const POLL_MS = 2_500;
/** A bridge is followed this long on screen (CCTP standard can take ~15 minutes); Activity keeps following after. */
const MINUTE_MS = 60_000;
const BRIDGE_FOLLOW_MINUTES = 20;
const STEP_FOLLOW_MINUTES = 3;
const BRIDGE_FOLLOW_MS = BRIDGE_FOLLOW_MINUTES * MINUTE_MS;
const STEP_FOLLOW_MS = STEP_FOLLOW_MINUTES * MINUTE_MS;
const ZERO = BigInt(0);
const FINISHED: ReadonlySet<IntentState> = new Set(["completed", "failed", "rejected", "canceled", "expired"]);
const USDC_DECIMALS = 6;

export type RunStepKind = "swap" | "send" | "bridge";

export type RunStep = {
  id: string;
  kind: RunStepKind;
  /** What leaves: the token converted or sent; USDC for the last move. */
  token: TokenView;
  /** Base units; "pool" = all the USDC gathered for the last move. */
  amount: bigint | "pool";
  state: "pending" | "active" | "done" | "failed";
  /** Bridges: left Arc and on its way (the step is active until it is delivered). */
  arriving?: boolean;
  /** The last move: the USDC lines' own amount, before conversions add to it. */
  direct?: bigint;
  /** What moved (the pool resolved) and what arrived (a conversion's USDC, a bridge's delivery). */
  moved?: bigint;
  received?: bigint;
  explorerUrl?: string | undefined;
  fillUrl?: string | undefined;
  /** Why it did not go: a policy result (worded by the screen) or a plain failure. */
  blocking?: PolicyResultView | null;
  failure?: "declined" | "unavailable" | "not_sent" | "checking" | "changed";
};

export type RunPhase = "idle" | "confirming" | "running" | "done" | "stopped";

type Destination = { chainKey: string; address: string };

/** The steps for a plan: conversions, then assets as themselves, then one move of all the USDC. */
export function buildSteps(plan: WithdrawPlanView): RunStep[] {
  const steps: RunStep[] = [];
  const legs = plan.legs.filter((leg) => leg.status !== "blocked");
  let usdc: TokenView | undefined;
  let usdcDirect = ZERO;
  for (const leg of legs) {
    if (leg.steps[0] === "swap") steps.push({ id: `swap:${leg.token.address}`, kind: "swap", token: leg.token, amount: BigInt(leg.amount), state: "pending" });
    else if (leg.token.symbol === "USDC" && leg.token.status === "canonical") {
      usdc = leg.token;
      usdcDirect += BigInt(leg.amount);
    }
  }
  for (const leg of legs) {
    if (leg.steps[0] !== "swap" && !(leg.token.symbol === "USDC" && leg.token.status === "canonical")) steps.push({ id: `send:${leg.token.address}`, kind: "send", token: leg.token, amount: BigInt(leg.amount), state: "pending" });
  }
  const converts = steps.some((step) => step.kind === "swap");
  if (usdcDirect > ZERO || converts) {
    const toArc = (plan.destination?.chain.key ?? "arc") === "arc";
    const token: TokenView = usdc ?? { chainId: 0, address: "USDC", symbol: "USDC", name: "USD Coin", decimals: USDC_DECIMALS, logoUrl: null, kind: "dollar", status: "canonical", isTest: plan.network === "testnet" };
    steps.push({ id: "usdc", kind: toArc ? "send" : "bridge", token, amount: converts ? "pool" : usdcDirect, direct: usdcDirect, state: "pending" });
  }
  return steps;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function follow<T>(read: () => Promise<T>, done: (value: T) => boolean, forMs: number, onEach?: (value: T) => void): Promise<T | undefined> {
  const until = Date.now() + forMs;
  let last: T | undefined;
  while (Date.now() < until) {
    try {
      last = await read();
      onEach?.(last);
      if (done(last)) return last;
    } catch {
      // A missed read is read again; nothing is decided from it.
    }
    await sleep(POLL_MS);
  }
  return last;
}

type Signed = { approvalId: string; transaction?: UnsignedTransaction; typedData?: Record<string, unknown> };
type Answer<T> = { status: string; intent: T } & Partial<Signed>;

export function useWithdrawRun(plan: WithdrawPlanView | undefined, destination: Destination | undefined) {
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const [steps, setSteps] = React.useState<RunStep[]>([]);
  const [phase, setPhase] = React.useState<RunPhase>("idle");
  const stepsRef = React.useRef<RunStep[]>([]);
  const running = React.useRef(false);

  const update = React.useCallback((id: string, patch: Partial<RunStep>) => {
    stepsRef.current = stepsRef.current.map((step) => (step.id === id ? { ...step, ...patch } : step));
    setSteps(stepsRef.current);
  }, []);

  React.useEffect(() => {
    if (running.current) return;
    stepsRef.current = plan ? buildSteps(plan) : [];
    setSteps(stepsRef.current);
    setPhase("idle");
  }, [plan]);

  /** Approves one version and, when the wallet must sign, signs exactly what the api built. */
  const approveAndSign = React.useCallback(
    async <T,>(approve: () => Promise<Answer<T>>, submit: (approvalId: string, signed: string, typed: boolean) => Promise<Answer<T>>): Promise<Answer<T>> => {
      const answer = await approve();
      if (answer.status !== "sign" && answer.status !== "sign_typed") return answer;
      if (!signer || !answer.approvalId) throw new Error("no signer");
      const typed = answer.status === "sign_typed";
      const signed = typed ? await signer.signTypedData(answer.typedData as unknown as TypedDataDefinition) : await signer.signTransaction(toSerializable(answer.transaction!));
      return submit(answer.approvalId, signed, typed);
    },
    [signer],
  );

  const runStep = React.useCallback(
    async (step: RunStep, pool: bigint): Promise<{ ok: boolean; delivered?: bigint }> => {
      if (!destination) return { ok: false };
      update(step.id, { state: "active", blocking: null, failure: undefined, arriving: false });
      const amount = step.amount === "pool" ? pool : step.amount;
      const decimal = canonicalUnits(amount, step.token.decimals);
      const asset = step.token.symbol === "USDC" && step.token.status === "canonical" ? "USDC" : step.token.address;
      try {
        if (step.kind === "swap") {
          let { intent } = await api.swaps.create({ tokenIn: step.token.address, tokenOut: "USDC", amount: decimal });
          if (intent.blocking?.code === "QUOTE_UNAVAILABLE") intent = (await api.swaps.revise(intent.id, {})).intent;
          if (intent.blocking) return (update(step.id, { state: "failed", blocking: intent.blocking }), { ok: false });
          const answer = await approveAndSign<SwapIntent>(() => api.swaps.approve(intent.id, intent.version, randomUUID()), (approvalId, signed) => api.swaps.signature(intent.id, approvalId, signed));
          if (answer.status === "changed") return (update(step.id, { state: "failed", failure: "changed" }), { ok: false });
          intent = (await follow(() => api.swaps.get(intent.id).then((read) => read.intent), (read) => FINISHED.has(read.state), STEP_FOLLOW_MS)) ?? answer.intent;
          if (intent.state !== "completed") return (update(step.id, { state: "failed", failure: intent.outcome === "checking" ? "checking" : "not_sent", explorerUrl: intent.tx?.explorerUrl }), { ok: false });
          const received = BigInt(intent.received ?? "0");
          update(step.id, { state: "done", received, moved: amount, explorerUrl: intent.tx?.explorerUrl });
          return { ok: true, delivered: received };
        }
        if (step.kind === "send") {
          let { intent } = await api.sends.create({ recipient: destination.address, amount: decimal, asset });
          if (intent.blocking) return (update(step.id, { state: "failed", blocking: intent.blocking }), { ok: false });
          const answer = await approveAndSign<SendIntent>(() => api.sends.approve(intent.id, intent.version, randomUUID()), (approvalId, signed) => api.sends.signature(intent.id, approvalId, signed));
          if (answer.status === "changed") return (update(step.id, { state: "failed", failure: "changed" }), { ok: false });
          intent = (await follow(() => api.sends.get(intent.id).then((read) => read.intent), (read) => FINISHED.has(read.state), STEP_FOLLOW_MS)) ?? answer.intent;
          if (intent.state !== "completed") return (update(step.id, { state: "failed", failure: intent.outcome === "checking" ? "checking" : "not_sent", explorerUrl: intent.tx?.explorerUrl }), { ok: false });
          update(step.id, { state: "done", moved: amount, explorerUrl: intent.tx?.explorerUrl });
          return { ok: true };
        }
        let { intent } = await api.crosschain.create({ direction: "out", asset: "USDC", amount: decimal, destination: destination.chainKey, recipient: destination.address });
        // A route that timed out is quoted again once (a new version), as "Try again" would.
        if (intent.blocking?.code === "QUOTE_UNAVAILABLE") intent = (await api.crosschain.revise(intent.id, {})).intent;
        if (intent.blocking) return (update(step.id, { state: "failed", blocking: intent.blocking }), { ok: false });
        const answer = await approveAndSign<CrossChainIntent>(
          () => api.crosschain.approve(intent.id, intent.version, randomUUID()) as Promise<Answer<CrossChainIntent>>,
          (approvalId, signed, typed) => api.crosschain.signature(intent.id, approvalId, typed ? { signature: signed } : { signedTransaction: signed }) as Promise<Answer<CrossChainIntent>>,
        );
        if (answer.status === "changed") return (update(step.id, { state: "failed", failure: "changed" }), { ok: false });
        const final = await follow(
          () => api.crosschain.get(intent.id).then((read) => read.intent),
          (read) => read.stage === "delivered" || read.stage === "refunded" || read.stage === "failed",
          BRIDGE_FOLLOW_MS,
          (read) => update(step.id, { arriving: read.stage === "submitted" || read.stage === "filling", moved: amount, explorerUrl: read.tx?.explorerUrl }),
        );
        if (final?.stage === "delivered") {
          update(step.id, { state: "done", arriving: false, moved: amount, received: final.received ? BigInt(final.received) : undefined, explorerUrl: final.tx?.explorerUrl, fillUrl: final.fillTx?.explorerUrl });
          return { ok: true };
        }
        update(step.id, { state: "failed", arriving: false, failure: final?.stage === "submitted" || final?.stage === "filling" ? "checking" : "not_sent", explorerUrl: final?.tx?.explorerUrl });
        return { ok: false };
      } catch {
        update(step.id, { state: "failed", failure: "unavailable" });
        return { ok: false };
      }
    },
    [approveAndSign, destination, update],
  );

  const runFrom = React.useCallback(async () => {
    running.current = true;
    setPhase("running");
    // The USDC pool: what was already gathered (finished conversions, the direct USDC lines).
    let pool = stepsRef.current.filter((step) => step.kind === "swap" && step.state === "done").reduce((sum, step) => sum + (step.received ?? ZERO), ZERO);
    const last = stepsRef.current.find((step) => step.id === "usdc");
    if (last && last.amount === "pool") pool += last.direct ?? ZERO;
    for (const step of stepsRef.current) {
      if (step.state === "done") continue;
      const result = await runStep(step, pool);
      if (!result.ok) {
        running.current = false;
        setPhase("stopped");
        return false;
      }
      if (result.delivered) pool += result.delivered;
    }
    running.current = false;
    setPhase("done");
    return true;
  }, [runStep]);

  /** One Face ID for the reviewed plan, then the steps; resumed from the step that stopped ("Finish it"). */
  const start = React.useCallback(
    async (prompt: string, cancelLabel: string): Promise<"done" | "stopped" | "declined" | "unavailable"> => {
      if (running.current) return "stopped";
      setPhase("confirming");
      const check = await confirmWithBiometrics(prompt, cancelLabel);
      if (check !== "approved" || !signer) {
        setPhase(stepsRef.current.some((step) => step.state === "done") ? "stopped" : "idle");
        return check === "unavailable" || !signer ? "unavailable" : "declined";
      }
      return (await runFrom()) ? "done" : "stopped";
    },
    [runFrom, signer],
  );

  return { steps, phase, start };
}
