// A split bill's progress (C3): the bill in its token (R1), how much of it has come back (a bar that fills as people
// pay), and each person's share with its state — paid (mint check), asked in Kawase (their inbox and a push), waiting,
// or expired — and a Share button that sends that person their own link. It reads the split again every few seconds while shares are open, so a payment from any
// wallet turns the row to Paid on its own. Used by the chat's split_bill card and the split page.
import { BellRing, Check, Clock, Share2, X } from "lucide-react-native";
import * as React from "react";
import { Share, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { toast } from "sonner-native";

import type { SplitShare, SplitView } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const POLL_MS = 5_000;
const AVATAR = 32;
const PERCENT = 100;
const ZERO = 0n;

export function useSplit(initial: SplitView) {
  const [split, setSplit] = React.useState(initial);
  const open = split.status === "open";
  React.useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => {
      api.splits
        .get(split.id)
        .then(({ split: next }) => setSplit(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, split.id]);
  return [split, setSplit] as const;
}

function ShareRow({ share, asset, decimals, title, network }: { share: SplitShare; asset: string; decimals: number; title: string; network: string }) {
  const { t } = useT();
  const money = useMoney();
  const { user } = useSession();
  const status = share.request.status;
  const paid = status === "paid";
  const sendLink = async () => {
    const name = user?.handle ? `@${user.handle}` : t("split.someone");
    await Share.share({
      message: t("split.shareMessage", { name, title, amount: money(asset, share.amount, decimals), network, link: share.request.link }),
    }).catch(() => undefined);
  };
  return (
    <View className="flex-row items-center gap-3 py-2">
      <DefaultAvatar seed={share.handle ?? share.name} size={AVATAR} label={share.name} />
      <View className="min-w-0 flex-1">
        <Text className={cn("text-foreground text-base font-medium", TEXT_START)} numberOfLines={1}>
          {share.name}
        </Text>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)} numberOfLines={1}>
          {[
            share.handle ? `@${share.handle}` : null,
            paid ? t("split.paid") : status === "open" ? (share.askedInApp ? t("split.askedInApp") : t("split.waiting")) : t("split.closed"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {share.askedInApp && status === "open" ? <Icon as={BellRing} className="text-muted-foreground size-4" /> : null}
      <Amount className={cn("text-sm font-semibold", paid ? "text-success" : "text-foreground")}>{money(asset, share.amount, decimals)}</Amount>
      {paid ? (
        <Icon as={Check} className="text-success size-5" />
      ) : status === "open" ? (
        <Button size="sm" variant="secondary" accessibilityLabel={t("split.shareTo", { name: share.name })} onPress={() => void sendLink()}>
          <Icon as={Share2} className="size-4" />
        </Button>
      ) : (
        <Icon as={status === "expired" ? Clock : X} className="text-muted-foreground size-5" />
      )}
    </View>
  );
}

export function SplitCard({ initial, framed = true }: { initial: SplitView; framed?: boolean }) {
  const { t } = useT();
  const money = useMoney();
  const [split, setSplit] = useSplit(initial);
  const [cancelling, setCancelling] = React.useState(false);
  const requested = split.shares.reduce((sum, share) => sum + BigInt(share.amount), ZERO);
  const share = requested > ZERO ? Number((BigInt(split.collected) * BigInt(PERCENT)) / requested) : 0;
  const progress = useSharedValue(share);
  React.useEffect(() => {
    progress.value = withTiming(share, { duration: MOTION.sheetMs });
  }, [share, progress]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value}%` }));
  const network = split.network === "testnet" ? t("network.arcTestnet") : t("network.arc");

  const cancel = async () => {
    setCancelling(true);
    try {
      setSplit((await api.splits.cancel(split.id)).split);
    } catch {
      toast(t("common.error"));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <View className={cn("gap-4", framed && "bg-card border-border rounded-[26px] border p-4")}>
      <View className="gap-1">
        <Text className={cn("text-muted-foreground text-xs font-semibold uppercase tracking-wider", TEXT_START)}>
          {`${t("split.eyebrow")} · ${network}`}
        </Text>
        <Text className={cn("text-foreground text-lg font-semibold", TEXT_START)}>{split.title}</Text>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {split.myShare ? t("split.billWithMine", { total: money(split.asset, split.total, split.assetToken.decimals), mine: money(split.asset, split.myShare, split.assetToken.decimals) }) : t("split.bill", { total: money(split.asset, split.total, split.assetToken.decimals) })}
        </Text>
      </View>

      <View className="gap-1.5">
        <View className="bg-secondary h-2 overflow-hidden rounded-full">
          <Animated.View style={bar} className="bg-success h-2 rounded-full" />
        </View>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {split.status === "settled"
            ? t("split.settled")
            : split.status === "canceled"
              ? t("split.canceled")
              : t("split.progress", { collected: money(split.asset, split.collected, split.assetToken.decimals), requested: money(split.asset, requested.toString(), split.assetToken.decimals), paid: split.paidCount, count: split.shares.length })}
        </Text>
      </View>

      <View>
        {split.shares.map((entry) => (
          <ShareRow key={entry.request.id} share={entry} asset={split.asset} decimals={split.assetToken.decimals} title={split.title} network={network} />
        ))}
      </View>

      {split.status === "open" && split.paidCount < split.shares.length ? (
        <Button variant="ghost" size="sm" disabled={cancelling} onPress={() => void cancel()}>
          <Text className="text-muted-foreground">{t("split.cancelRest")}</Text>
        </Button>
      ) : null}
    </View>
  );
}
