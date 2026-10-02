// The Markets tab's Long/Short segment (surfaces.md "Markets tab"; trade.md): the person's open Kawase Margin
// positions first (P&L, liquidation price; each opens its page), then every market Aave V4 lists on Arc with its live
// price and what each side allows ("Long up to 3.4× · Short up to 2.4×", or why not). A market opens the Long/Short
// ticket for it. On testnet each side says "Mainnet only" (R2); guests see the markets (R13).
import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";

import type { MarginMarketView } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { PositionRow } from "@/margin/position-row";
import { useMarginMarkets, useMarginPositions } from "@/margin/use-margin";

const MARK = 36;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;

export function LongShortSegment() {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  const { view, failed, refresh } = useMarginMarkets();
  const { positions } = useMarginPositions();
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
            <ListRow
              key={market.market}
              leading={<Mark entity={marketEntity(market.asset)} size={MARK} />}
              title={market.market}
              subtitle={`${t("margin.long")} ${side(market.long)} · ${t("margin.short")} ${side(market.short)}`}
              trailing={<Amount className="text-foreground text-base">{format.price(market.price)}</Amount>}
              chevron
              onPress={() => router.push({ pathname: "/margin", params: { market: market.market } })}
            />
          ))}
        </ListGroup>
      )}
      {view && !view.available ? <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>{t("markets.perpsMainnet")}</Text> : null}
    </View>
  );
}
