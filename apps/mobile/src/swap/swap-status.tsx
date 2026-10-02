// A swap after the yes: the two currencies' marks trade places on a shallow arc while the network works (the
// exchange, said in motion), then the ending arrives calmly with its own words. "Swapped" names what actually
// arrived (from the receipt), not the estimate. Every other ending says what happened to the money. Reduced motion
// keeps the marks still, side by side with an arrow.
import { ArrowRight, Check, Clock, ExternalLink, Minus, X } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { SwapIntent } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

import { SwapTokenMark, useSwapMoney } from "./swap-tokens";
import { isSwapMoving } from "./use-swap";

const MARK = 56;
const MARK_COMPACT = 40;
const TRAVEL = 44;
const TRAVEL_COMPACT = 30;
const LIFT = 22;
const BADGE = 64;
const BADGE_COMPACT = 44;
const STAGE_HEIGHT = 120;
const STAGE_COMPACT = 84;
/** Halfway through a pass the two marks cross; whoever is rising passes in front. */
const MIDPOINT = 0.5;
const BOTH_SIDES = 2;

/** Two marks trading places: `in` rises over to the far side while `out` dips under to the near one. */
function Exchange({ draft, network, compact }: { draft: NonNullable<SwapIntent["draft"]>; network: SwapIntent["network"]; compact: boolean }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const travel = compact ? TRAVEL_COMPACT : TRAVEL;
  const size = compact ? MARK_COMPACT : MARK;
  React.useEffect(() => {
    if (reduced) return undefined;
    progress.value = withRepeat(withTiming(1, { duration: MOTION.sendingCycleMs, easing: Easing.inOut(Easing.cubic) }), -1, true);
    return () => cancelAnimation(progress);
  }, [progress, reduced]);
  const first = useAnimatedStyle(() => ({
    transform: [{ translateX: -travel + BOTH_SIDES * travel * progress.value }, { translateY: -LIFT * Math.sin(Math.PI * progress.value) }],
    zIndex: progress.value < MIDPOINT ? BOTH_SIDES : 1,
  }));
  const second = useAnimatedStyle(() => ({
    transform: [{ translateX: travel - BOTH_SIDES * travel * progress.value }, { translateY: LIFT * Math.sin(Math.PI * progress.value) }],
    zIndex: progress.value < MIDPOINT ? 1 : BOTH_SIDES,
  }));
  const mark = (side: "in" | "out") => <SwapTokenMark draft={draft} side={side} network={network} size={size} />;
  if (reduced) {
    return (
      <View className="flex-row items-center gap-4" style={{ direction: "ltr" }}>
        {mark("in")}
        <Icon as={ArrowRight} className="text-muted-foreground size-5" />
        {mark("out")}
      </View>
    );
  }
  return (
    <View className="items-center justify-center" style={{ height: compact ? STAGE_COMPACT : STAGE_HEIGHT, width: size + BOTH_SIDES * travel, direction: "ltr" }}>
      <Animated.View className="absolute" style={first}>
        {mark("in")}
      </Animated.View>
      <Animated.View className="absolute" style={second}>
        {mark("out")}
      </Animated.View>
    </View>
  );
}

type Ending = { icon: typeof Check; tone: "success" | "destructive" | "muted"; title: string; body: string };

function useEnding(intent: SwapIntent): Ending | undefined {
  const { t } = useT();
  const money = useSwapMoney();
  const draft = intent.draft;
  const paid = draft ? money(draft, "in", draft.amountIn, intent.network) : "";
  const received = draft ? money(draft, "out", intent.received ?? draft.estimatedOut, intent.network) : "";
  switch (intent.outcome) {
    case "sent":
      return { icon: Check, tone: "success", title: t("swap.swappedTitle"), body: t("swap.swappedBody", { received, paid }) };
    case "not_sent":
      return { icon: X, tone: "destructive", title: t("swap.notSwappedTitle"), body: t("swap.notSwappedBody") };
    case "reverted":
      return { icon: X, tone: "destructive", title: t("swap.revertedTitle"), body: t("swap.revertedBody") };
    case "checking":
      return { icon: Clock, tone: "muted", title: t("swap.checkingTitle"), body: t("swap.checkingBody") };
    case "canceled":
      return { icon: Minus, tone: "muted", title: t("swap.canceledTitle"), body: t("swap.notSwappedBody") };
    case "expired":
      return { icon: Minus, tone: "muted", title: t("swap.expiredTitle"), body: t("swap.expiredBody") };
    default:
      return undefined;
  }
}

export function SwapStatus({ intent, compact, actions, connectionLost }: { intent: SwapIntent; compact?: boolean; actions?: React.ReactNode; connectionLost?: boolean }) {
  const { t } = useT();
  const money = useSwapMoney();
  const reduced = useReducedMotion();
  const ending = useEnding(intent);
  const draft = intent.draft;
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");

  if (isSwapMoving(intent) && intent.state !== "unknown_outcome" && draft) {
    return (
      <View className={cn("items-center", compact ? "gap-2 py-2" : "gap-4 py-6")}>
        <Text className={cn("font-display text-foreground text-center font-bold", compact ? "text-lg" : "text-2xl")}>
          {`${money(draft, "in", draft.amountIn, intent.network)} → ${draft.tokenOut}`}
        </Text>
        <Exchange draft={draft} network={intent.network} compact={Boolean(compact)} />
        <StateLabel>{t("swap.swapping")}</StateLabel>
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-sm">
          {connectionLost ? t("send.connectionLost") : t("swap.swappingBody", { network: networkName })}
        </Text>
      </View>
    );
  }
  if (!ending) return null;
  const size = compact ? BADGE_COMPACT : BADGE;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)} className={cn("items-center", compact ? "gap-2 py-1" : "gap-3 py-4")}>
      <View
        className={cn(
          "items-center justify-center rounded-full",
          ending.tone === "success" ? "bg-success/15" : ending.tone === "destructive" ? "bg-destructive/15" : "bg-muted",
        )}
        style={{ width: size, height: size }}
      >
        <Icon
          as={ending.icon}
          className={cn(compact ? "size-5" : "size-7", ending.tone === "success" ? "text-success" : ending.tone === "destructive" ? "text-destructive" : "text-muted-foreground")}
        />
      </View>
      <Text accessibilityRole="header" className={cn("font-display text-foreground font-bold", compact ? "text-xl" : "text-3xl")}>
        {ending.title}
      </Text>
      <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-base">
        {ending.body}
      </Text>
      {connectionLost && intent.outcome === "checking" ? <Text className="text-muted-foreground text-center text-sm">{t("send.connectionLost")}</Text> : null}
      {intent.tx ? (
        <Button variant="ghost" size="sm" onPress={() => void Linking.openURL(intent.tx!.explorerUrl)}>
          <Icon as={ExternalLink} className="text-muted-foreground size-4" />
          <Text className="text-muted-foreground">{t("send.viewExplorer")}</Text>
        </Button>
      ) : null}
      {actions ? <View className="w-full gap-2 pt-2">{actions}</View> : null}
    </Animated.View>
  );
}
