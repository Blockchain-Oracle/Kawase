// The terminal's stage top: the market tabs (each asset's real mark, its venue price in rolling digits), the price
// now as the one hero figure with its change over the range (ChangeChip: a sign and a hue, never hue alone), the range
// chips, and the one candle chart with the trade's levels. The levels come from the ticket's draft while one is
// priced, else from the open position on this market. Loading is the chart's own shape; a failed read keeps the
// prices live and offers Retry; a market with no pool history says so under the live price. A finger or the mouse
// reads a bar, and the hero follows it.
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatUnits } from "viem";

import type { Candle, ChartRange, MarginMarketView, MarginPositionView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";

import { ChangeChip, ErrorState, FilterChips, Panel, RADIUS, Skeleton, SPACE, StaleTick, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { marketEntity, PRICE_DECIMALS, useMarginFormat } from "@/margin/copy";

import { LiveNumber } from "./bits";
import { TradeChart, type ChartLevel } from "./trade-chart";
import { TRADE_RANGES, useCandles } from "./use-candles";
import { targetPrice, type Trade } from "./use-trade";

const TAB_MARK = 24;
const TAB_PRICE_H = 18;
const HERO_PRICE_H = 40;
const MS_PER_SECOND = 1000;

const priceOf = (eightDecimals: string | null | undefined) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : undefined);

function MarketTab({ market, selected, onPress }: { market: MarginMarketView; selected: boolean; onPress: () => void }) {
  const { color } = useTheme();
  const format = useMarginFormat();
  const price = priceOf(market.price) ?? 0;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={[styles.tab, { backgroundColor: selected ? color.raised2 : color.transparent }]}
    >
      <Mark entity={marketEntity(market.asset)} size={TAB_MARK} />
      <View>
        <Text style={[TYPE.rowStrong, { color: selected ? color.ink : color.text2 }]}>{market.market}</Text>
        <LiveNumber text={format.price(market.price)} value={price} height={TAB_PRICE_H} color={selected ? color.ink : color.text3} />
      </View>
    </Pressable>
  );
}

export function ChartPanel({ trade, markets, position, height }: { trade: Trade; markets: readonly MarginMarketView[]; position: MarginPositionView | undefined; height: number }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const format = useMarginFormat();
  const [range, setRange] = React.useState<ChartRange>("1D");
  const [scrub, setScrub] = React.useState<Candle | null>(null);
  const view = trade.view;
  const { candles, failed, retry, asOf } = useCandles(view?.asset, range);
  const live = priceOf(view?.price);
  const draft = trade.draft;

  const levels = React.useMemo(() => {
    const out: ChartLevel[] = [];
    if (live !== undefined) out.push({ kind: "price", value: live, label: "" });
    const entry = draft ? priceOf(draft.markPrice) : priceOf(position?.entryPrice);
    const liquidation = draft ? priceOf(draft.liquidationPrice) : priceOf(position?.liquidationPrice);
    if (entry !== undefined && (draft || position)) out.push({ kind: "entry", value: entry, label: t("desktop.levelEntry") });
    if (liquidation !== undefined) out.push({ kind: "liquidation", value: liquidation, label: t("desktop.liqTag") });
    if (draft && entry !== undefined) {
      // The same prices the ticket will save: steps from the quoted price.
      if (trade.targets.takeProfit !== null) out.push({ kind: "takeProfit", value: targetPrice(entry, trade.side, "takeProfit", trade.targets.takeProfit), label: t("desktop.levelTakeProfit") });
      if (trade.targets.stopLoss !== null) out.push({ kind: "stopLoss", value: targetPrice(entry, trade.side, "stopLoss", trade.targets.stopLoss), label: t("desktop.levelStopLoss") });
    } else if (position) {
      const tp = priceOf(position.takeProfit);
      const sl = priceOf(position.stopLoss);
      if (tp !== undefined) out.push({ kind: "takeProfit", value: tp, label: t("desktop.levelTakeProfit") });
      if (sl !== undefined) out.push({ kind: "stopLoss", value: sl, label: t("desktop.levelStopLoss") });
    }
    return out;
  }, [draft, live, position, t, trade.side, trade.targets.stopLoss, trade.targets.takeProfit]);

  const timeFormat = React.useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const side = draft ? draft.side : position?.side;
  const first = candles?.[0]?.o;
  const shown = scrub ? scrub.c : live;
  const change = first && shown !== undefined ? shown / first - 1 : null;

  let chart: React.ReactNode;
  if (candles === undefined && !failed) chart = <Skeleton height={height} radius={RADIUS.md} />;
  else if (candles === undefined && failed) chart = <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={retry} stillWorks={t("desktop.chartFailed")} />;
  else
    chart = (
      <TradeChart
        candles={candles ?? []}
        livePrice={live}
        levels={levels}
        side={side}
        height={height}
        onScrub={setScrub}
        formatValue={(value) => format.usd(value)}
        formatTime={(seconds) => timeFormat.format(new Date(seconds * MS_PER_SECOND))}
        accessibilityLabel={t("desktop.chartLabel", { market: view?.market ?? "", range, price: format.price(view?.price) })}
      />
    );

  return (
    <Panel style={styles.panel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={t("margin.markets")} contentContainerStyle={styles.tabs}>
        {markets.map((market) => (
          <MarketTab key={market.market} market={market} selected={market.market === view?.market} onPress={() => trade.setMarket(market.market)} />
        ))}
      </ScrollView>
      <View style={styles.head}>
        <View style={styles.price}>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{scrub ? timeFormat.format(new Date(scrub.t * MS_PER_SECOND)) : t("desktop.priceNow", { market: view?.market ?? "" })}</Text>
          <View style={styles.priceRow}>
            {shown !== undefined ? <LiveNumber text={format.usd(shown)} value={shown} height={HERO_PRICE_H} /> : null}
            <ChangeChip change={change} />
          </View>
        </View>
        <FilterChips<ChartRange> label={t("assets.rangeLabel")} options={TRADE_RANGES.map((value) => ({ value, label: value }))} value={range} onChange={setRange} />
      </View>
      {chart}
      {candles !== undefined && candles.length === 0 ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("desktop.chartEmpty", { market: view?.market ?? "" })}</Text> : null}
      {failed && candles !== undefined && asOf ? <StaleTick asOf={asOf} /> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.md, padding: SPACE.md },
  tabs: { gap: SPACE.xs },
  tab: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: SPACE.md, flexWrap: "wrap", paddingHorizontal: SPACE.xs },
  price: { gap: SPACE.xxs },
  priceRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
});
