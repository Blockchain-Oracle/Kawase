// Words for earning in the person's language: each policy reason, the approve button named after the device's real
// check and the action, the confirm prompt, and yields as percentages.
import * as React from "react";

import type { EarnDraftView, EarnIntent, PolicyResultView } from "@kawase/api-client";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";
import { vaultTitle } from "./vault-title";

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
const COMPACT_FROM_BASE_UNITS = 100_000_000_000n;
const USDC_SCALE = 1_000_000;
const THOUSAND = 1e3;
const TEN_THOUSAND = 1e4;
const LAKH = 1e5;
const MILLION = 1e6;
const CRORE = 1e7;
const HUNDRED_MILLION = 1e8;
const BILLION = 1e9;

/**
 * CLDR's short number patterns for Kawase's languages (Hermes' Intl ignores `notation: "compact"`): the largest
 * step a number reaches, and how it reads there — 万/亿 in Chinese, lakh/crore in Hindi, Bengali and Urdu.
 */
const COMPACT: Record<string, readonly (readonly [number, string])[]> = {
  en: [[BILLION, "{n}B"], [MILLION, "{n}M"], [THOUSAND, "{n}K"]],
  es: [[BILLION, "{n} mil M"], [MILLION, "{n} M"], [THOUSAND, "{n} mil"]],
  fr: [[BILLION, "{n} Md"], [MILLION, "{n} M"], [THOUSAND, "{n} k"]],
  pt: [[BILLION, "{n} bi"], [MILLION, "{n} mi"], [THOUSAND, "{n} mil"]],
  ru: [[BILLION, "{n} млрд"], [MILLION, "{n} млн"], [THOUSAND, "{n} тыс."]],
  zh: [[HUNDRED_MILLION, "{n}亿"], [TEN_THOUSAND, "{n}万"]],
  hi: [[CRORE, "{n} क॰"], [LAKH, "{n} लाख"], [THOUSAND, "{n} हज़ार"]],
  bn: [[CRORE, "{n} কো"], [LAKH, "{n} লা"], [THOUSAND, "{n} হা"]],
  ar: [[BILLION, "{n} مليار"], [MILLION, "{n} مليون"], [THOUSAND, "{n} ألف"]],
  ur: [[CRORE, "{n} کروڑ"], [LAKH, "{n} لاکھ"], [THOUSAND, "{n} ہزار"]],
};

/** Large amounts in a list read compactly ("1M USDC", "100万 USDC"); the exact amount is in the detail. */
export function useCompactMoney() {
  const { locale } = useLocale();
  const money = useMoney();
  return (asset: "USDC" | "EURC", baseUnits: string) => {
    if (BigInt(baseUnits) < COMPACT_FROM_BASE_UNITS) return money(asset, baseUnits);
    const value = Number(BigInt(baseUnits)) / USDC_SCALE;
    const steps = COMPACT[locale.split("-")[0] ?? "en"] ?? COMPACT.en!;
    const [step, pattern] = steps.find(([size]) => value >= size) ?? [1, "{n}"];
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / step);
    return `${pattern.replace("{n}", number)} ${asset}`;
  };
}

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
        ? t("earn.signPromptDeposit", { amount: money("USDC", draft.amount), vault: vaultTitle(draft.vault.name) })
        : t("earn.signPromptWithdraw", { amount: money("USDC", draft.amount), vault: vaultTitle(draft.vault.name) });
}
