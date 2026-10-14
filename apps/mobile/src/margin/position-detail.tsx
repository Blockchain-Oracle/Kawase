// One long/short in parts, on the kit, so the position page (phone and desktop) and the terminal's right drawer show
// the same thing (surfaces.md "Position page"):
//  - PositionSummary: P&L as the one hero (rolling digits, sign and hue together) split into the price move and the
//    borrow interest, the account's health as the kit's ProgressBar (calm, near under 1.5, late under 1.2), and the
//    facts (size, equity, entry, mark, liquidation and how far, rate) as key-value rows.
//  - PositionChart: the one candle chart with the entry, liquidation and targets drawn on it.
//  - PositionActions: Close 25 / 50 / 75 / All (choosing one drafts the unwind at once and the ticket shows what comes
//    back, confirmed by sliding), and take-profit / stop-loss on mainnet.
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { toast } from "sonner-native";
import { formatUnits } from "viem";

import type { ChartRange, MarginPositionView } from "@kawase/api-client";
import { MARGIN } from "@kawase/config";

import { EmptyState, ErrorState, FilterChips, KeyValue, LoadingState, Panel, ProgressBar, RADIUS, SectionLabel, Skeleton, SPACE, TYPE, useTheme } from "@/components/kit";
import { LineChart } from "@/components/kit/icons";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { ChoiceChips, LiveNumber } from "@/trade/bits";
import { TradeChart, type ChartLevel } from "@/trade/trade-chart";
import { TRADE_RANGES, useCandles } from "@/trade/use-candles";

import { PRICE_DECIMALS, useMarginFormat } from "./copy";
import { MarginTicket } from "./margin-ticket";
import { ProtectionCard } from "./protection-card";
import { isMarginFinished, useMarginOrder } from "./use-margin";

const HERO_H = 52;
const HEALTH_DIGITS = 2;
/** The gauge runs from liquidation (1.0) to comfortably safe (this). */
const GAUGE_TOP = 2;
const GAUGE_WARN = 1.2;
const GAUGE_CAUTION = 1.5;
const CHART_H = 280;
const MS = 1000;

const priceOf = (eightDecimals: string | null | undefined) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : undefined);

/** Closing a position: a fresh close order per share chosen; the ticket follows it to its receipt. */
export function usePositionClose(positionId: string, onFinished: () => void) {
  const { t } = useT();
  const controller = useMarginOrder();
  const [starting, setStarting] = React.useState<number>();
  const finished = controller.intent ? isMarginFinished(controller.intent) : false;
  React.useEffect(() => {
    if (finished) onFinished();
  }, [finished, onFinished]);
  const close = async (fraction: number) => {
    setStarting(fraction);
    try {
      const { intent } = await api.margin.create({ action: "close", positionId, fraction });
      controller.set(intent);
    } catch {
      toast(t("margin.unavailable"));
    } finally {
      setStarting(undefined);
    }
  };
  return { controller, starting, close };
}

export function PositionSummary({ position }: { position: MarginPositionView }) {
  const { t } = useT();
  const { color } = useTheme();
  const format = useMarginFormat();
  const up = position.pnlUsd >= 0;
  const health = position.health;
  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("margin.pnl")}</Text>
        <LiveNumber text={format.signed(position.pnlUsd)} value={position.pnlUsd} height={HERO_H} color={up ? color.up : color.down} />
        <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
          {`${format.percent(position.pnlPercent)} · ${t("margin.pnlPrice")} ${format.signed(position.pnlSplit.price)} · ${t("margin.pnlBorrow")} ${format.signed(position.pnlSplit.borrow)}`}
        </Text>
      </View>
      {health !== null ? (
        <ProgressBar
          label={t("margin.health")}
          value={Math.max(0, health - 1)}
          max={GAUGE_TOP - 1}
          valueText={health.toFixed(HEALTH_DIGITS)}
          tone={health < GAUGE_WARN ? "late" : health < GAUGE_CAUTION ? "near" : "calm"}
        />
      ) : null}
      <Panel style={styles.facts}>
        <KeyValue label={t("margin.size")} value={format.usd(position.notionalUsd)} />
        <KeyValue label={t("margin.equity")} value={format.usd(position.equityUsd)} />
        <KeyValue label={t("margin.entry")} value={format.price(position.entryPrice)} />
        <KeyValue label={t("margin.mark")} value={format.price(position.markPrice)} />
        <KeyValue
          label={t("margin.liquidation")}
          value={`${format.price(position.liquidationPrice)}${position.liquidationDistance !== null ? ` · ${format.percent(position.liquidationDistance)}` : ""}`}
          valueColor={color.down}
        />
        <KeyValue label={t("margin.borrowRate")} value={t("margin.borrowRateValue", { rate: format.percent(position.borrowApr, HEALTH_DIGITS) })} />
      </Panel>
    </View>
  );
}

