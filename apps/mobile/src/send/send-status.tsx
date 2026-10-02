// A send after the yes: the silver paper plane floats quickly while the network works. Only a confirmed transfer
// sends it flying off toward the trailing side before the receipt settles in; every other ending (not sent, didn't
// go through, still checking, cancelled, expired) arrives calmly with its own words (Codex review R17.8). Each
// ending says what happened to the money. A lost connection while the send is moving is said plainly. Reduced
// motion keeps the plane still and skips the flight.
import { Check, Clock, ExternalLink, Minus, X } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { SendIntent } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { isRtlLocale } from "@kawase/i18n";
import { Float } from "@kawase/ui-native/components/art/float";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { confirmedFeedback, cue } from "@/feedback/feedback";

import { recipientName, useMoney } from "./copy";
import { isMoving } from "./use-send";

const PLANE_WIDTH = 150;
const PLANE_COMPACT = 96;
const FLY_X = 180;
const FLY_Y = -110;
const FLY_TILT_DEG = 10;
const BADGE = 64;
const BADGE_COMPACT = 44;
const FLOAT_AMPLITUDE = 6;
const FLOAT_TILT = 3;

/** The plane, floating while the send moves and flying off once when `departing` turns true. */
function Plane({
  id,
  compact,
  rtl,
  departing,
  onDeparted,
}: {
  id: string;
  compact: boolean;
  rtl: boolean;
  departing: boolean;
  onDeparted: () => void;
}) {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    if (!departing) return undefined;
    progress.value = withTiming(1, { duration: MOTION.planeFlyMs, easing: Easing.in(Easing.cubic) });
    const timer = setTimeout(onDeparted, MOTION.planeFlyMs);
    return () => clearTimeout(timer);
  }, [departing, onDeparted, progress]);
  const flight = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: (rtl ? -FLY_X : FLY_X) * progress.value },
      { translateY: FLY_Y * progress.value },
      { rotate: `${(rtl ? FLY_TILT_DEG : -FLY_TILT_DEG) * progress.value}deg` },
    ],
  }));
  return (
    <Animated.View style={flight}>
      <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
        <Float amplitude={FLOAT_AMPLITUDE} tilt={FLOAT_TILT} cycleMs={MOTION.sendingCycleMs}>
          <PaperPlane width={compact ? PLANE_COMPACT : PLANE_WIDTH} id={`plane-${id}`} />
        </Float>
      </View>
    </Animated.View>
  );
}

type Ending = { icon: typeof Check; tone: "success" | "destructive" | "muted"; title: string; body: string };

function useEnding(intent: SendIntent): Ending | undefined {
  const { t } = useT();
  const money = useMoney();
  const name = recipientName(intent.draft?.recipient, intent.request.recipient);
  const sent = money(intent.draft?.asset, intent.draft?.amount);
  switch (intent.outcome) {
    case "sent":
      return {
        icon: Check,
        tone: "success",
        title: t("send.sentTitle"),
        body: t("send.sentBody", { amount: sent, name }),
      };
    case "not_sent":
      return { icon: X, tone: "destructive", title: t("send.notSentTitle"), body: t("send.notSentBody") };
    case "reverted":
      return { icon: X, tone: "destructive", title: t("send.revertedTitle"), body: t("send.revertedBody", { name }) };
    case "checking":
      return { icon: Clock, tone: "muted", title: t("send.checkingTitle"), body: t("send.checkingBody") };
    case "canceled":
      return { icon: Minus, tone: "muted", title: t("send.canceledTitle"), body: t("send.notSentBody") };
    case "expired":
      return { icon: Minus, tone: "muted", title: t("send.expiredTitle"), body: t("send.expiredBody") };
    default:
      return undefined;
  }
}

/** The moving state and the ending, with the receipt link; `actions` go under it (Done, Save as contact). */
export function SendStatus({
  intent,
  compact,
  actions,
  connectionLost,
}: {
  intent: SendIntent;
  compact?: boolean;
  actions?: React.ReactNode;
  connectionLost?: boolean;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const reduced = useReducedMotion();
  const ending = useEnding(intent);
  const money = useMoney();
  const rtl = isRtlLocale(locale);
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const moving = isMoving(intent) && intent.state !== "unknown_outcome";
  // The flight belongs to a send this screen watched move and then confirm, not to an old sent card reopened.
  const watched = React.useRef(moving);
  if (moving) watched.current = true;
  const [departed, setDeparted] = React.useState(false);
  const onDeparted = React.useCallback(() => setDeparted(true), []);
  const departing = watched.current && intent.outcome === "sent" && !departed && !reduced;
  React.useEffect(() => {
    if (watched.current && intent.outcome === "sent") void confirmedFeedback(`send:${intent.id}`);
    if (watched.current && intent.outcome === "not_sent") void cue("error", `send-failed:${intent.id}`);
  }, [intent.id, intent.outcome]);

  if (moving || departing) {
    return (
      <View className={cn("items-center", compact ? "gap-2 py-2" : "gap-4 py-6")}>
        {/* With no confirm step inside the allowance, what is moving is always in view while it moves. */}
        {intent.draft ? (
          <Text className={cn("font-display text-foreground text-center font-bold", compact ? "text-lg" : "text-2xl")}>
            {`${money(intent.draft.asset, intent.draft.amount)} → ${recipientName(intent.draft.recipient, intent.request.recipient)}`}
          </Text>
        ) : null}
        <Plane id={intent.id} compact={Boolean(compact)} rtl={rtl} departing={departing} onDeparted={onDeparted} />
        <StateLabel>{t("send.sending")}</StateLabel>
        <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-sm">
          {connectionLost ? t("send.connectionLost") : t("send.sendingBody", { network: networkName })}
        </Text>
      </View>
    );
  }
  if (!ending) return null;
  const size = compact ? BADGE_COMPACT : BADGE;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)}
      className={cn("items-center", compact ? "gap-2 py-1" : "gap-3 py-4")}
    >
      <View
        className={cn(
          "items-center justify-center rounded-full",
          ending.tone === "success"
            ? "bg-success/15"
            : ending.tone === "destructive"
              ? "bg-destructive/15"
              : "bg-muted",
        )}
        style={{ width: size, height: size }}
      >
        <Icon
          as={ending.icon}
          className={cn(
            compact ? "size-5" : "size-7",
            ending.tone === "success"
              ? "text-success"
              : ending.tone === "destructive"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        />
      </View>
      <Text
        accessibilityRole="header"
        className={cn("font-display text-foreground font-bold", compact ? "text-xl" : "text-3xl")}
      >
        {ending.title}
      </Text>
      <Text accessibilityLiveRegion="polite" className="text-muted-foreground text-center text-base">
        {ending.body}
      </Text>
      {connectionLost && intent.outcome === "checking" ? (
        <Text className="text-muted-foreground text-center text-sm">{t("send.connectionLost")}</Text>
      ) : null}
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
