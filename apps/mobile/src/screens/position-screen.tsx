// One long/short position (surfaces.md "Position page"), on the kit. Phone: the identity in the header, P&L as the
// hero split into the price move and the borrow interest, health, the facts, then Close 25 / 50 / 75 / All (drafting
// the unwind at once; the ticket shows what comes back, confirmed by sliding) and take-profit / stop-loss. Desktop: two
// columns, the stage (P&L, the chart with the entry, liquidation and targets drawn, the facts) and the ticket (close
// and protection). Loading is the detail's skeleton; a closed position says so and leads back to the terminal.
import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";

import { Mark } from "@kawase/ui-native/components/mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { MarginTicket } from "@/margin/margin-ticket";
import { PositionActions, PositionChart, PositionState, PositionSummary, usePositionClose } from "@/margin/position-detail";
import { useMarginPositions } from "@/margin/use-margin";
import { SideTag } from "@/trade/bits";
import { Columns, PageHeader, PhoneScroll } from "@/trade/page-frame";
import { ShareCardChip } from "@/share-card/share-chip";

const MARK = 40;

export function PositionScreen({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const wide = useWide();
  const format = useMarginFormat();
  const { positions, failed, refresh } = useMarginPositions();
  const closing = usePositionClose(id, refresh);
  const position = positions?.find((entry) => entry.id === id);
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/margin"));
  const toTerminal = () => router.replace("/margin");
  // A full close removes the position from the list; its receipt stays on the page until the person leaves.
  const receiptOnly = !position && closing.controller.intent ? <MarginTicket controller={closing.controller} /> : null;

  return (
    <View style={{ flex: 1 }}>
      <PageHeader
        title={position ? position.market : t("margin.title")}
        subtitle={position ? `${t(`margin.${position.side}`)} · ${format.leverage(position.leverage)}` : undefined}
        onBack={leave}
        trailing={
          position ? (
            <>
              <SideTag side={position.side} />
              <Mark entity={marketEntity(position.asset)} size={MARK} />
              <ShareCardChip target={{ position: position.id }} />
            </>
          ) : null
        }
      />
      {receiptOnly ? (
        <PhoneScroll>{receiptOnly}</PhoneScroll>
      ) : wide ? (
        <PositionState positions={positions} id={id} failed={failed} onRetry={() => void refresh()} onMissing={toTerminal}>
          {(found) => (
            <Columns
              stage={
                <>
                  <PositionSummary position={found} />
                  <PositionChart position={found} />
                </>
              }
              ticket={<PositionActions position={found} closing={closing} onSaved={() => void refresh()} />}
            />
          )}
        </PositionState>
      ) : (
        <PhoneScroll>
          <PositionState positions={positions} id={id} failed={failed} onRetry={() => void refresh()} onMissing={toTerminal}>
            {(found) => (
              <>
                <PositionSummary position={found} />
                <PositionActions position={found} closing={closing} onSaved={() => void refresh()} />
              </>
            )}
          </PositionState>
        </PhoneScroll>
      )}
    </View>
  );
}
