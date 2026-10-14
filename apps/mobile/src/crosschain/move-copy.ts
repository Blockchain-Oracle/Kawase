// Words for a move in the person's language: amounts in the asset's own decimals, and each policy reason as one
// sentence (move wording first, the shared policy wording as the fallback).
import type { CrossChainAssetView, PolicyResultView } from "@kawase/api-client";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useMarginFormat } from "@/margin/copy";

const USDC_VIEW = { symbol: "USDC", decimals: 6 };

/** Base units of an asset with its symbol; drafts from before any-asset moves are USDC. */
export function useAssetMoney() {
  const format = useMarginFormat();
  return (base: string | null | undefined, asset: Pick<CrossChainAssetView, "symbol" | "decimals"> | undefined) => (base ? format.amount(base, (asset ?? USDC_VIEW).decimals, (asset ?? USDC_VIEW).symbol) : "");
}

export function useMovePolicyText() {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useAssetMoney();
  return (result: PolicyResultView) => {
    const p = result.params ?? {};
    const asset = p.asset ? { symbol: p.asset, decimals: Number(p.decimals ?? USDC_VIEW.decimals) } : USDC_VIEW;
    // A hold ends at a moment: said as a day and time in the person's locale, never as a timestamp.
    const until = p.until && !Number.isNaN(Date.parse(p.until)) ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(p.until)) : p.until;
    const words = { ...p, until, balance: money(p.balance, asset), needed: money(p.needed, asset) };
    return t(`movePolicy.${result.code}`, { ...words, defaultValue: t(`policy.${result.code}`, { ...words, defaultValue: result.code }) });
  };
}
