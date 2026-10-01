// The voice overlay (Phantom M06's blur grammar, Koe's rules): the live page blurs and darkens, the orb rises
// from its slot in the dock to the centre and grows, the state and the words come forward, × restores the page.
// While it is open, a voice conversation runs (Stage 10, `voice/voice-session`): the orb follows the voices, Kawase's
// words are shown, and the cards its tools produce appear under them. Typing is always one tap away and continues
// the same thread (K4 / U1). Instant with reduced motion.
//
// One orb at a time (Codex review R16): the travel is measured — the dock's orb slot and the orb's place in the
// column, both in window coordinates — not assumed from the screen's midpoint; the dock's orb steps aside while this
// one is up, and this one stays sharp on its way home (only the words fade), handing back when it lands. To
// assistive tech (R13) the overlay is the only surface: focus moves to its heading and, unless "Type instead" took
// the person to the chat, back to the dock's orb when it closes.
import { MOTION } from "@kawase/config";
import { useRouter } from "expo-router";
import * as React from "react";
import { Platform, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { focusElement, useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { VoiceSession } from "@/voice/voice-session";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

export const ORB_DOCK_SIZE = 40;
const ORB_OVERLAY_SIZE = 220;
const IDLE_LEVEL = 0.2;
const HALF = 0.5;
const START_SCALE = ORB_DOCK_SIZE / ORB_OVERLAY_SIZE;

type Point = { x: number; y: number };

/** A view's centre in window coordinates (undefined when it is not on screen). */
function measureCentre(node: View | null, done: (centre: Point | undefined) => void) {
  if (!node) return done(undefined);
  node.measureInWindow((x, y, width, height) => done(width > 0 ? { x: x + width * HALF, y: y + height * HALF } : undefined));
}

function RisingOrb({ progress, from, network, level }: { progress: SharedValue<number>; from: SharedValue<Point | null>; network: "mainnet" | "testnet"; level: SharedValue<number> }) {
  // Invisible until both ends are measured, so it never flashes at the centre first.
  const style = useAnimatedStyle(() => {
    const origin = from.value;
    const away = 1 - progress.value;
    return {
      opacity: origin ? 1 : 0,
      transform: [
        { translateX: (origin?.x ?? 0) * away },
        { translateY: (origin?.y ?? 0) * away },
        { scale: START_SCALE + (1 - START_SCALE) * progress.value },
      ],
    };
  });
  return (
    <Animated.View style={[{ width: ORB_OVERLAY_SIZE, height: ORB_OVERLAY_SIZE }, style]}>
      <Orb colors={tokens.orb[network]} level={level} className="size-full" />
    </Animated.View>
  );
}

type VoiceOverlayProps = {
  open: boolean;
};

export function VoiceOverlay({ open }: VoiceOverlayProps) {
  const { t } = useT();
  const router = useRouter();
  const overlay = useOverlay();
  const { mode, network } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotionLive();
  const progress = useSharedValue(0);
  const level = useSharedValue(IDLE_LEVEL);
  const from = useSharedValue<Point | null>(null);
  const slot = React.useRef<View>(null);
  const heading = React.useRef<View>(null);
  const returnFocus = React.useRef(true);
  const trigger = overlay.voiceTrigger;

  React.useEffect(() => {
    if (!open) {
      progress.value = withTiming(0, { duration: reduced ? 0 : MOTION.blurOutMs, easing: Easing.in(Easing.cubic) });
      return;
    }
    returnFocus.current = true;
    // Both ends measured after the overlay has laid out: from the dock's orb to the orb's place in the column.
    const frame = requestAnimationFrame(() =>
      measureCentre(slot.current, (to) =>
        measureCentre(trigger.current, (origin) => {
          from.value = to && origin ? { x: origin.x - to.x, y: origin.y - to.y } : { x: 0, y: 0 };
          progress.value = withTiming(1, { duration: reduced ? 0 : MOTION.orbRiseMs, easing: Easing.out(Easing.cubic) });
        }),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, reduced, progress, from, trigger]);

  const words = useAnimatedStyle(() => ({ opacity: progress.value }));

  const typeInstead = (threadId: string | undefined) => {
    returnFocus.current = false;
    overlay.close();
    router.navigate(threadId ? { pathname: "/chat", params: { thread: threadId } } : "/chat");
  };

  const exited = () => {
    from.value = null;
    overlay.exited("voice");
    if (returnFocus.current) focusElement(trigger.current);
  };

  return (
    <BlurOverlay
      open={open}
      onClose={overlay.close}
      scheme={mode}
      scrim={colors.scrim}
      closeLabel={t("common.close")}
      topInset={insets.top}
      initialFocusRef={heading}
      contentFades={false}
      onExited={exited}
    >
      <View className="flex-1 items-center justify-center gap-4 px-6" style={{ paddingTop: insets.top }}>
        <View ref={slot} style={{ width: ORB_OVERLAY_SIZE, height: ORB_OVERLAY_SIZE }}>
          <RisingOrb progress={progress} from={from} network={network} level={level} />
        </View>
        <Animated.View style={words} className="w-full flex-1 items-center gap-4">
          <View ref={heading} accessible accessibilityRole="header" accessibilityLabel={t("voice.title")} tabIndex={Platform.OS === "web" ? -1 : undefined}>
            <StateLabel>{t("common.appName")}</StateLabel>
          </View>
          {open ? <VoiceSession level={level} onTypeInstead={typeInstead} /> : null}
        </Animated.View>
      </View>
    </BlurOverlay>
  );
}
