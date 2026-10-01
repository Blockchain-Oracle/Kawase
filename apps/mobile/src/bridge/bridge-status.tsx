// A bridge after the yes: three steps in order — sent from Arc, confirmed by Circle, arrived on the other chain —
// with the current one breathing and the done ones checked, so the person sees where their money is while it
// crosses (about a minute). The ending names what actually arrived (from the destination's mint) and links both
// sides. Reduced motion keeps the current step's dot still.
import { Check, Clock, ExternalLink, Minus, X } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import Animated, { FadeIn, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import type { BridgeIntent, BridgeStage } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { isIntentMoving } from "@/intents/use-wallet-intent";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";

import { chainName } from "./copy";

const DOT = 12;
const BADGE = 64;
const BADGE_COMPACT = 44;
const PULSE_LOW = 0.35;
const STEPS: readonly BridgeStage[] = ["burning", "attesting", "minting"];

function Pulse() {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  React.useEffect(() => {
    if (reduced) return undefined;
    opacity.value = withRepeat(withTiming(PULSE_LOW, { duration: MOTION.sendingCycleMs }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View className="bg-primary rounded-full" style={[{ width: DOT, height: DOT }, style]} />;
}

function Steps({ stage, chain }: { stage: BridgeStage; chain: string }) {
  const { t } = useT();
  const current = stage === "delivered" ? STEPS.length : STEPS.indexOf(stage);
  const labels = [t("bridge.stepBurn"), t("bridge.stepAttest"), t("bridge.stepMint", { chain })];
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS.length, now: current }} className="w-full gap-3">
      {labels.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={label} className="flex-row items-center gap-3">
            <View className={cn("size-7 items-center justify-center rounded-full", done ? "bg-success/15" : "bg-muted")}>
              {done ? <Icon as={Check} className="text-success size-4" /> : active ? <Pulse /> : null}
            </View>
            <Text className={cn("flex-1 text-base", TEXT_START, done || active ? "text-foreground" : "text-muted-foreground", active && "font-semibold")}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

type Ending = { icon: typeof Check; tone: "success" | "destructive" | "muted"; title: string; body: string };

function useEnding(intent: BridgeIntent, chain: string): Ending | undefined {
  const { t } = useT();
  const money = useMoney();
  const received = money("USDC", intent.received ?? intent.draft?.minReceived ?? null);
  switch (intent.outcome) {
    case "sent":
      return { icon: Check, tone: "success", title: t("bridge.deliveredTitle", { chain }), body: t("bridge.deliveredBody", { received, chain }) };
    case "not_sent":
      return { icon: X, tone: "destructive", title: t("bridge.notSentTitle"), body: t("bridge.notSentBody") };
    case "reverted":
      return { icon: X, tone: "destructive", title: t("bridge.revertedTitle"), body: t("bridge.revertedBody") };
    case "checking":
      return { icon: Clock, tone: "muted", title: t("bridge.checkingTitle"), body: t("bridge.checkingBody") };
    case "canceled":
      return { icon: Minus, tone: "muted", title: t("bridge.canceledTitle"), body: t("bridge.notSentBody") };
    case "expired":
      return { icon: Minus, tone: "muted", title: t("bridge.expiredTitle"), body: t("bridge.expiredBody") };
    default:
      return undefined;
  }
}

export function BridgeStatus({ intent, compact, actions, connectionLost }: { intent: BridgeIntent; compact?: boolean; actions?: React.ReactNode; connectionLost?: boolean }) {
  const { t } = useT();
  const money = useMoney();
  const reduced = useReducedMotion();
  const chain = chainName(intent.draft?.chainId, intent.draft?.destination ?? "");
  const ending = useEnding(intent, chain);

  if (isIntentMoving(intent) && intent.state !== "unknown_outcome" && intent.draft) {
    return (
      <View className={cn("items-center", compact ? "gap-3 py-2" : "gap-5 py-6")}>
        <Text className={cn("font-display text-foreground text-center font-bold", compact ? "text-lg" : "text-2xl")}>
          {`${money("USDC", intent.draft.amount)} → ${chain}`}
        </Text>
        <Steps stage={intent.stage ?? "burning"} chain={chain} />
        <StateLabel>{t("bridge.bridging")}</StateLabel>
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-sm">
          {connectionLost ? t("send.connectionLost") : t("bridge.movingBody")}
        </Text>
      </View>
    );
  }
  if (!ending) return null;
  const size = compact ? BADGE_COMPACT : BADGE;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)} className={cn("items-center", compact ? "gap-2 py-1" : "gap-3 py-4")}>
      <View
        className={cn("items-center justify-center rounded-full", ending.tone === "success" ? "bg-success/15" : ending.tone === "destructive" ? "bg-destructive/15" : "bg-muted")}
        style={{ width: size, height: size }}
      >
        <Icon
          as={ending.icon}
          className={cn(compact ? "size-5" : "size-7", ending.tone === "success" ? "text-success" : ending.tone === "destructive" ? "text-destructive" : "text-muted-foreground")}
        />
      </View>
      <Text accessibilityRole="header" className={cn("font-display text-foreground text-center font-bold", compact ? "text-xl" : "text-3xl")}>
        {ending.title}
      </Text>
      <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-base">
        {ending.body}
      </Text>
      {intent.outcome === "checking" && intent.stage ? <Steps stage={intent.stage} chain={chain} /> : null}
      <View className="flex-row flex-wrap justify-center">
        {intent.tx ? (
          <Button variant="ghost" size="sm" onPress={() => void Linking.openURL(intent.tx!.explorerUrl)}>
            <Icon as={ExternalLink} className="text-muted-foreground size-4" />
            <Text className="text-muted-foreground">{t("send.viewExplorer")}</Text>
          </Button>
        ) : null}
        {intent.mintTx ? (
          <Button variant="ghost" size="sm" onPress={() => void Linking.openURL(intent.mintTx!.explorerUrl)}>
            <Icon as={ExternalLink} className="text-muted-foreground size-4" />
            <Text className="text-muted-foreground">{t("bridge.viewArrival")}</Text>
          </Button>
        ) : null}
      </View>
      {actions ? <View className="w-full gap-2 pt-2">{actions}</View> : null}
    </Animated.View>
  );
}
