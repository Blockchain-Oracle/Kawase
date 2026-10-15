// The terminal's positions on the kit (visual spec: 21st.dev ssychui "Trade Journal Table", 27124): the order on the
// ticket first, with the kit's CountdownRing draining while its price is fresh (or a named wait while it opens), then
// each open long / short with live P&L in rolling digits (a sign and the hue together, never the hue alone) and how
// far liquidation is. Desktop gets table columns and opens the position in the right drawer; the phone gets two-line
// rows that open the position page. Loading is the list's own skeleton, held; empty says why and offers the ticket; a
// failed read keeps the last rows marked stale, and with nothing to show says what still works, with Retry.
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatUnits } from "viem";

import type { MarginIntent, MarginPositionView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";

import { EmptyState, ErrorState, LoadingState, Panel, SectionLabel, SPACE, StaleTick, TYPE, useHeldLoading, useTheme, WaitingText } from "@/components/kit";
import { LineChart } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { isMarginMoving, isMarginOpen } from "@/margin/use-margin";

import { LiveNumber } from "./bits";

const MARK = 32;
const PNL_H = 20;
const USDC_DECIMALS = 6;
/** On a desktop window the market column is twice the width of each figure column. */
const IDENTITY_SHARE = 2;

type Props = {
  positions: MarginPositionView[] | undefined;
  failed: boolean;
  /** When the list was last read, for the stale mark. */
  asOf?: number | undefined;
  onRetry: () => void;
  /** The order on the ticket, shown first while it is priced or on its way. */
  order?: MarginIntent | undefined;
  onOrder?: (() => void) | undefined;
  /** Open the ticket (the empty state's action). */
  onTrade: () => void;
  /** Open one position (the drawer on a desktop window, the page on a phone). */
  onOpen: (position: MarginPositionView) => void;
  signedIn: boolean;
  wide: boolean;
};

function Cell({ children, end, grow = 1 }: { children: React.ReactNode; end?: boolean; grow?: number }) {
  return <View style={[styles.cell, { flex: grow, alignItems: end ? "flex-end" : "flex-start" }]}>{children}</View>;
}

function PositionLine({ position, wide, onOpen }: { position: MarginPositionView; wide: boolean; onOpen: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const format = useMarginFormat();
  const up = position.pnlUsd >= 0;
  const tone = up ? color.up : color.down;
  const liquidation = position.liquidationPrice
    ? `${format.price(position.liquidationPrice)}${position.liquidationDistance !== null ? ` · ${format.percent(position.liquidationDistance, 0)}` : ""}`
    : t("desktop.noLiquidation");
  const figure = (value: string) => <Text style={[TYPE.rowAmount, { color: color.ink }]}>{value}</Text>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("desktop.openPosition", { market: position.market, side: t(`margin.${position.side}`) })}
      onPress={() => {
        fire("tick");
        onOpen();
      }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.line, { backgroundColor: pressed || hovered ? color.rowPressed : color.transparent }]}
    >
      <Cell grow={wide ? IDENTITY_SHARE : 1}>
        <View style={styles.identity}>
          <Mark entity={marketEntity(position.asset)} size={MARK} />
          <View style={styles.shrink}>
            <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
              {position.market}
            </Text>
            <Text numberOfLines={1} style={[TYPE.rowDetail, { color: position.side === "long" ? color.up : color.down }]}>
              {`${t(`margin.${position.side}`)} ${format.leverage(position.leverage)}`}
            </Text>
          </View>
        </View>
      </Cell>
      {wide ? (
        <>
          <Cell end>{figure(format.usd(position.notionalUsd))}</Cell>
          <Cell end>{figure(format.price(position.entryPrice))}</Cell>
          <Cell end>{figure(format.price(position.markPrice))}</Cell>
          <Cell end>
            <Text style={[TYPE.rowAmount, { color: color.down }]}>{liquidation}</Text>
          </Cell>
        </>
      ) : null}
      <Cell end grow={wide ? 1 : 0}>
        {position.protection === "closing" ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("protect.closing")}</Text> : null}
        <LiveNumber text={format.signed(position.pnlUsd)} value={position.pnlUsd} height={PNL_H} color={tone} align="right" />
        <Text style={[TYPE.meta, { color: tone }]}>{`${up ? "+" : "−"}${format.percent(Math.abs(position.pnlPercent))}`}</Text>
        {!wide ? <Text style={[TYPE.meta, { color: color.text3 }]}>{`${t("desktop.liqTag")} ${liquidation}`}</Text> : null}
      </Cell>
    </Pressable>
  );
}

