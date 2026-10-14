// Where an asset earns on Arc (earn-borrow.md "Which"), on the one RouteList (plan decision 6): Aave, Morpho vaults and
// Merkl/Aero LP campaigns as rows with their protocol's real mark, the rate as the figure, a year's earnings on the
// amount when one was asked, a risk chip (blue chip, curated, real-world credit, advanced — words, never colour alone),
// and the size and curator behind the chevron. "Best" is the api's pick among the sources that could give the amount
// back, preselected; a tap picks another; the button under the list opens that source's deposit (Aave's supply
// ticket, a vault's Earn ticket, an Aero pool on the LP screen). LP campaigns Kawase does not deposit into are listed
// once below the choices, with why. Designed empty state; the list's own skeleton while loading.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { YieldOptionsView, YieldOptionView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";

import { Button, EmptyState, SIZE, SPACE, TYPE, useGroupFill, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { vaultTitle } from "@/earn/vault-title";
import { yieldRace, yieldVenue } from "@/routes/from-draft";
import { RiskChip, RouteList } from "@/routes/route-list";

import { useLendFormat } from "./copy";

const RATE_DIGITS = 2;
const ROW_RADIUS = 20;

/** Where choosing an option goes: Aave's supply ticket, a vault's Earn ticket, an Aero pool's deposit on the LP screen. */
export function useChooseYield() {
  const router = useRouter();
  return (option: YieldOptionView, amount: string | null) => {
    if (!option.executable) return;
    const tail = amount ? `&amount=${encodeURIComponent(amount)}` : "";
    if (option.kind === "aave_v4") router.push(`/borrow?action=supply&asset=${encodeURIComponent(option.asset)}${tail}`);
    else if (option.kind === "lp") router.push(`/lp?pool=${encodeURIComponent(option.id)}&asset=${encodeURIComponent(option.asset)}${tail}`);
    else router.push(`/earn?vault=${encodeURIComponent(option.id)}${tail}`);
  };
}

/** A source's name as people read it (a Morpho vault's own title, tidied). */
const optionName = (option: YieldOptionView) => (option.kind === "morpho_vault" ? vaultTitle(option.name) : option.name);

/**
 * Every place the asset earns as RouteList rows, with the pick's deposit under them. `decimals` is the asset's (USDC 6)
 * for a year's earnings on the amount.
 */
export function YieldRoutes({ view, decimals, onChoose }: { view: YieldOptionsView; decimals?: number; onChoose?: (option: YieldOptionView) => void }) {
  const { t } = useT();
  const choose = useChooseYield();
  const named = React.useMemo(() => ({ ...view, options: view.options.map((option) => ({ ...option, name: optionName(option) })) }), [view]);
  const race = React.useMemo(() => yieldRace(named, decimals), [named, decimals]);
  const [picked, setPicked] = React.useState<string | null>(null);
  if (view.options.length === 0) return <EmptyState why={t("yieldOptions.none", { asset: view.asset })} size="inline" />;
  const venue = picked ?? race.best;
  const option = view.options.find((entry) => yieldVenue(entry).venue === venue);
  return (
    <View style={styles.wrap}>
      <RouteList race={race} selected={venue} onSelect={setPicked} />
      {option && option.executable ? (
        <Button
          label={t("yieldOptions.earnWith", { name: optionName(option) })}
          onPress={() => {
            fire("press");
            if (onChoose) onChoose(option);
            else choose(option, view.amount);
          }}
        />
      ) : null}
    </View>
  );
}

/** One source as a row (the earn screen's "More ways to earn"), drawn like a RouteList row: mark, name, risk, rate. */
export function YieldOptionRow({ option, best, onPress }: { option: YieldOptionView; best: boolean; onPress?: (() => void) | undefined }) {
  const { t } = useT();
  const { color } = useTheme();
  const fill = useGroupFill();
  const format = useLendFormat();
  const { mark } = yieldVenue(option);
  const body = (
    <View style={[styles.row, { backgroundColor: fill }]}>
      <Mark entity={mark} size={SIZE.markRow} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[TYPE.rowTitle, { color: color.ink }]}>
          {optionName(option)}
        </Text>
        <View style={styles.line}>
          {best ? (
            <View style={[styles.best, { backgroundColor: color.accent }]}>
              <Text style={[TYPE.chipLabel, { color: color.accentForeground }]}>{t("yieldOptions.best")}</Text>
            </View>
          ) : null}
          <RiskChip risk={option.risk} />
          {option.note ? (
            <Text numberOfLines={1} style={[TYPE.meta, styles.shrink, { color: color.text2 }]}>
              {t(`yieldOptions.note_${option.note}`)}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rate}>
        <Text style={[TYPE.numMd, { color: color.ink }]}>{format.percent(option.rate, RATE_DIGITS)}</Text>
        <Text style={[TYPE.meta, { color: color.text2 }]}>{t(`yieldOptions.${option.rateKind}`)}</Text>
      </View>
    </View>
  );
  if (!onPress || !option.executable) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("yieldOptions.chooseHint")}
      onPress={() => {
        fire("tick");
        onPress();
      }}
    >
      {body}
    </Pressable>
  );
}

/** The chat's yield card body (compare_yield): the same RouteList. */
export function YieldOptionsList({ view }: { view: YieldOptionsView }) {
  return <YieldRoutes view={view} />;
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.md },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderRadius: ROW_RADIUS },
  text: { flex: 1, minWidth: 0, gap: SPACE.xs },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  shrink: { flexShrink: 1 },
  best: { borderRadius: SIZE.chipHeight, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs },
  rate: { alignItems: "flex-end" },
});
