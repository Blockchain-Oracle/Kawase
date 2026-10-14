// Bridge on Home (plan F: "Bridge entry on Home", placed by the Front door lane): one row that opens Move, carrying the
// ecosystem in its face — the bridges Kawase runs as overlapping real marks — and, when money is waiting at the
// person's address on another chain, the one fact that matters ("12.40 USDC on Base · Bring to Arc"), which opens Bring
// to Arc from that chain. Loading keeps the row's shape; a failed read falls back to the plain row (Move still works).
import { useRouter } from "expo-router";
import { Mark } from "@kawase/ui-native/components/mark";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { Icon, SIZE, SPACE, TYPE, useGroupFill, usePressScale, useTheme } from "@/components/kit";
import { ChevronRight } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useMarginFormat } from "@/margin/copy";

import { useElsewhere } from "./use-crosschain";

const BRIDGES = ["cctp", "across", "relay", "lifi", "debridge"] as const;
const OVERLAP = -6;
const ROW_RADIUS = 20;
const USDC_DECIMALS = 6;

export function BridgeEntry() {
  const { t } = useT();
  const { color } = useTheme();
  const fill = useGroupFill();
  const router = useRouter();
  const press = usePressScale();
  const format = useMarginFormat();
  const elsewhere = useElsewhere();
  const waiting = elsewhere?.chains.find((row) => row.asset === "USDC") ?? elsewhere?.chains[0];
  const detail = waiting ? t("move.entryWaiting", { amount: format.amount(waiting.balance, waiting.decimals ?? USDC_DECIMALS, waiting.asset), chain: waiting.name }) : t("move.entryDetail");
  const open = () => {
    fire("tick");
    router.push(waiting ? { pathname: "/move", params: { direction: "in", chain: waiting.key } } : "/move");
  };
  return (
    <Animated.View style={press.style}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("bridge.title")}, ${detail}`} onPressIn={press.onPressIn} onPressOut={press.onPressOut} onPress={open} style={[styles.row, { backgroundColor: fill }]}>
        <View style={styles.marks}>
          {BRIDGES.map((bridge, index) => (
            <View key={bridge} style={index > 0 ? styles.overlap : undefined}>
              <Mark entity={`venue:${bridge}`} size={SIZE.markInline} />
            </View>
          ))}
        </View>
        <View style={styles.text}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("bridge.title")}</Text>
          <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text2 }]}>
            {detail}
          </Text>
        </View>
        <Icon icon={ChevronRight} size={SIZE.iconSm} tint={color.text3} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: SIZE.rowMinHeight, paddingHorizontal: SPACE.lg, borderRadius: ROW_RADIUS },
  marks: { flexDirection: "row" },
  overlap: { marginStart: OVERLAP },
  text: { flex: 1, minWidth: 0 },
});
