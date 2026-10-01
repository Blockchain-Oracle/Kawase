// Words for a swap in the person's language: each policy reason as one sentence (swap wording, not send's), the
// approve button named after the device's real check, and the rate lines.
import * as React from "react";

import type { PolicyResultView, SwapDraftView, SwapIntent } from "@kawase/api-client";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";

const PERCENT_BPS = 100;
const RATE_DIGITS = 4;

export function useSwapPolicyText() {
  const { t } = useT();
  const money = useMoney();
  return (result: PolicyResultView, network: SwapIntent["network"]) => {
    const p = result.params ?? {};
    const other = network === "testnet" ? t("network.arc") : t("network.arcTestnet");
    return t(`swapPolicy.${result.code}`, {
      ...p,
      balance: money(p.asset, p.balance),
      needed: money("USDC", p.needed),
      network: other,
      defaultValue: t(`policy.${result.code}`, { defaultValue: result.code }),
    });
  };
}

const APPROVE_KEYS: Record<BiometricKind, string> = {
  faceId: "swap.swapFaceId",
  touchId: "swap.swapTouchId",
  face: "swap.swapFace",
  fingerprint: "swap.swapFingerprint",
  passcode: "swap.swapPasscode",
  emailCode: "swap.swapEmailCode",
  none: "swap.swapFaceId",
};

/** "Swap with Face ID", "…with an email code": the device's real check (review R03). */
export function useSwapApproveLabel() {
  const { t } = useT();
  const [kind, setKind] = React.useState<BiometricKind>("faceId");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);
  return t(APPROVE_KEYS[kind]);
}

/** "1 USDC = 0.8228 EURC" and how far that is from Circle's market rate, in the person's number format. */
export function useRateLines() {
  const { t } = useT();
  const { locale } = useLocale();
  const number = (value: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: RATE_DIGITS }).format(Number(value));
  return (draft: SwapDraftView) => {
    const rate = t("swap.rateValue", { from: draft.tokenIn, rate: number(draft.rate), to: draft.tokenOut });
    const market = draft.marketRate ? t("swap.rateValue", { from: draft.tokenIn, rate: number(draft.marketRate), to: draft.tokenOut }) : null;
    const gap =
      draft.rateGapBps === null
        ? null
        : draft.rateGapBps >= 0
          ? t("swap.belowMarket", { gap: (draft.rateGapBps / PERCENT_BPS).toFixed(1) })
          : t("swap.aboveMarket", { gap: (-draft.rateGapBps / PERCENT_BPS).toFixed(1) });
    return { rate, market, gap };
  };
}

/** The confirm prompt (Face ID's reason line, the email-code sheet's subtitle). */
export function useSwapPrompt() {
  const { t } = useT();
  const money = useMoney();
  return (draft: SwapDraftView | null) =>
    draft ? t("swap.signPrompt", { paid: money(draft.tokenIn, draft.amountIn), min: money(draft.tokenOut, draft.minOut) }) : t("swap.title");
}