function OrderLine({ order, onPress }: { order: MarginIntent; onPress?: (() => void) | undefined }) {
  const { t } = useT();
  const { color } = useTheme();
  const format = useMarginFormat();
  const draft = order.draft;
  if (!draft) return null;
  const moving = isMarginMoving(order);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={[styles.line, { backgroundColor: color.selectedRow }]}>
      {/* The quote's countdown lives on the ticket (on this device's clock); the row names the market. */}
      <View style={styles.ring}>
        <Mark entity={marketEntity(draft.asset)} size={MARK} />
      </View>
      <View style={styles.shrink}>
        <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
          {t("desktop.orderRow", { side: t(`margin.${draft.side}`), market: draft.market })}
        </Text>
        {moving ? (
          <WaitingText>{t("margin.opening")}</WaitingText>
        ) : (
          <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {t("desktop.orderDetail", { margin: format.usd(Number(formatUnits(BigInt(draft.margin), USDC_DECIMALS))), exposure: format.usd(draft.notionalUsd) })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function PositionsPanel({ positions, failed, asOf, onRetry, order, onOrder, onTrade, onOpen, signedIn, wide }: Props) {
  const { t } = useT();
  const { color } = useTheme();
  const loading = useHeldLoading(signedIn && positions === undefined && !failed);
  const showOrder = order && order.draft && order.request.action === "open" && (isMarginOpen(order) || isMarginMoving(order));
  const list = positions ?? [];

  let body: React.ReactNode;
  if (loading || (signedIn && positions === undefined && !failed)) body = <LoadingState shape="list" label={t("margin.loading")} />;
  else if (positions === undefined && failed) body = <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={onRetry} stillWorks={t("desktop.positionsFailed")} />;
  else if (list.length === 0 && !showOrder)
    body = <EmptyState icon={LineChart} why={t("margin.noPositions")} detail={t("desktop.noPositionsWhy")} action={{ label: t("desktop.openFirst"), onPress: onTrade }} size="inline" />;
  else
    body = (
      <View>
        {wide && list.length > 0 ? (
          <View style={[styles.line, styles.headRow]}>
            <Cell grow={IDENTITY_SHARE}>
              <Text style={[TYPE.meta, { color: color.text3 }]}>{t("margin.markets")}</Text>
            </Cell>
            {(["size", "entry", "mark", "liquidation", "pnl"] as const).map((key) => (
              <Cell key={key} end>
                <Text style={[TYPE.meta, { color: color.text3 }]}>{t(`margin.${key}`)}</Text>
              </Cell>
            ))}
          </View>
        ) : null}
        {showOrder ? <OrderLine order={order!} onPress={onOrder} /> : null}
        {list.map((position) => (
          <PositionLine key={position.id} position={position} wide={wide} onOpen={() => onOpen(position)} />
        ))}
      </View>
    );

  return (
    <Panel style={styles.panel}>
      <View style={styles.title}>
        <SectionLabel>{t("margin.yourPositions")}</SectionLabel>
        {failed && positions !== undefined && asOf ? <StaleTick asOf={asOf} compact /> : null}
      </View>
      {body}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.sm, paddingVertical: SPACE.md },
  title: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACE.lg },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  headRow: { paddingVertical: SPACE.xs },
  cell: { minWidth: 0 },
  identity: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  shrink: { flex: 1, minWidth: 0 },
  ring: { width: MARK, height: MARK, alignItems: "center", justifyContent: "center" },
});
