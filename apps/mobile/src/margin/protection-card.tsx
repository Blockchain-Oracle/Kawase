// Take-profit and stop-loss on the position page (trade.md "Long / short"): two rows of targets as steps from the
// price now (a take-profit past it, a stop-loss before it; never past liquidation), what is saved, Save, and — the first
// time, or once the position outgrew or outlived them — one button to let Kawase close this position for the person
// (its grants, one Face ID). Kawase then watches; the row says "Watching", "Closing…" or that it could not close at a
// fair price. The api checks every target.
import { ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { toast } from "sonner-native";
import { formatUnits } from "viem";

import type { MarginPositionView } from "@kawase/api-client";
import { MARGIN_PROTECTION } from "@kawase/config";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

import { PRICE_DECIMALS, useMarginFormat } from "./copy";
import { useProtection, type ProtectionRefusal } from "./use-protection";

const CENTS = 2;

type Target = "takeProfit" | "stopLoss";

const usd = (eightDecimals: string | null | undefined) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : null);

export function ProtectionCard({ position, onSaved }: { position: MarginPositionView; onSaved: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
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
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t(`protect.${target}`)}</Text>
        <Text className="text-muted-foreground text-xs">{chosen[target] === null ? t("protect.off") : format.usd(chosen[target]!)}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: chosen[target] === null }}
          onPress={() => setChosen((current) => ({ ...current, [target]: null }))}
          className={cn("rounded-full px-3 py-1.5", chosen[target] === null ? "bg-primary" : "bg-muted active:bg-secondary")}
        >
          <Text className={cn("text-sm font-semibold", chosen[target] === null ? "text-primary-foreground" : "text-foreground")}>{t("protect.off")}</Text>
        </Pressable>
        {options(target).map((option) => (
          <Pressable
            key={option.step}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen[target] === option.price }}
            accessibilityLabel={`${t(`protect.${target}`)} ${format.usd(option.price)}`}
            onPress={() => setChosen((current) => ({ ...current, [target]: option.price }))}
            className={cn("items-center rounded-2xl px-3 py-1.5", chosen[target] === option.price ? "bg-primary" : "bg-muted active:bg-secondary")}
          >
            <Text className={cn("text-sm font-semibold", chosen[target] === option.price ? "text-primary-foreground" : "text-foreground")}>{percent((option.price - mark) / mark)}</Text>
            <Text className={cn("text-[10px]", chosen[target] === option.price ? "text-primary-foreground" : "text-muted-foreground")}>{format.usd(option.price, 0)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View className="border-border gap-4 rounded-3xl border p-4">
      <View className="flex-row items-center gap-2">
        <Icon as={ShieldCheck} className="text-foreground size-5" />
        <Text className={cn("font-display text-foreground flex-1 text-base font-bold", TEXT_START)}>{t("protect.title")}</Text>
        {status ? (
          <View className={cn("rounded-full px-2 py-0.5", status === "unavailable" ? "bg-destructive/15" : "bg-success/15")}>
            <Text className={cn("text-xs font-semibold", status === "unavailable" ? "text-destructive" : "text-success")}>{t(`protect.${status}`)}</Text>
          </View>
        ) : null}
      </View>
      {row("takeProfit")}
      {row("stopLoss")}
      {liquidation !== null ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("protect.liquidationNote", { price: format.usd(liquidation, 0) })}</Text> : null}
      {refusal ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t(`protect.${refusal}`)}</Text> : null}
      {changed ? (
        <Button disabled={protection.busy} onPress={() => void save()}>
          <Text>{protection.busy ? t("common.loading") : t("protect.save")}</Text>
        </Button>
      ) : null}
      {needsGrant || (!granted && (saved.takeProfit !== null || saved.stopLoss !== null) && protection.view?.available) ? (
        <View className="bg-muted gap-3 rounded-2xl px-4 py-3">
          <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("protect.needsGrant")}</Text>
          <Button disabled={protection.busy} onPress={() => void turnOn()}>
            <Text>{protection.busy ? t("protect.turningOn") : t("protect.turnOn")}</Text>
          </Button>
        </View>
      ) : null}
      {granted && protection.view?.expiresAt ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className={cn("text-muted-foreground flex-1 text-xs", TEXT_START)}>
            {t("protect.onUntil", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(protection.view.expiresAt)) })}
          </Text>
          <Button size="sm" variant="ghost" disabled={protection.busy} onPress={() => void protection.turnOff()}>
            <Text className="text-muted-foreground">{t("protect.turnOff")}</Text>
          </Button>
        </View>
      ) : null}
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("protect.route")}</Text>
    </View>
  );
}
