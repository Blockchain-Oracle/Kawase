// One money movement (list-row grammar, Fomo F10/F22, Solflare S15 rows): who it was with — a real mark for
// Circle and Kawase, the authored koban avatar for anyone else — with the asset's real mark as a badge, a title
// and a muted line (direction and time), and the amount in mono at the trailing end: "+" and mint for money in,
// "−" for money out, so colour is never the only signal.
import type { ActivityItem } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Amount } from "@kawase/ui-native/components/amount";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { View } from "react-native";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

const AVATAR = 44;
const BADGE = 18;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const SKELETON_TITLE = 120;
const SKELETON_LINE = 80;
const SKELETON_AMOUNT = 72;

export const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

/** Who the other side is, in words: a known wallet's name, or its short address. */
export function useCounterpartyName() {
  const { t } = useT();
  return (item: ActivityItem) => {
    switch (item.counterpartyLabel) {
      case "circle_faucet":
        return t("activity.circleFaucet");
      case "kawase_agent":
        return t("activity.kawaseAgent");
      case "kawase_relayer":
        return t("common.appName");
      case "self":
        return t("activity.self");
      default:
        return shortAddress(item.counterparty);
    }
  };
}

export function CounterpartyAvatar({ item, size = AVATAR }: { item: ActivityItem; size?: number }) {
  const ids = arcIdentity(item.network);
  const token = item.asset === "USDC" ? ids.usdc : ids.eurc;
  const face =
    item.counterpartyLabel === "circle_faucet" ? (
      <Mark entity="provider:circle" size={size} disc />
    ) : item.counterpartyLabel === "kawase_agent" || item.counterpartyLabel === "kawase_relayer" ? (
      <Mark entity="provider:kawase" size={size} />
    ) : (
      <DefaultAvatar seed={item.counterparty.toLowerCase()} size={size} />
    );
  return (
    <View style={{ width: size, height: size }}>
      {face}
      {token ? (
        <View className="border-card absolute rounded-full border-2" style={{ end: -2, bottom: -2 }}>
          <Mark entity={token} size={BADGE} />
        </View>
      ) : null}
    </View>
  );
}

export function useSignedAmount() {
  const { locale } = useLocale();
  return (item: ActivityItem) => `${item.direction === "in" ? "+" : "−"}${formatAmount(amount(item.asset, BigInt(item.amount)), locale)}`;
}

export function ActivityRow({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const name = useCounterpartyName();
  const signed = useSignedAmount();
  const when = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.at));
  return (
    <ListRow
      leading={<CounterpartyAvatar item={item} />}
      title={item.direction === "in" ? t("activity.fromName", { name: name(item) }) : t("activity.toName", { name: name(item) })}
      subtitle={`${item.direction === "in" ? t("activity.received") : t("activity.sent")} · ${when}`}
      trailing={<Amount className={item.direction === "in" ? "text-success text-base font-semibold" : "text-foreground text-base font-semibold"}>{signed(item)}</Amount>}
      onPress={onPress}
    />
  );
}

/** A loading row: the same geometry as a real one, so nothing jumps when the data lands (P13). */
export function ActivityRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Skeleton className="rounded-full" style={{ width: AVATAR, height: AVATAR }} />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 rounded-md" style={{ width: SKELETON_TITLE }} />
        <Skeleton className="h-3 rounded-md" style={{ width: SKELETON_LINE }} />
      </View>
      <Skeleton className="h-4 rounded-md" style={{ width: SKELETON_AMOUNT }} />
    </View>
  );
}
