// propose_bridge (any recipient, with route options) and bring_to_arc in the conversation: the same bridge card as
// the Move screen, following the move live, so a reopened thread shows what really happened.
import * as React from "react";

import type { ProposeCrossChainOutput } from "@kawase/api-client";

import { MoveTicket } from "@/crosschain/move-ticket";
import { useCrossChain } from "@/crosschain/use-crosschain";
import { useT } from "@/i18n";

import { AgentCard } from "./card";

export function MoveCard({ output }: { output: ProposeCrossChainOutput }) {
  const { t } = useT();
  const controller = useCrossChain(output.intent);
  const intent = controller.intent ?? output.intent;
  const title = intent.draft?.direction === "in" || intent.request.direction === "in" ? t("move.bringTitle") : t("move.title");
  return (
    <AgentCard eyebrow={`${title} · ${intent.network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet")}`}>
      <MoveTicket controller={controller} />
    </AgentCard>
  );
}