export function PositionChart({ position }: { position: MarginPositionView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const format = useMarginFormat();
  const [range, setRange] = React.useState<ChartRange>("1D");
  const { candles, failed, retry } = useCandles(position.asset, range);
  const timeFormat = React.useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const levels = React.useMemo(() => {
    const out: ChartLevel[] = [];
    const add = (kind: ChartLevel["kind"], value: number | undefined, label: string) => {
      if (value !== undefined) out.push({ kind, value, label });
    };
    add("price", priceOf(position.markPrice), "");
    add("entry", priceOf(position.entryPrice), t("desktop.levelEntry"));
    add("liquidation", priceOf(position.liquidationPrice), t("desktop.liqTag"));
    add("takeProfit", priceOf(position.takeProfit), t("desktop.levelTakeProfit"));
    add("stopLoss", priceOf(position.stopLoss), t("desktop.levelStopLoss"));
    return out;
  }, [position, t]);
  return (
    <Panel style={styles.chart}>
      <FilterChips<ChartRange> label={t("assets.rangeLabel")} options={TRADE_RANGES.map((value) => ({ value, label: value }))} value={range} onChange={setRange} />
      {candles === undefined && !failed ? (
        <Skeleton height={CHART_H} radius={RADIUS.md} />
      ) : candles === undefined ? (
        <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={retry} stillWorks={t("desktop.chartFailed")} />
      ) : (
        <TradeChart
          candles={candles}
          livePrice={priceOf(position.markPrice)}
          levels={levels}
          side={position.side}
          height={CHART_H}
          formatValue={(value) => format.usd(value)}
          formatTime={(seconds) => timeFormat.format(new Date(seconds * MS))}
          accessibilityLabel={t("desktop.chartLabel", { market: position.market, range, price: format.price(position.markPrice) })}
        />
      )}
    </Panel>
  );
}

export function PositionActions({ position, closing, onSaved }: { position: MarginPositionView; closing: ReturnType<typeof usePositionClose>; onSaved: () => void }) {
  const { t } = useT();
  const format = useMarginFormat();
  const intent = closing.controller.intent;
  return (
    <View style={styles.stack}>
      {intent ? (
        <MarginTicket controller={closing.controller} />
      ) : (
        <View style={styles.group}>
          <SectionLabel>{t("desktop.closeTitle")}</SectionLabel>
          <ChoiceChips<number>
            label={t("desktop.closeTitle")}
            value={closing.starting ?? null}
            onChange={(share) => void closing.close(share)}
            options={MARGIN.closeShares.map((share) => ({ value: share, label: share === 1 ? t("margin.closeAll") : t("margin.closeShare", { percent: format.percent(share, 0) }), disabled: closing.starting !== undefined }))}
          />
        </View>
      )}
      {!intent && position.network === "mainnet" ? <ProtectionCard position={position} onSaved={onSaved} /> : null}
    </View>
  );
}

/** The position, or its designed loading and missing states, for the drawer and the page. */
export function PositionState({
  positions,
  id,
  failed,
  onRetry,
  onMissing,
  children,
}: {
  positions: MarginPositionView[] | undefined;
  id: string;
  failed: boolean;
  onRetry: () => void;
  /** A closed or unknown position: the way on (the terminal). */
  onMissing: () => void;
  children: (position: MarginPositionView) => React.ReactNode;
}) {
  const { t } = useT();
  const position = positions?.find((entry) => entry.id === id);
  if (position) return <>{children(position)}</>;
  if (!positions && failed) return <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={onRetry} stillWorks={t("desktop.positionsFailed")} />;
  if (!positions) return <LoadingState shape="detail" label={t("margin.loading")} />;
  return <EmptyState icon={LineChart} why={t("margin.notFound")} detail={t("desktop.positionGone")} action={{ label: t("desktop.toTerminal"), onPress: onMissing }} />;
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.lg },
  group: { gap: SPACE.sm },
  hero: { gap: SPACE.xxs },
  facts: { gap: SPACE.xs, padding: SPACE.lg },
  chart: { gap: SPACE.md, padding: SPACE.md },
});
