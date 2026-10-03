// Words for Withdraw, in the person's language: where it goes (an exchange's name, a saved place's own name, or
// "My wallet on Base"), each line's route and what arrives, why a line cannot go (R2), and each tracker step.
import type { PolicyResultView, WithdrawalStepView, WithdrawDestinationView, WithdrawLegView, WithdrawReason } from "@kawase/api-client";

import { useT } from "@/i18n";
import { usePolicyText } from "@/send/copy";

type RunStep = WithdrawalStepView;

type Named = Pick<WithdrawDestinationView, "kind" | "label" | "brand" | "chain"> & { exchange?: { name: string } | null | undefined };

export function useDestinationName() {
  const { t } = useT();
  return (destination: Named | null | undefined) => {
    if (!destination) return "";
    if (destination.label) return destination.label;
    if (destination.kind === "exchange") return destination.exchange?.name ?? destination.brand ?? "";
    return t("withdraw.myWalletOn", { chain: destination.chain.name });
  };
}

export function useLegRoute() {
  const { t } = useT();
  return (leg: WithdrawLegView) => {
    const converts = leg.steps[0] === "swap";
    const bridges = leg.steps.includes("bridge");
    const key = converts ? (bridges ? "routeConvertBridge" : "routeConvertTransfer") : bridges ? "routeBridge" : "routeTransfer";
    return t(`withdraw.${key}`, { chain: leg.receive.chain });
  };
}

export function useWithdrawReason() {
  const { t } = useT();
  return (reason: WithdrawReason, context: { exchange?: string | undefined; symbol?: string | undefined; chain?: string | undefined; network?: string | undefined }) =>
    t(`withdraw.reason_${reason}`, { exchange: context.exchange ?? "", symbol: context.symbol ?? "", chain: context.chain ?? "", network: context.network ?? "" });
}

/** A tracker step in words: "Convert 0.3 EURC to USDC", "Send 12 USDC to Kraken", "Bridge 12 USDC to Base". */
export function useStepTitle() {
  const { t } = useT();
  return (step: RunStep, amount: string, where: string, chain: string) => {
    if (step.kind === "swap") return t("withdraw.stepConvert", { amount });
    if (step.kind === "bridge") return t("withdraw.stepBridge", { amount, chain });
    return t("withdraw.stepSend", { amount, to: where });
  };
}

/** Why a step stopped: the engine's own reason when it gave one, else what happened to the money. */
export function useStepProblem() {
  const { t } = useT();
  const policy = usePolicyText();
  return (step: RunStep, network: "mainnet" | "testnet") => {
    if (step.blocking) return stepPolicy(step.kind, step.blocking, network, policy, t);
    switch (step.failure) {
      case "changed":
        return t("withdraw.failChanged");
      case "checking":
        return t("withdraw.failChecking");
      case "not_sent":
        return t("withdraw.failNotSent");
      default:
        return t("withdraw.failUnavailable");
    }
  };
}

function stepPolicy(kind: RunStep["kind"], result: PolicyResultView, network: "mainnet" | "testnet", policy: ReturnType<typeof usePolicyText>, t: ReturnType<typeof useT>["t"]) {
  if (kind === "send") return policy(result, network);
  const namespace = kind === "swap" ? "swapPolicy" : "movePolicy";
  return t(`${namespace}.${result.code}`, { ...(result.params ?? {}), defaultValue: t("withdraw.failUnavailable") });
}
