// Words and numbers for Kawase Margin in the person's language: prices (USD, the venue's 8 decimals), leverage,
// percentages, asset amounts of any decimals, each policy reason as one sentence, and the confirm prompt.
import { formatUnits } from "viem";

import type { MarginDraftView, MarginIntent, PolicyResultView } from "@kawase/api-client";
import { tokenKey } from "@kawase/identity";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";

export const PRICE_DECIMALS = 8;
const ARC_MAINNET = 5042;
const SMALL_PRICE = 10;
const PRICE_DIGITS = 2;
const SMALL_PRICE_DIGITS = 4;
const AMOUNT_DIGITS = 6;
const PERCENT_DIGITS = 1;
const LEVERAGE_DIGITS = 1;

/** The mark of a market's asset on Arc mainnet (the only network Kawase Margin runs on). */
export const marketEntity = (asset: string) => tokenKey(ARC_MAINNET, asset);

export function useMarginFormat() {
  const { locale } = useLocale();
  const usd = (value: number, digits = PRICE_DIGITS) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, PRICE_DIGITS) }).format(value);
  return {
    usd,
    /** A price from the venue's oracle (8 decimals). */
    price: (eightDecimals: string | null | undefined) => {
      if (!eightDecimals) return "—";
      const value = Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS));
      return usd(value, value < SMALL_PRICE ? SMALL_PRICE_DIGITS : PRICE_DIGITS);
    },
    /** Base units of any asset, with its symbol. */
    amount: (baseUnits: string, decimals: number, symbol: string) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: AMOUNT_DIGITS }).format(Number(formatUnits(BigInt(baseUnits), decimals)))} ${symbol}`,
    percent: (fraction: number, digits = PERCENT_DIGITS) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(fraction),
    leverage: (value: number) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: LEVERAGE_DIGITS }).format(value)}×`,
    signed: (value: number) => `${value >= 0 ? "+" : "−"}${usd(Math.abs(value))}`,
  };
}

export function useMarginPolicyText() {
  const { t } = useT();
  const money = useMoney();
  return (result: PolicyResultView, network: MarginIntent["network"]) => {
    const p = result.params ?? {};
    return t(`marginPolicy.${result.code}`, {
      ...p,
      side: p.side ? t(`margin.${p.side}`) : "",
      balance: money(p.asset, p.balance),
      needed: money("USDC", p.needed),
      network: network === "testnet" ? t("network.arc") : t("network.arcTestnet"),
      defaultValue: t(`policy.${result.code}`, { defaultValue: result.code }),
    });
  };
}

/** The Face ID reason line: what this order does, in a sentence. */
export function useMarginPrompt() {
  const { t } = useT();
  const money = useMoney();
  const format = useMarginFormat();
  return (draft: MarginDraftView | null) =>
    !draft
      ? t("margin.title")
      : draft.action === "open"
        ? t("margin.signOpen", { leverage: draft.leverage, side: t(`margin.${draft.side}`), market: draft.market, margin: money("USDC", draft.margin) })
        : t("margin.signClose", { percent: format.percent(draft.fraction, 0), side: t(`margin.${draft.side}`), market: draft.market });
}
