// The balance hero (surfaces.md Home §2): the total of every asset, every chain and every position in the display
// currency, counting to new values (Number Ticker), the 24-hour change, and the Balance Chart with 1D/1W/1M/1Y
// over Kawase's own snapshots of the total. Tapping the total opens the breakdown sheet. On the textured card.
import { Copy } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { PortfolioView } from "@kawase/api-client";
import { MS_PER_SECOND, SECONDS_PER_DAY } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { AreaChart, RangePills, type ChartPoint } from "@kawase/ui-native/components/area-chart";
import { NumberTicker } from "@kawase/ui-native/components/number-ticker";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { TexturedCard } from "@kawase/ui-native/components/textured-card";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { change, money } from "@/portfolio/format";
import { useThemeColors } from "@/theme/use-theme-colors";

type HeroRange = "1D" | "1W" | "1M" | "1Y";
const RANGES: readonly HeroRange[] = ["1D", "1W", "1M", "1Y"];
const DAY_MS = SECONDS_PER_DAY * MS_PER_SECOND;
const DAYS: Record<HeroRange, number> = { "1D": 1, "1W": 7, "1M": 30, "1Y": 365 };
const CHART_HEIGHT = 120;
const MIN_POINTS = 2;

type PortfolioHeroProps = {
  portfolio: PortfolioView | undefined;
  name: string;
  address?: string | undefined;
  onCopy?: () => void;
  onOpenBreakdown: () => void;
  /** Actions under the chart (the action row). */
  children?: React.ReactNode;
};

export function PortfolioHero({ portfolio, name, address, onCopy, onOpenBreakdown, children }: PortfolioHeroProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const [range, setRange] = React.useState<HeroRange>("1W");
  const [scrub, setScrub] = React.useState<ChartPoint | null>(null);
  const testnet = portfolio?.isTest ?? false;
  const fx = portfolio?.fx ?? { currency: "USD", perUsd: 1 };

  const points = React.useMemo(() => {
    const all = (portfolio?.history ?? []).map((point) => ({ t: new Date(point.t).getTime(), v: point.usd }));
    const since = Date.now() - DAYS[range] * DAY_MS;
    const inRange = all.filter((point) => point.t >= since);
    return inRange.length >= MIN_POINTS ? inRange : all;
  }, [portfolio?.history, range]);

  const changeLabel = portfolio?.change24hUsd !== null && portfolio?.change24hUsd !== undefined ? `${portfolio.change24hUsd >= 0 ? "+" : ""}${money(portfolio.change24hUsd, fx, locale)}` : undefined;
  const pctLabel = change(portfolio?.change24hPct, locale);
  const up = (portfolio?.change24hUsd ?? 0) >= 0;

  return (
    <TexturedCard lineColor={colors.texture} className="gap-4 p-5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text numberOfLines={1} className="text-foreground shrink text-base font-semibold">
            {name}
          </Text>
          {address ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("home.copyAddress")} onPress={onCopy} className="bg-secondary active:bg-muted flex-row items-center gap-1 rounded-full px-2 py-1">
              <Amount className="text-muted-foreground text-xs">{address}</Amount>
              <Icon as={Copy} className="text-muted-foreground size-3" />
            </Pressable>
          ) : null}
        </View>
        <StateLabel className={testnet ? "text-network" : "text-muted-foreground"}>{testnet ? t("network.testnet") : t("network.realMoney")}</StateLabel>
      </View>

      <Pressable accessibilityRole="button" accessibilityHint={t("assets.breakdownTitle")} onPress={onOpenBreakdown} className="gap-1 active:opacity-80">
        <Text className="text-muted-foreground text-sm">{t("assets.total")}</Text>
        {portfolio ? (
          scrub ? (
            <Amount className="font-display text-foreground text-5xl font-bold">{money(scrub.v, fx, locale)}</Amount>
          ) : (
            <NumberTicker value={portfolio.totalUsd} format={(value) => money(value, fx, locale)} className={cn("font-display text-5xl font-bold", portfolio.totalUsd === 0 ? "text-muted-foreground" : "text-foreground")} />
          )
        ) : (
          <Skeleton className="h-12 w-48" />
        )}
        {scrub ? (
          <Text className="text-muted-foreground text-sm">{new Date(scrub.t).toLocaleString(locale)}</Text>
        ) : changeLabel ? (
          <Amount className={cn("text-sm", up ? "text-success" : "text-destructive")}>{t("assets.today", { change: pctLabel ? `${changeLabel} (${pctLabel})` : changeLabel })}</Amount>
        ) : null}
      </Pressable>

      {portfolio && portfolio.totalUsd > 0 ? (
        points.length >= MIN_POINTS ? (
          <View className="gap-2">
            <AreaChart
              points={points}
              height={CHART_HEIGHT}
              colors={{ up: colors.success, down: colors.destructive, muted: colors["muted-foreground"], scrub: colors.border }}
              formatValue={(value) => money(value, fx, locale, { compact: true })}
              onScrub={setScrub}
              accessibilityLabel={t("assets.chartLabel", { range, value: money(portfolio.totalUsd, fx, locale) })}
            />
            <RangePills ranges={RANGES} value={range} onChange={setRange} label={t("assets.rangeLabel")} />
          </View>
        ) : (
          <Text className="text-muted-foreground text-sm">{t("assets.chartEmpty")}</Text>
        )
      ) : null}

      {children ? <View className="flex-row gap-2">{children}</View> : null}
    </TexturedCard>
  );
}
