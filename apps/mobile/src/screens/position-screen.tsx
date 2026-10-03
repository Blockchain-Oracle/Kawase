// One long/short position (surfaces.md "Position page"): identity, P&L as the hero split into the price move and
// the borrow interest, the stats (size, entry, mark, liquidation and how far, leverage, borrow rate), the account's
// health gauge, take-profit and stop-loss (Kawase closes it for the person under grants signed once), and Close
// 25 / 50 / 75 / All: choosing one drafts the unwind at once and the ticket below shows what comes back, confirmed by
// sliding.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { MARGIN } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { MarginTicket } from "@/margin/margin-ticket";
import { ProtectionCard } from "@/margin/protection-card";
import { isMarginFinished, useMarginOrder, useMarginPositions } from "@/margin/use-margin";
import { api } from "@/session/api";

const EDGE_INSET = 12;
const MARK = 44;
const HERO = 40;
const FOOTER_GAP = 24;
const CLOSE_SHARES = MARGIN.closeShares;
const HEALTH_DIGITS = 2;
/** The gauge runs from liquidation (1.0) to comfortably safe (this). */
const GAUGE_TOP = 2;
const GAUGE_WARN = 1.2;
const GAUGE_CAUTION = 1.5;
const PERCENT = 100;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="bg-muted min-w-[45%] flex-1 gap-0.5 rounded-2xl px-3 py-2">
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{label}</Text>
      <Amount className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{value}</Amount>
    </View>
  );
}

/** Health from 1.0 (liquidation) up; the bar fills toward safe, red under 1.2, amber-ish wording under 1.5. */
function HealthGauge({ health }: { health: number }) {
  const { t } = useT();
  const share = Math.max(0, Math.min(1, (health - 1) / (GAUGE_TOP - 1)));
  const tone = health < GAUGE_WARN ? "bg-destructive" : health < GAUGE_CAUTION ? "bg-network" : "bg-success";
  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="text-muted-foreground text-xs">{t("margin.health")}</Text>
        <Amount className="text-foreground text-xs font-semibold">{health.toFixed(HEALTH_DIGITS)}</Amount>
      </View>
      <View className="bg-muted h-2 overflow-hidden rounded-full">
        <View className={cn("h-2 rounded-full", tone)} style={{ width: `${share * PERCENT}%` }} />
      </View>
    </View>
  );
}

export function PositionScreen({ id }: { id: string }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const format = useMarginFormat();
  const { positions, refresh } = useMarginPositions();
  const controller = useMarginOrder();
  const [starting, setStarting] = React.useState<number>();
  const position = positions?.find((entry) => entry.id === id);
  const intent = controller.intent;
  const finished = intent ? isMarginFinished(intent) : false;
  React.useEffect(() => {
    if (finished) void refresh();
  }, [finished, refresh]);

  const close = async (fraction: number) => {
    setStarting(fraction);
    try {
      const { intent: fresh } = await api.margin.create({ action: "close", positionId: id, fraction });
      controller.set(fresh);
    } catch {
      toast(t("margin.unavailable"));
    } finally {
      setStarting(undefined);
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/margin"));
  const up = (position?.pnlUsd ?? 0) >= 0;

  return (
    <View className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={leave}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        {position ? <Mark entity={marketEntity(position.asset)} size={MARK} /> : null}
        <View className="flex-1">
          <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
            {position ? `${position.market} · ${t(`margin.${position.side}`)}` : t("margin.title")}
          </Text>
          {position ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{format.leverage(position.leverage)}</Text> : null}
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        {!positions ? (
          <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("margin.loading")}</Text>
        ) : !position && !intent ? (
          <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("margin.notFound")}</Text>
        ) : null}
        {position ? (
          <>
            <View className="gap-1">
              <Eyebrow>{t("margin.pnl")}</Eyebrow>
              <Amount className={cn("font-display font-bold", up ? "text-success" : "text-destructive", TEXT_START)} style={{ fontSize: HERO }}>
                {format.signed(position.pnlUsd)}
              </Amount>
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
                {`${format.percent(position.pnlPercent)} · ${t("margin.pnlPrice")} ${format.signed(position.pnlSplit.price)} · ${t("margin.pnlBorrow")} ${format.signed(position.pnlSplit.borrow)}`}
              </Text>
            </View>
            {position.health !== null ? <HealthGauge health={position.health} /> : null}
            <View className="flex-row flex-wrap gap-2">
              <Stat label={t("margin.size")} value={format.usd(position.notionalUsd)} />
              <Stat label={t("margin.equity")} value={format.usd(position.equityUsd)} />
              <Stat label={t("margin.entry")} value={format.price(position.entryPrice)} />
              <Stat label={t("margin.mark")} value={format.price(position.markPrice)} />
              <Stat
                label={t("margin.liquidation")}
                value={`${format.price(position.liquidationPrice)}${position.liquidationDistance !== null ? ` · ${format.percent(position.liquidationDistance)}` : ""}`}
              />
              <Stat label={t("margin.borrowRate")} value={t("margin.borrowRateValue", { rate: format.percent(position.borrowApr, HEALTH_DIGITS) })} />
            </View>
            {!intent && position.network === "mainnet" ? <ProtectionCard position={position} onSaved={() => void refresh()} /> : null}
            {!intent ? (
              <View className="flex-row gap-2">
                {CLOSE_SHARES.map((share) => (
                  <Pressable
                    key={share}
                    accessibilityRole="button"
                    disabled={starting !== undefined}
                    onPress={() => void close(share)}
                    className="bg-muted active:bg-secondary flex-1 items-center rounded-full py-3"
                  >
                    <Text className="text-foreground text-sm font-semibold">{share === 1 ? t("margin.closeAll") : t("margin.closeShare", { percent: format.percent(share, 0) })}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {intent ? <MarginTicket controller={controller} /> : null}
      </ScrollView>
    </View>
  );
}
