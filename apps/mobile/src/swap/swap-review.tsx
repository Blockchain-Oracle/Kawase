// What a swap will do, exactly, before the person says yes (DESIGN.md: the confirm card shows the exact amounts,
// assets and network). Shared by the swap screen and the chat card. A ticket in two halves joined by the direction
// arrow: what leaves (exact), what comes back (about, and the least it may be, which the chain enforces). Then the
// rate next to Circle's market rate, with the gap said in words (a warning row when it is wide, never colour alone),
// the route and network fees, who priced it, and when. One quiet line says approve + swap are one transaction.
import { ArrowDown, CircleAlert, Info, RefreshCw } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { SwapIntent } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { amount as toAmount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";

import { useRateLines, useSwapPolicyText } from "./copy";

const MARK = 36;
const MARK_COMPACT = 28;
const ARROW = 32;
const ZERO = 0n;
/** Fees on Arc are fractions of a cent, so they get four places instead of two. */
const FEE_DIGITS = 4;

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className={cn("text-foreground shrink text-end text-sm", strong && "font-semibold")}>{value}</Text>
    </View>
  );
}

function Side({ label, mark, amount, sub, compact }: { label: string; mark: React.ReactNode; amount: string; sub?: string | undefined; compact?: boolean | undefined }) {
  return (
    <View className="gap-1">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <View className="flex-row items-center gap-3">
        {mark}
        <Amount numberOfLines={1} adjustsFontSizeToFit className={cn("font-display text-foreground shrink font-bold", compact ? "text-2xl" : "text-3xl")}>
          {amount}
        </Amount>
      </View>
      {sub ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{sub}</Text> : null}
    </View>
  );
}

export function SwapReview({ intent, compact, onRefresh, refreshing }: { intent: SwapIntent; compact?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  const rateLines = useRateLines();
  const policyText = useSwapPolicyText();
  const draft = intent.draft;
  if (!draft) return null;
  const ids = arcIdentity(intent.network);
  const markOf = (asset: "USDC" | "EURC") => (
    <Mark entity={asset === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={compact ? MARK_COMPACT : MARK} />
  );
  const lines = rateLines(draft);
  const wide = intent.results.find((entry) => entry.code === "RATE_BELOW_REFERENCE");
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const quotedAt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(draft.quotedAt));
  const fee = (asset: AssetId, baseUnits: string) => formatAmount(toAmount(asset, BigInt(baseUnits)), locale, { fractionDigits: FEE_DIGITS });
  const routeFee = BigInt(draft.fees.route) > ZERO ? fee(draft.tokenIn, draft.fees.route) : null;

  return (
    <View className="gap-4">
      <View className="bg-muted gap-3 rounded-3xl p-4">
        <Side label={t("swap.youPay")} mark={markOf(draft.tokenIn)} amount={money(draft.tokenIn, draft.amountIn)} compact={compact} />
        <View className="flex-row items-center gap-3">
          <View className="bg-border h-px flex-1" />
          <View className="bg-card border-border items-center justify-center rounded-full border" style={{ width: ARROW, height: ARROW }}>
            <Icon as={ArrowDown} className="text-foreground size-4" />
          </View>
          <View className="bg-border h-px flex-1" />
        </View>
        <Side
          label={t("swap.youGet")}
          mark={markOf(draft.tokenOut)}
          amount={money(draft.tokenOut, draft.estimatedOut)}
          sub={t("swap.atLeast", { amount: money(draft.tokenOut, draft.minOut) })}
          compact={compact}
        />
      </View>

      {wide ? (
        <View className="flex-row items-start gap-2">
          <Icon as={CircleAlert} className="text-foreground mt-0.5 size-4" />
          <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>
            {policyText(wide, intent.network)}
            {intent.network === "testnet" ? ` ${t("swap.testnetPools")}` : ""}
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <DetailRow label={t("swap.rate")} value={lines.rate} />
        {lines.market ? <DetailRow label={t("swap.market")} value={lines.gap && !wide ? `${lines.market} · ${lines.gap}` : lines.market} /> : null}
        {routeFee ? <DetailRow label={t("swap.routeFee")} value={routeFee} /> : null}
        {draft.fees.network ? <DetailRow label={t("swap.networkFee")} value={t("swap.networkFeeValue", { amount: fee("USDC", draft.fees.network) })} /> : null}
        <DetailRow label={t("swap.provider")} value={`${draft.provider} · ${networkName}`} />
      </View>

      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-start gap-2">
          <Icon as={Info} className="text-muted-foreground mt-0.5 size-4" />
          <Text className={cn("text-muted-foreground flex-1 text-xs", TEXT_START)}>{t("swap.together")}</Text>
        </View>
        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t("swap.refresh")}, ${t("swap.quotedAt", { time: quotedAt })}`}
            disabled={refreshing}
            onPress={onRefresh}
            className="bg-muted active:bg-secondary min-h-11 flex-row items-center gap-1.5 rounded-full px-3"
          >
            <Icon as={RefreshCw} className={cn("text-foreground size-3.5", refreshing && "opacity-50")} />
            <Text className="text-foreground text-xs font-semibold">{quotedAt}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
