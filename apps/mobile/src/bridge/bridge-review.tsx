// What a bridge will do, exactly, before the person says yes. A ticket in two halves with each chain's real mark:
// what leaves Arc (exact) and the least that arrives on the other chain (the amount less the route's fee cap; the
// actual fee is usually lower). Then the fees, whose address it goes to (the person's own), how it works in one
// line, and the routes Kawase compared, with what each would deliver or why it was not used.
import { ArrowDown, Check, Info } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { BridgeIntent } from "@kawase/api-client";
import { arcIdentity, chainKey } from "@kawase/identity";
import { amount as toAmount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { shortAddress, useMoney } from "@/send/copy";

import { chainName } from "./copy";

const MARK = 36;
const MARK_COMPACT = 28;
const ARROW = 32;
const FEE_DIGITS = 4;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className="text-foreground shrink text-end text-sm">{value}</Text>
    </View>
  );
}

function Side({ label, mark, amount, sub, compact }: { label: string; mark: React.ReactNode; amount: string; sub: string; compact?: boolean | undefined }) {
  return (
    <View className="gap-1">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <View className="flex-row items-center gap-3">
        {mark}
        <Amount numberOfLines={1} adjustsFontSizeToFit className={cn("font-display text-foreground shrink font-bold", compact ? "text-2xl" : "text-3xl")}>
          {amount}
        </Amount>
      </View>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{sub}</Text>
    </View>
  );
}

export function BridgeReview({ intent, compact }: { intent: BridgeIntent; compact?: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  const draft = intent.draft;
  if (!draft) return null;
  const ids = arcIdentity(intent.network);
  const size = compact ? MARK_COMPACT : MARK;
  const chain = chainName(draft.chainId, draft.destination);
  const arc = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const fee = (baseUnits: string) => formatAmount(toAmount("USDC", BigInt(baseUnits)), locale, { fractionDigits: FEE_DIGITS });

  return (
    <View className="gap-4">
      <View className="bg-muted gap-3 rounded-3xl p-4">
        <Side label={t("bridge.youSend")} mark={<Mark entity={ids.usdc} chainBadge={ids.chain} size={size} />} amount={money("USDC", draft.amount)} sub={arc} compact={compact} />
        <View className="flex-row items-center gap-3">
          <View className="bg-border h-px flex-1" />
          <View className="bg-card border-border items-center justify-center rounded-full border" style={{ width: ARROW, height: ARROW }}>
            <Icon as={ArrowDown} className="text-foreground size-4" />
          </View>
          <View className="bg-border h-px flex-1" />
        </View>
        <Side
          label={t("bridge.youReceive")}
          mark={<Mark entity={ids.usdc} chainBadge={chainKey(draft.chainId)} size={size} />}
          amount={money("USDC", draft.minReceived)}
          sub={t("bridge.toYou", { chain })}
          compact={compact}
        />
      </View>

      <View className="gap-2">
        <DetailRow label={t("bridge.fee")} value={t("bridge.feeValue", { amount: fee(draft.maxRouteFee) })} />
        {draft.networkFee ? <DetailRow label={t("swap.networkFee")} value={t("swap.networkFeeValue", { amount: fee(draft.networkFee) })} /> : null}
        <DetailRow label={t("bridge.to")} value={`${chain} · ${shortAddress(draft.recipient)}`} />
        <DetailRow label={t("swap.provider")} value={draft.provider} />
      </View>

      <View className="flex-row items-start gap-2">
        <Icon as={Info} className="text-muted-foreground mt-0.5 size-4" />
        <Text className={cn("text-muted-foreground flex-1 text-xs", TEXT_START)}>
          {t("bridge.arrives", { chain })} {t("bridge.howItWorks", { chain })}
        </Text>
      </View>

      {!compact && draft.routes.length > 1 ? (
        <View className="border-border gap-2 rounded-2xl border px-4 py-3">
          <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("bridge.routes")}</Text>
          {draft.routes.map((route) => (
            <View key={route.provider} className="flex-row items-start justify-between gap-3">
              <View className="flex-1 flex-row items-center gap-2">
                {route.status === "chosen" ? <Icon as={Check} className="text-success size-4" /> : <View className="size-4" />}
                <Text className={cn("text-sm", route.status === "chosen" ? "text-foreground font-semibold" : "text-muted-foreground")}>{route.provider}</Text>
              </View>
              <Text className="text-muted-foreground shrink text-end text-xs">
                {route.status === "chosen"
                  ? t("bridge.routeChosen")
                  : route.received
                    ? `${t("bridge.routeWouldArrive", { amount: money("USDC", route.received) })} · ${t(`bridge.reason_${route.reason ?? "quote_only"}`)}`
                    : t(`bridge.reason_${route.reason ?? "no_quote"}`)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
