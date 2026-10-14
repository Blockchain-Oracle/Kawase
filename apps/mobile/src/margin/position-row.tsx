// One open long/short as a row on the kit (Home's positions, Markets, the chat card): the asset's real mark, side
// and leverage, P&L in rolling digits with its sign and its direction hue (never the hue alone), the liquidation price
// and any take-profit or stop-loss. Opens the position.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MarginPositionView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";

import { SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { LiveNumber } from "@/trade/bits";

import { marketEntity, useMarginFormat } from "./copy";

const MARK = 36;
const PNL_H = 20;

export function PositionRow({ position }: { position: MarginPositionView }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const format = useMarginFormat();
  const up = position.pnlUsd >= 0;
  const tone = up ? color.up : color.down;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        fire("tick");
        router.push(`/position/${position.id}`);
      }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? color.rowPressed : color.transparent }]}
    >
      <Mark entity={marketEntity(position.asset)} size={MARK} />
      <View style={styles.grow}>
        <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
          {`${position.market} · ${t(`margin.${position.side}`)} ${format.leverage(position.leverage)}`}
        </Text>
        <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
          {[
            `${t("margin.liquidation")} ${format.price(position.liquidationPrice)}`,
            position.takeProfit ? `${t("protect.takeProfit")} ${format.price(position.takeProfit)}` : null,
            position.stopLoss ? `${t("protect.stopLoss")} ${format.price(position.stopLoss)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <View style={styles.end}>
        <LiveNumber text={format.signed(position.pnlUsd)} value={position.pnlUsd} height={PNL_H} color={tone} align="right" />
        <Text style={[TYPE.meta, { color: tone }]}>{format.percent(position.pnlPercent)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  end: { alignItems: "flex-end" },
});
