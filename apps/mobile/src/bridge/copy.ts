// Words for a bridge in the person's language: each policy reason, the approve button named after the device's
// real check, a chain's name, and the confirm prompt.
import * as React from "react";

import type { BridgeDraftView, BridgeIntent, PolicyResultView } from "@kawase/api-client";
import { getChainIdentity } from "@kawase/identity";

import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";

/** A destination chain's name ("Base Sepolia"), from the identity registry. */
export const chainName = (chainId: number | undefined, fallback = "") => (chainId ? (getChainIdentity(chainId)?.name ?? fallback) : fallback);

export function useBridgePolicyText() {
  const { t } = useT();
  const money = useMoney();
  return (result: PolicyResultView, network: BridgeIntent["network"]) => {
    const p = result.params ?? {};
    const other = network === "testnet" ? t("network.arc") : t("network.arcTestnet");
    return t(`bridgePolicy.${result.code}`, {
      ...p,
      balance: money("USDC", p.balance),
      needed: money("USDC", p.needed),
      fee: money("USDC", p.fee),
      network: other,
      defaultValue: t(`policy.${result.code}`, { defaultValue: result.code }),
    });
  };
}

const APPROVE_KEYS: Record<BiometricKind, string> = {
  faceId: "bridge.bridgeFaceId",
  touchId: "bridge.bridgeTouchId",
  face: "bridge.bridgeFace",
  fingerprint: "bridge.bridgeFingerprint",
  passcode: "bridge.bridgePasscode",
  emailCode: "bridge.bridgeEmailCode",
  none: "bridge.bridgeFaceId",
};

export function useBridgeApproveLabel() {
  const { t } = useT();
  const [kind, setKind] = React.useState<BiometricKind>("faceId");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);
  return t(APPROVE_KEYS[kind]);
}

export function useBridgePrompt() {
  const { t } = useT();
  const money = useMoney();
  return (draft: BridgeDraftView | null) =>
    draft ? t("bridge.signPrompt", { amount: money("USDC", draft.amount), chain: chainName(draft.chainId, draft.destination) }) : t("bridge.title");
}
