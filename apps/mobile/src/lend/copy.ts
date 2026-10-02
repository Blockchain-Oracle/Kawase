// Words and numbers for earning and borrowing in the person's language: amounts of any asset (cirBTC has 8 decimals,
// WETH 18), rates, health, each policy reason as one sentence with its amounts formatted, the confirm prompt, and
// the marks (an asset on Arc mainnet, a protocol by name).
import type { LendDraftView, LendIntent, PolicyResultView, YieldOptionView } from "@kawase/api-client";
import { providerKey } from "@kawase/identity";

import { useT } from "@/i18n";
import { useMarginFormat } from "@/margin/copy";

const HEALTH_DIGITS = 2;

/** The protocol's own mark ("Aave", "Morpho", "Aero"). */
export const protocolEntity = (option: Pick<YieldOptionView, "protocol">) => providerKey(option.protocol.trim().toLowerCase());

export function useLendFormat() {
  const format = useMarginFormat();
  return {
    ...format,
    health: (value: number | null) => (value === null ? "∞" : value.toFixed(HEALTH_DIGITS)),
    /** A draft's own amount, or its collateral's. */
    of: (entry: { amount: string; decimals: number; asset: string }) => format.amount(entry.amount, entry.decimals, entry.asset),
  };
}

export function useLendPolicyText() {
  const { t } = useT();
  const format = useLendFormat();
  return (result: PolicyResultView, network: LendIntent["network"]) => {
    const p = result.params ?? {};
    const decimals = Number(p.decimals ?? 0);
    const asset = p.asset ?? "";
    return t(`lendPolicy.${result.code}`, {
      ...p,
      balance: p.balance ? format.amount(p.balance, decimals, asset) : "",
      position: p.position ? format.amount(p.position, decimals, asset) : "",
      network: network === "testnet" ? t("network.arc") : t("network.arcTestnet"),
      defaultValue: t(`policy.${result.code}`, { ...p, defaultValue: result.code }),
    });
  };
}

/** The Face ID reason line: what this action does, in a sentence. */
export function useLendPrompt() {
  const { t } = useT();
  const format = useLendFormat();
  return (draft: LendDraftView | null) => {
    if (!draft) return t("lend.title");
    const amount = draft.all ? t("lend.everything", { asset: draft.asset }) : format.of(draft);
    return draft.collateral ? t("lend.signBorrowWith", { amount, collateral: format.of(draft.collateral) }) : t(`lend.sign_${draft.action}`, { amount });
  };
}
