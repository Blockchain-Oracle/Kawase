// The Markets tab's Long/Short segment (surfaces.md "Markets tab"; trade.md): the person's open Kawase Margin
// positions first (P&L, liquidation price; each opens its page), then every market Aave V4 lists on Arc with its live
// price and what each side allows ("Long up to 3.4× · Short up to 2.4×", or why not). A market opens the Long/Short
// ticket for it. On testnet each side says "Mainnet only" (R2); guests see the markets (R13).
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";

import type { MarginMarketView } from "@kawase/api-client";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { PositionRow } from "@/margin/position-row";
import { useMarginMarkets, useMarginPositions } from "@/margin/use-margin";
import { fire } from "@/feedback/fire";
import { PRESS_SCALE, RADIUS, SPACE, TYPE, useTheme } from "@/components/kit";
import { LiveNumber } from "@/trade/bits";
import { useLivePrices } from "@/trade/use-live-prices";

const MARK = 36;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;
const PRICE_H = 20;
const SIDE_H = 36;

export function LongShortSegment() {
  const { t } = useT();
  const format = useMarginFormat();
  const { view, failed, refresh } = useMarginMarkets();
  const { positions } = useMarginPositions();
  // The exchange's ticker moves the prices between the venue's reads (the terminal's own stream).
  const ticker = useLivePrices(view?.markets.map((market) => market.market) ?? []);
  const side = (entry: MarginMarketView["long"]) => (entry.available ? t("margin.upTo", { leverage: format.leverage(entry.maxLeverage) }) : t(`margin.unavailable_${entry.reason ?? "not_borrowable"}`));

  return (
    <View className="gap-4">
      {positions && positions.length > 0 ? (
        <ListGroup label={t("markets.yourPositions")}>
          {positions.map((position) => (
            <PositionRow key={position.id} position={position} />
          ))}
        </ListGroup>
      ) : null}
      {!view && failed ? (
        <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
          <Text className="text-muted-foreground flex-1 text-sm">{t("markets.loadFailed")}</Text>
          <Button size="sm" variant="secondary" onPress={() => void refresh()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      ) : !view ? (
        <View className="gap-2">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
          ))}
        </View>
      ) : (
        <ListGroup label={t("markets.marginVenue")}>
          {view.markets.map((market) => (
            <MarketRow key={market.market} market={market} livePrice={ticker.prices[market.market]?.price} sideLabel={side} />
          ))}
        </ListGroup>
      )}
      {view && !view.available ? <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>{t("markets.perpsMainnet")}</Text> : null}
    </View>
  );
}

/**
 * One market: its mark, name and what each side allows, the price moving live, and a Long and a Short plate (the
 * terminal's direction fills) that open the ticket on that side. The row itself opens the terminal on the market.
 */
function MarketRow({ market, livePrice, sideLabel }: { market: MarginMarketView; livePrice: number | undefined; sideLabel: (entry: MarginMarketView["long"]) => string }) {
  const { t } = useT();
  // "Long up to 3.4× · Short up to 2.4×"; a market that can only be shorted says so once ("Short only · up to 2.4×").
  const describe = (entry: MarginMarketView) =>
    !entry.long.available && entry.long.reason === "no_collateral_factor"
      ? [t("margin.shortOnly"), entry.short.available ? sideLabel(entry.short) : null].filter(Boolean).join(" · ")
      : `${t("margin.long")} ${sideLabel(entry.long)} · ${t("margin.short")} ${sideLabel(entry.short)}`;
  const { color } = useTheme();
  const router = useRouter();
  const format = useMarginFormat();
  const open = (sideParam?: "long" | "short") => {
    fire("tick");
    router.push({ pathname: "/margin", params: { market: market.market, ...(sideParam ? { side: sideParam } : {}) } });
  };
  const price = livePrice ?? Number(market.price) / PRICE_SCALE;
  return (
    <View style={styles.market}>
      <Pressable accessibilityRole="button" accessibilityLabel={market.market} onPress={() => open()} style={styles.head}>
        <Mark entity={marketEntity(market.asset)} size={MARK} />
        <View style={styles.grow}>
          <RNText style={[TYPE.rowStrong, { color: color.ink }]}>{market.market}</RNText>
          <RNText numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
            {describe(market)}
          </RNText>
        </View>
        <LiveNumber text={livePrice !== undefined ? format.usd(livePrice) : format.price(market.price)} value={price} height={PRICE_H} align="right" />
      </Pressable>
      <View style={styles.sides}>
        {(["long", "short"] as const).map((sideKey) => {
          const entry = market[sideKey];
          const fill = sideKey === "long" ? color.upFill : color.downFill;
          return (
            <Pressable
              key={sideKey}
              accessibilityRole="button"
              accessibilityState={{ disabled: !entry.available }}
              disabled={!entry.available}
              onPress={() => open(sideKey)}
              style={({ pressed }) => [styles.side, { backgroundColor: entry.available ? fill : color.raised2, transform: [{ scale: pressed ? PRESS_SCALE : 1 }] }]}
            >
              <RNText style={[TYPE.buttonCompact, { color: entry.available ? color.onFill : color.text3 }]}>{`${t(`margin.${sideKey}`)} ${market.market}`}</RNText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The venue's prices carry 8 decimals. */
const PRICE_SCALE = 1e8;

const styles = StyleSheet.create({
  market: { gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  sides: { flexDirection: "row", gap: SPACE.sm },
  side: { flex: 1, height: SIDE_H, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
});
