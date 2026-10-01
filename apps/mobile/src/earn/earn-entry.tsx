// Home's way into earning, under the balance: what the person already has in vaults, or what their USDC could earn
// in the best active vault now. One row, the protocol's real mark, the yield in words; it opens /earn. Positions are
// read again whenever Home comes into view: Auto-save moves money in and out without the person doing anything.
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";

import { usePercent } from "./copy";
import { useEarnOverview } from "./use-earn-overview";
import { protocolEntity } from "./vault-row";
import { vaultTitle } from "./vault-title";

const MARK = 36;
const ZERO = 0n;

export function EarnEntry() {
  const { t } = useT();
  const router = useRouter();
  const money = useMoney();
  const percent = usePercent();
  const { best, held, positions, refresh } = useEarnOverview();
  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  if (!best && held === ZERO) return null;
  const title = held > ZERO ? t("earn.homePosition", { amount: money("USDC", held.toString()) }) : t("earn.homeCta", { apy: percent(best!.apy) });
  const subtitle = held > ZERO ? t("earn.earningAbout", { apy: percent(positions[0]?.apy ?? best?.apy ?? 0) }) : vaultTitle(best!.name);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={() => router.push("/earn")}
      className="bg-card border-border active:bg-muted flex-row items-center gap-3 rounded-2xl border px-4 py-3"
    >
      <Mark entity={protocolEntity(best?.protocol ?? "morpho")} size={MARK} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
          {title}
        </Text>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {subtitle}
        </Text>
      </View>
      <Icon as={ChevronRight} className="text-muted-foreground size-5 rtl:-scale-x-100" />
    </Pressable>
  );
}
