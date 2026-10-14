// Take-profit and stop-loss on a position (trade.md "Long / short"), on the kit: two rows of targets as steps from the
// price now (a take-profit past it, a stop-loss before it; never past liquidation), what is saved, Save, and, the first
// time or once the position outgrew or outlived them, one button to let Kawase close this position for the person (its
// grants, one Face ID). Kawase then watches; the tag says "Watching", "Closing" or that it could not close at a fair
// price. The api checks every target.
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { toast } from "sonner-native";
import { formatUnits } from "viem";

import type { MarginPositionView } from "@kawase/api-client";
import { MARGIN_PROTECTION } from "@kawase/config";

import { Button, Panel, RADIUS, SPACE, TYPE, useTheme } from "@/components/kit";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { ChoiceChips, Note } from "@/trade/bits";

import { PRICE_DECIMALS, useMarginFormat } from "./copy";
import { useProtection, type ProtectionRefusal } from "./use-protection";

const CENTS = 2;
const OFF = -1;

type Target = "takeProfit" | "stopLoss";

const usd = (eightDecimals: string | null | undefined) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : null);

export function ProtectionCard({ position, onSaved }: { position: MarginPositionView; onSaved: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const format = useMarginFormat();
  const protection = useProtection(position.id);
  const mark = usd(position.markPrice)!;
  const liquidation = usd(position.liquidationPrice);
  const long = position.side === "long";
  const saved = { takeProfit: usd(position.takeProfit), stopLoss: usd(position.stopLoss) };
  const [chosen, setChosen] = React.useState<Record<Target, number | null>>(saved);
  const [refusal, setRefusal] = React.useState<ProtectionRefusal>();
  const [needsGrant, setNeedsGrant] = React.useState(false);
  React.useEffect(() => {
    setChosen({ takeProfit: usd(position.takeProfit), stopLoss: usd(position.stopLoss) });
  }, [position.takeProfit, position.stopLoss]);

  const options = (target: Target) => {
    const steps: readonly number[] = target === "takeProfit" ? MARGIN_PROTECTION.takeProfitSteps : MARGIN_PROTECTION.stopLossSteps;
    // A take-profit sits past the price, a stop-loss before it: up for a long's take-profit, down for its stop.
    const sign = (target === "takeProfit") === long ? 1 : -1;
    return steps
      .map((step) => ({ step, price: Number((mark * (1 + sign * step)).toFixed(CENTS)) }))
      .filter((option) => target === "takeProfit" || liquidation === null || (long ? option.price > liquidation : option.price < liquidation));
  };
  const changed = chosen.takeProfit !== saved.takeProfit || chosen.stopLoss !== saved.stopLoss;
  const percent = (value: number) => new Intl.NumberFormat(locale, { style: "percent", signDisplay: "always", maximumFractionDigits: 0 }).format(value);

  const save = async () => {
    setRefusal(undefined);
    const result = await protection.protect({
      takeProfit: chosen.takeProfit === null ? null : chosen.takeProfit.toFixed(CENTS),
      stopLoss: chosen.stopLoss === null ? null : chosen.stopLoss.toFixed(CENTS),
    });
    if ("refused" in result) {
      setRefusal(result.refused);
      return;
    }
    setNeedsGrant(result.needsGrant);
    if (!result.needsGrant) toast(t("protect.saved"));
    onSaved();
  };

  const turnOn = async () => {
    if (await protection.turnOn()) {
      setNeedsGrant(false);
      toast(t("protect.saved"));
      onSaved();
    }
  };

  const status = position.protection;
  const granted = protection.view?.grant === "active";
  const row = (target: Target) => (
    <View style={styles.group}>
      <View style={styles.row}>
        <Text style={[TYPE.rowStrong, styles.grow, { color: color.ink }]}>{t(`protect.${target}`)}</Text>
        <Text style={[TYPE.rowAmount, { color: color.text2 }]}>{chosen[target] === null ? t("protect.off") : format.usd(chosen[target]!)}</Text>
      </View>
      <ChoiceChips<number>
        label={t(`protect.${target}`)}
        value={chosen[target] ?? OFF}
        onChange={(price) => setChosen((current) => ({ ...current, [target]: price === OFF ? null : price }))}
        options={[{ value: OFF, label: t("protect.off") }, ...options(target).map((option) => ({ value: option.price, label: percent((option.price - mark) / mark) }))]}
      />
    </View>
  );

  return (
    <Panel style={styles.card}>
      <View style={styles.row}>
        <Text style={[TYPE.sectionTitle, styles.grow, { color: color.ink }]}>{t("protect.title")}</Text>
        {status ? (
          <View style={[styles.tag, { backgroundColor: status === "unavailable" ? color.downSurface : color.upSurface }]}>
            <Text style={[TYPE.chipLabel, { color: status === "unavailable" ? color.down : color.up }]}>{t(`protect.${status}`)}</Text>
          </View>
        ) : null}
      </View>
      {row("takeProfit")}
      {row("stopLoss")}
      {liquidation !== null ? <Note tone="quiet">{t("protect.liquidationNote", { price: format.usd(liquidation, 0) })}</Note> : null}
      {refusal ? <Note>{t(`protect.${refusal}`)}</Note> : null}
      {changed ? <Button label={protection.busy ? t("common.loading") : t("protect.save")} loading={protection.busy} onPress={() => void save()} /> : null}
      {needsGrant || (!granted && (saved.takeProfit !== null || saved.stopLoss !== null) && protection.view?.available) ? (
        <View style={styles.group}>
          <Text style={[TYPE.body, { color: color.ink }]}>{t("protect.needsGrant")}</Text>
          <Button label={protection.busy ? t("protect.turningOn") : t("protect.turnOn")} loading={protection.busy} onPress={() => void turnOn()} />
        </View>
      ) : null}
      {granted && protection.view?.expiresAt ? (
        <View style={styles.row}>
          <Text style={[TYPE.caption, styles.grow, { color: color.text3 }]}>
            {t("protect.onUntil", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(protection.view.expiresAt)) })}
          </Text>
          <Button label={t("protect.turnOff")} variant="ghost" size="sm" block={false} disabled={protection.busy} onPress={() => void protection.turnOff()} />
        </View>
      ) : null}
      <Note tone="quiet">{t("protect.route")}</Note>
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: { gap: SPACE.lg, padding: SPACE.lg },
  group: { gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  tag: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xxs },
});
