// Earning and borrowing in the conversation: the yield-options card (compare_yield) lists every source for the asset
// from the same live read, read again so rates are current, each opening its ticket; the order card
// (propose_supply, propose_borrow, propose_repay) is the same ticket as the Borrow screen, following the order live,
// so a reopened thread shows what really happened.
import * as React from "react";

import type { CompareYieldOutput, ProposeLendOutput } from "@kawase/api-client";

import { useT } from "@/i18n";
import { LendTicket } from "@/lend/lend-ticket";
import { useLendOrder, useYieldOptions } from "@/lend/use-lend";
import { YieldOptionsList } from "@/lend/yield-options";

import { AgentCard } from "./card";

const networkWord = (t: (key: string) => string, network: "mainnet" | "testnet") => (network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet"));

export function YieldOptionsCard({ output }: { output: CompareYieldOutput }) {
  const { t } = useT();
  const live = useYieldOptions(output.asset, output.amount);
  const view = live.view ?? output;
  return (
    <AgentCard eyebrow={`${t("yieldOptions.title", { asset: view.asset })} · ${networkWord(t, view.network)}`}>
      <YieldOptionsList view={view} />
    </AgentCard>
  );
}

export function LendOrderCard({ output }: { output: ProposeLendOutput }) {
  const { t } = useT();
  const controller = useLendOrder(output.intent);
  const intent = controller.intent ?? output.intent;
  return (
    <AgentCard eyebrow={`${t("lend.title")} · ${networkWord(t, intent.network)}`}>
      <LendTicket controller={controller} compact />
    </AgentCard>
  );
}
