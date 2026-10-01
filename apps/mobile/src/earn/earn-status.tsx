// A deposit or withdrawal after the yes: the silver coin stack floats while the network works (money settling into
// place), then the ending says what happened in words: what is in which vault and what it earns, or what came back.
// Reduced motion keeps the coins still.
import { Check, Clock, ExternalLink, Minus, X } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";

import type { EarnIntent } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { Float } from "@kawase/ui-native/components/art/float";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { isIntentMoving } from "@/intents/use-wallet-intent";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";

import { usePercent } from "./copy";

const ART = 120;
const ART_COMPACT = 80;
const BADGE = 64;
const BADGE_COMPACT = 44;
const FLOAT_AMPLITUDE = 5;
const FLOAT_TILT = 2;

type Ending = { icon: typeof Check; tone: "success" | "destructive" | "muted"; title: string; body: string };

function useEnding(intent: EarnIntent): Ending | undefined {
  const { t } = useT();
  const money = useMoney();
  const percent = usePercent();
  const draft = intent.draft;
  const deposit = draft?.action !== "withdraw";
  switch (intent.outcome) {
    case "sent":
      return deposit
        ? { icon: Check, tone: "success", title: t("earn.depositedTitle"), body: t("earn.depositedBody", { amount: money("USDC", intent.received ?? draft?.amount), vault: draft?.vault.name ?? "", apy: draft ? percent(draft.vault.apy) : "" }) }
        : { icon: Check, tone: "success", title: t("earn.withdrawnTitle"), body: t("earn.withdrawnBody", { amount: money("USDC", intent.received ?? draft?.minReceived) }) };
    case "not_sent":
      return { icon: X, tone: "destructive", title: t("earn.notDoneTitle"), body: t("earn.notDoneBody") };
    case "reverted":
      return { icon: X, tone: "destructive", title: t("earn.revertedTitle"), body: t("earn.revertedBody") };
    case "checking":
      return { icon: Clock, tone: "muted", title: t("earn.checkingTitle"), body: t("earn.checkingBody") };
    case "canceled":
      return { icon: Minus, tone: "muted", title: t("earn.canceledTitle"), body: t("earn.notDoneBody") };
    case "expired":
      return { icon: Minus, tone: "muted", title: t("earn.expiredTitle"), body: t("earn.expiredBody") };
    default:
      return undefined;
  }
}

export function EarnStatus({ intent, compact, actions, connectionLost }: { intent: EarnIntent; compact?: boolean; actions?: React.ReactNode; connectionLost?: boolean }) {
  const { t } = useT();
  const money = useMoney();
  const reduced = useReducedMotion();
  const ending = useEnding(intent);
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const draft = intent.draft;

  if (isIntentMoving(intent) && intent.state !== "unknown_outcome" && draft) {
    const art = <CoinStack width={compact ? ART_COMPACT : ART} id={`earn-${intent.id}`} />;
    return (
      <View className={cn("items-center", compact ? "gap-2 py-2" : "gap-4 py-6")}>
        <Text className={cn("font-display text-foreground text-center font-bold", compact ? "text-lg" : "text-2xl")}>
          {`${money("USDC", draft.amount)} ${draft.action === "deposit" ? "→" : "←"} ${draft.vault.name}`}
        </Text>
        {reduced ? art : <Float amplitude={FLOAT_AMPLITUDE} tilt={FLOAT_TILT} cycleMs={MOTION.sendingCycleMs}>{art}</Float>}
        <StateLabel>{draft.action === "deposit" ? t("earn.depositing") : t("earn.withdrawing")}</StateLabel>
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-sm">
          {connectionLost ? t("send.connectionLost") : t("earn.movingBody", { network: networkName })}
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
        <Icon as={ending.icon} className={cn(compact ? "size-5" : "size-7", ending.tone === "success" ? "text-success" : ending.tone === "destructive" ? "text-destructive" : "text-muted-foreground")} />
      </View>
      <Text accessibilityRole="header" className={cn("font-display text-foreground text-center font-bold", compact ? "text-xl" : "text-3xl")}>
        {ending.title}
      </Text>
      <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-base">
        {ending.body}
      </Text>
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
