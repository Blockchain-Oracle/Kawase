// The budget at a glance for Home (D38; the Front door lane places it): "$166 left · this week", or the fix when there
// is none ("Set a budget") or it is paused. Tapping opens the budget. A shaped skeleton while it loads (never a fake
// $0), nothing for a guest (a budget needs a wallet), and the last known figure, marked stale, when offline.
// Composed from the kit's chip anatomy (21st.dev #6955 badge, as the race card's chips) on Senryo's tokens.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RADIUS, SIZE, SPACE, Skeleton, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { formatUsd } from "./format";
import { useBudget } from "./use-budget";

const SKELETON_WIDTH = 148;
const NEAR_SHARE_BPS = 8_500n;
const BPS = 10_000n;
const NONE = 0n;

export function BudgetChip() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { color } = useTheme();
  const { state } = useBudget();
  if (state.status === "guest" || state.status === "error") return null;
  if (state.status === "loading") return <Skeleton width={SKELETON_WIDTH} height={SIZE.chipHeight} radius={RADIUS.pill} />;
  const view = state.view;
  const left = view ? BigInt(view.leftThisWeek) : NONE;
  const cap = view ? BigInt(view.policy.weeklyCap) : NONE;
  const near = view && cap > NONE && (cap - left) * BPS >= cap * NEAR_SHARE_BPS;
  const label = !view ? t("budget.chip.none") : view.paused ? t("budget.chip.paused") : t("budget.chip.left", { amount: formatUsd(left, locale) });
  const tone = !view ? color.ink : view.paused || near ? color.warn : color.ink;
  return (
    <Pressable
      onPress={() => {
        fire("tick");
        router.push("/budget");
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("budget.chip.hint")}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <View style={[styles.dot, { backgroundColor: !view ? color.text3 : view.paused ? color.warn : color.up }]} />
      <Text style={[TYPE.chipLabel, { color: tone }]} numberOfLines={1}>
        {label}
      </Text>
      {state.stale ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("budget.chip.stale")}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, alignSelf: "flex-start", minHeight: SIZE.chipHeight, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill },
  dot: { width: SIZE.dot, height: SIZE.dot, borderRadius: RADIUS.pill },
});
