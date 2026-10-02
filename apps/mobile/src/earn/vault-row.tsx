// One vault as a row: the protocol's real mark, the vault's readable title (the full name is in its detail), who
// curates it and whether it is a test vault, the yield now in the display face, and in words whether Circle monitors
// it and how much it can pay out right now — compact when it is large (never colour alone).
import { ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { EarnVaultView } from "@kawase/api-client";
import { getEntity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

import { useCompactMoney, usePercent } from "./copy";
import { isTestVault, vaultTitle } from "./vault-title";

const MARK = 40;
const USDC_DECIMALS = 6;
const TEN = 10n;

export const protocolEntity = (protocol: string) => `provider:${protocol.toLowerCase()}`;

/** A decimal USDC string from the api ("1000000.0") as base units for formatting. */
export const decimalUnits = (decimal: string) => {
  const [whole = "0", fraction = ""] = decimal.split(".");
  return (BigInt(whole) * TEN ** BigInt(USDC_DECIMALS) + BigInt((fraction + "000000").slice(0, USDC_DECIMALS))).toString();
};

export function VaultRow({ vault, onPress, selected, network = "testnet" }: { vault: EarnVaultView; onPress?: () => void; selected?: boolean; network?: "testnet" | "mainnet" }) {
  const { t } = useT();
  const compact = useCompactMoney();
  const percent = usePercent();
  const protocol = getEntity(protocolEntity(vault.protocol))?.name ?? vault.protocol;
  const who = vault.curator ? t("earn.curatedBy", { name: vault.curator }) : protocol;
  const lines = [isTestVault(vault.name, network) ? `${who} · ${t("earn.testVault")}` : who, t("earn.available", { amount: compact("USDC", decimalUnits(vault.available)) })];
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      disabled={!onPress}
      className={cn("flex-row items-center gap-3 px-4 py-3", onPress && "active:bg-muted", selected && "bg-secondary")}
    >
      <Mark entity={protocolEntity(vault.protocol)} size={MARK} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
          {vaultTitle(vault.name)}
        </Text>
        <Text numberOfLines={2} className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {lines.join(" · ")}
        </Text>
        {vault.circleGuarded || vault.liquidity !== "liquid" ? (
          <View className="flex-row flex-wrap items-center gap-2 pt-0.5">
            {vault.circleGuarded ? (
              <View className="flex-row items-center gap-1">
                <Icon as={ShieldCheck} className="text-success size-3.5" />
                <Text className="text-success text-xs font-semibold">{t("earn.circleGuarded")}</Text>
              </View>
            ) : null}
            {vault.liquidity !== "liquid" ? <Text className="text-foreground text-xs font-semibold">{t("earn.lowLiquidity")}</Text> : null}
          </View>
        ) : null}
      </View>
      <View className="items-end">
        <Text className="font-display text-foreground text-xl font-bold" style={{ fontVariant: ["tabular-nums"] }}>
          {percent(vault.apy)}
        </Text>
        <Text className="text-muted-foreground text-xs">{t("earn.perYear")}</Text>
      </View>
    </Pressable>
  );
}
