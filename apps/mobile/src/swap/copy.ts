// Words for a swap in the person's language: each policy reason as one sentence (swap wording, not send's), the
// approve button named after the device's real check, and the rate lines.
import * as React from "react";

import type { NetworkId, PolicyResultView, SwapDraftView, SwapIntent } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";

import { useSwapMoney } from "./swap-tokens";

const PERCENT_BPS = 100;
const RATE_DIGITS = 4;

const BALANCE_DIGITS = 6;

export function useSwapPolicyText() {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  return (result: PolicyResultView, network: SwapIntent["network"]) => {
    const p = result.params ?? {};
    const other = network === "testnet" ? t("network.arc") : t("network.arcTestnet");
    // Any token's balance in its own decimals (the policy says them); USDC/EURC as before.
    const balance = p.decimals && p.balance ? formatTokenAmount(BigInt(p.balance), Number(p.decimals), p.asset ?? "", locale, { fractionDigits: BALANCE_DIGITS, trimZeros: true }) : money(p.asset, p.balance);
    // The token rules and the copycat rule speak in the ticket's words.
    if (result.code === "TOKEN_BLOCKED") return t("ticket.blocked", { reason: t(`tokenPage.r_${p.reason ?? "impersonator"}`, { defaultValue: p.reason ?? "" }) });
    if (result.code === "TOKEN_RULE_TRADE") return t("ticket.ruleUnverified", { amount: `$${p.limit}` });
    if (result.code === "TOKEN_RULE_DAY") return t("ticket.ruleDaily", { amount: `$${p.limit}` });
    if (result.code === "TOKEN_UNVERIFIED") return t(`tokenPage.r_${p.reason ?? "unverified"}`, { defaultValue: t("tokenPage.r_unverified") });
    return t(`swapPolicy.${result.code}`, {
      ...p,
      balance,
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
  const money = useSwapMoney();
  return (draft: SwapDraftView | null, network: NetworkId) =>
    draft ? t("swap.signPrompt", { paid: money(draft, "in", draft.amountIn, network), min: money(draft, "out", draft.minOut, network) }) : t("swap.title");
}
