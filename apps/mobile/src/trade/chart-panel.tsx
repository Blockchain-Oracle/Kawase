// The terminal's left column top: the market tabs (each asset's real mark, its venue price rolling as it moves), the
// range, and the chart with the trade's levels drawn on it. The levels come from the ticket's draft while one is
// priced, else from the open position on this market. Loading is the chart's own shape; a failed read says the
// prices still work and offers Retry; a market with no pool history shows the live price alone.
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { formatUnits } from "viem";

import type { ChartRange, MarginMarketView, MarginPositionView } from "@kawase/api-client";
import { RangePills } from "@kawase/ui-native/components/area-chart";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { WEB_HOVER_MUTED } from "@kawase/ui-native/lib/wide";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { marketEntity, PRICE_DECIMALS, useMarginFormat } from "@/margin/copy";

import { RollingNumber } from "./rolling-number";
import { TradeChart, type ChartLevel } from "./trade-chart";
import { TRADE_RANGES, useCandles } from "./use-candles";
import { targetPrice, type Trade } from "./use-trade";

const TAB_MARK = 24;
const PRICE_SIZE = 15;
const HERO_PRICE = 28;
const MS_PER_SECOND = 1000;

const priceOf = (eightDecimals: string | null | undefined) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : undefined);

function MarketTab({ market, selected, onPress }: { market: MarginMarketView; selected: boolean; onPress: () => void }) {
  const format = useMarginFormat();
  const price = priceOf(market.price) ?? 0;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn("flex-row items-center gap-2 rounded-2xl px-3 py-2", selected ? "bg-secondary" : WEB_HOVER_MUTED)}
    >
      <Mark entity={marketEntity(market.asset)} size={TAB_MARK} />
      <View>
        <Text className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>{market.market}</Text>
        <RollingNumber text={format.price(market.price)} value={price} size={PRICE_SIZE} className={selected ? "text-foreground" : "text-muted-foreground"} />
      </View>
    </Pressable>
  );
}

export function ChartPanel({ trade, markets, position, height }: { trade: Trade; markets: readonly MarginMarketView[]; position: MarginPositionView | undefined; height: number }) {
  const { t } = useT();
  const { locale } = useLocale();
  const format = useMarginFormat();
  const [range, setRange] = React.useState<ChartRange>("1D");
  const view = trade.view;
  const { candles, failed, retry } = useCandles(view?.asset, range);
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

  let chart: React.ReactNode;
  if (candles === undefined && !failed) chart = <Skeleton className="rounded-2xl" style={{ height }} />;
  else if (candles === undefined && failed)
    chart = (
      <View className="bg-muted/40 items-center justify-center gap-3 rounded-2xl" style={{ height }}>
        <Text className="text-muted-foreground text-sm">{t("desktop.chartFailed")}</Text>
        <Button variant="secondary" size="sm" onPress={retry}>
          <Text>{t("common.retry")}</Text>
        </Button>
      </View>
    );
  else
    chart = (
      <TradeChart
        candles={candles ?? []}
        livePrice={live}
        levels={levels}
        side={side}
        height={height}
        formatValue={(value) => format.usd(value)}
        formatTime={(seconds) => timeFormat.format(new Date(seconds * MS_PER_SECOND))}
        accessibilityLabel={t("desktop.chartLabel", { market: view?.market ?? "", range, price: format.price(view?.price) })}
      />
    );

  return (
    <View className="bg-card border-border gap-3 rounded-3xl border p-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={t("margin.markets")} contentContainerClassName="gap-1">
        {markets.map((market) => (
          <MarketTab key={market.market} market={market} selected={market.market === view?.market} onPress={() => trade.setMarket(market.market)} />
        ))}
      </ScrollView>
      <View className="flex-row items-end justify-between gap-3 px-1">
        <View className="gap-0.5">
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("desktop.priceNow", { market: view?.market ?? "" })}</Text>
          {live !== undefined ? <RollingNumber text={format.price(view?.price)} value={live} size={HERO_PRICE} className="font-display text-foreground font-bold" /> : null}
        </View>
        <RangePills ranges={TRADE_RANGES} value={range} onChange={setRange} label={t("assets.rangeLabel")} />
      </View>
      {chart}
      {candles !== undefined && candles.length === 0 ? <Text className={cn("text-muted-foreground px-1 text-xs", TEXT_START)}>{t("desktop.chartEmpty", { market: view?.market ?? "" })}</Text> : null}
      {failed && candles !== undefined ? <Text className={cn("text-muted-foreground px-1 text-xs", TEXT_START)}>{t("desktop.stale")}</Text> : null}
    </View>
  );
}
