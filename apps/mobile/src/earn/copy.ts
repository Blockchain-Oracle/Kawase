// Words for earning in the person's language: each policy reason, the approve button named after the device's real
// check and the action, the confirm prompt, and yields as percentages.
import * as React from "react";

import type { EarnDraftView, EarnIntent, PolicyResultView } from "@kawase/api-client";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";

const SUFFIX: Record<BiometricKind, string> = {
  faceId: "FaceId",
  touchId: "TouchId",
  face: "Face",
  fingerprint: "Fingerprint",
  passcode: "Passcode",
  emailCode: "EmailCode",
  none: "FaceId",
};

/** "4.20%": a yearly yield as the person reads percentages. */
export function usePercent() {
  const { locale } = useLocale();
  return (fraction: number) => new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fraction);
}

export function useEarnPolicyText() {
  const { t } = useT();
  const money = useMoney();
  return (result: PolicyResultView, network: EarnIntent["network"]) => {
    const p = result.params ?? {};
    const other = network === "testnet" ? t("network.arc") : t("network.arcTestnet");
    return t(`earnPolicy.${result.code}`, {
      ...p,
      balance: money("USDC", p.balance),
      needed: money("USDC", p.needed),
      position: money("USDC", p.position),
      available: money("USDC", p.available),
      network: other,
      defaultValue: t(`policy.${result.code}`, { defaultValue: result.code }),
    });
  };
}

export function useEarnApproveLabel() {
  const { t } = useT();
  const [kind, setKind] = React.useState<BiometricKind>("faceId");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);
  return (action: "deposit" | "withdraw") => t(`earn.${action}${SUFFIX[kind]}`);
}

export function useEarnPrompt() {
  const { t } = useT();
  const money = useMoney();
  return (draft: EarnDraftView | null) =>
    !draft
      ? t("earn.title")
      : draft.action === "deposit"
        ? t("earn.signPromptDeposit", { amount: money("USDC", draft.amount), vault: draft.vault.name })
        : t("earn.signPromptWithdraw", { amount: money("USDC", draft.amount), vault: draft.vault.name });
}
