// The yield-options card's body (earn-borrow.md "Which"): every place an asset can earn on Arc, each with its
// protocol's mark, the rate now, what could be withdrawn now and the size, and a risk chip, ranked by rate among those
// that could give the amount back; the best liquid one is marked. Aave opens the supply ticket, a Morpho vault the
// Earn ticket for that vault; an LP campaign is shown as advanced and read-only (impermanent loss, range risk).
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { YieldOptionsView, YieldOptionView } from "@kawase/api-client";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { vaultTitle } from "@/earn/vault-title";

import { protocolEntity, useLendFormat } from "./copy";

const MARK = 32;
const COMPACT_DIGITS = 1;
const RATE_DIGITS = 2;

const RISK_CHIP: Record<YieldOptionView["risk"], { bg: string; text: string }> = {
  blue_chip: { bg: "bg-success/15", text: "text-success" },
  curated: { bg: "bg-secondary", text: "text-foreground" },
  rwa_credit: { bg: "bg-secondary", text: "text-foreground" },
  advanced: { bg: "bg-destructive/15", text: "text-destructive" },
};

/** Where choosing an option goes: Aave's supply ticket, a vault's Earn ticket; LP stays read-only. */
export function useChooseYield() {
  const router = useRouter();
  return (option: YieldOptionView, amount: string | null) => {
    if (!option.executable) return;
    const tail = amount ? `&amount=${encodeURIComponent(amount)}` : "";
    if (option.kind === "aave_v4") router.push(`/borrow?action=supply&asset=${encodeURIComponent(option.asset)}${tail}`);
    else router.push(`/earn?vault=${encodeURIComponent(option.id)}${tail}`);
  };
}

export function YieldOptionRow({ option, best, onPress }: { option: YieldOptionView; best: boolean; onPress?: (() => void) | undefined }) {
  const { t } = useT();
  const { locale } = useLocale();
  const format = useLendFormat();
  const usd = (value: number | null) => (value === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: COMPACT_DIGITS }).format(value));
  const name = option.kind === "morpho_vault" ? vaultTitle(option.name) : option.name;
  const body = (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Mark entity={protocolEntity(option)} size={MARK} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
          {name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <View className={cn("rounded-full px-2 py-0.5", RISK_CHIP[option.risk].bg)}>
            <Text className={cn("text-[10px] font-semibold", RISK_CHIP[option.risk].text)}>{t(`yieldOptions.risk_${option.risk}`)}</Text>
          </View>
          {best ? (
            <View className="bg-primary rounded-full px-2 py-0.5">
              <Text className="text-primary-foreground text-[10px] font-semibold">{t("yieldOptions.best")}</Text>
            </View>
          ) : null}
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
            {option.kind === "lp" ? t("yieldOptions.poolSize", { size: usd(option.tvlUsd) }) : t("yieldOptions.outNow", { now: usd(option.withdrawableUsd), size: usd(option.tvlUsd) })}
          </Text>
        </View>
        {option.note ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t(`yieldOptions.note_${option.note}`)}</Text> : null}
      </View>
      <View className="items-end">
        <Text className="font-display text-foreground text-lg font-bold" style={{ fontVariant: ["tabular-nums"] }}>
          {format.percent(option.rate, RATE_DIGITS)}
        </Text>
        <Text className="text-muted-foreground text-[10px]">{t(`yieldOptions.${option.rateKind}`)}</Text>
      </View>
    </View>
  );
  if (!onPress || !option.executable) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityHint={t("yieldOptions.chooseHint")} onPress={onPress} className="active:bg-muted">
      {body}
    </Pressable>
  );
}

export function YieldOptionsList({ view }: { view: YieldOptionsView }) {
  const { t } = useT();
  const choose = useChooseYield();
  const ready = view.options.filter((option) => option.executable);
  const advanced = view.options.filter((option) => !option.executable);
  if (view.options.length === 0) return <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("yieldOptions.none", { asset: view.asset })}</Text>;
  return (
    <View className="gap-3">
      {ready.length > 0 ? (
        <ListGroup>
          {ready.map((option) => (
            <YieldOptionRow key={option.id} option={option} best={option.id === view.best} onPress={() => choose(option, view.amount)} />
          ))}
        </ListGroup>
      ) : null}
      {advanced.length > 0 ? (
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-xs font-semibold uppercase", TEXT_START)}>{t("yieldOptions.advanced")}</Text>
          <ListGroup>
            {advanced.map((option) => (
              <YieldOptionRow key={option.id} option={option} best={false} />
            ))}
          </ListGroup>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("yieldOptions.advancedBody")}</Text>
        </View>
      ) : null}
    </View>
  );
}
