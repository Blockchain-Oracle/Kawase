// One open long/short as a row (Home's positions, the Long/Short screen, the chat card): the asset's mark, side and
// leverage, P&L in mint or red with its sign (never colour alone), and the liquidation price. Opens the position.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { MarginPositionView } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

import { marketEntity, useMarginFormat } from "./copy";

const MARK = 36;

export function PositionRow({ position }: { position: MarginPositionView }) {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  const up = position.pnlUsd >= 0;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/position/${position.id}`)} className="active:bg-muted flex-row items-center gap-3 px-4 py-3">
      <Mark entity={marketEntity(position.asset)} size={MARK} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
          {`${position.market} · ${t(`margin.${position.side}`)} ${format.leverage(position.leverage)}`}
        </Text>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {`${t("margin.liquidation")} ${format.price(position.liquidationPrice)}`}
        </Text>
      </View>
      <View className="items-end">
        <Amount className={cn("text-base font-semibold", up ? "text-success" : "text-destructive")}>{format.signed(position.pnlUsd)}</Amount>
        <Amount className="text-muted-foreground text-xs">{format.percent(position.pnlPercent)}</Amount>
      </View>
    </Pressable>
  );
}
