/**
 * Hold to confirm (P3; ported from 21st ddoemonn/hold-to-confirm #23527 — Mitoshi's place button): a primary pill that
 * fills left to right while held and fires `onConfirm` only when the fill completes; let go early and it drains at
 * 2.5× the speed. A soft tick at each quarter, a confirm at the end. When it can't fire, it says why (the label is the
 * blocker, Mitoshi's rule). VoiceOver's activate confirms at once — holding is a guard for fingers, not a wall.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { BUTTON, SIZE, TYPE, useTheme } from "./theme";

/** How long a full hold takes; letting go drains it this many times faster. */
export const HOLD_MS = 1200;
const RELEASE_RATE = 2.5;
const QUARTERS = 4;

export function HoldButton({
  label,
  holdingLabel,
  ready,
  busy = false,
  onConfirm,
}: {
  label: string;
  holdingLabel?: string;
  /** False shows `label` as the blocker on the quiet plate. */
  ready: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const { color } = useTheme();
  const { t } = useT();
  const progress = useSharedValue(0);
  const holding = useSharedValue(false);
  const live = ready && !busy;
  useEffect(() => {
    if (!live) {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [live, progress]);
  // A tick each quarter of the way, the confirm at the end (once per hold).
  useAnimatedReaction(
    () => Math.floor(progress.value * QUARTERS),
    (q, prev) => {
      if (!holding.value || prev === null || q <= prev || q >= QUARTERS) return;
      scheduleOnRN(fire, "tick");
    },
  );
  const done = () => {
    fire("confirm");
    onConfirm();
  };
  const start = () => {
    if (!live) return;
    holding.value = true;
    fire("press");
    progress.value = withTiming(1, { duration: HOLD_MS * (1 - progress.value), easing: Easing.linear }, (finished) => {
      if (!finished) return;
      holding.value = false;
      progress.value = 0;
      scheduleOnRN(done);
    });
  };
  const stop = () => {
    if (!holding.value) return;
    holding.value = false;
    progress.value = withTiming(0, { duration: (HOLD_MS * progress.value) / RELEASE_RATE, easing: Easing.linear });
  };
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  return (
    <Pressable
      onPressIn={start}
      onPressOut={stop}
      disabled={!live}
      accessibilityRole="button"
      accessibilityState={{ disabled: !live, busy }}
      accessibilityLabel={label}
      accessibilityHint={live ? t("shell.kit.holdHint") : undefined}
      accessibilityActions={live ? [{ name: "activate" }] : []}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate" && live) done();
      }}
      style={[styles.plate, { backgroundColor: live ? color.primary : color.input }]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.fill, { backgroundColor: color.primaryPressed }, fill]} />
      </View>
      <HoldLabel
        text={label}
        holdingText={holdingLabel ?? t("shell.kit.keepHolding")}
        holding={holding}
        ink={live ? color.primaryForeground : color.text3}
      />
    </Pressable>
  );
}

function HoldLabel({
  text,
  holdingText,
  holding,
  ink,
}: {
  text: string;
  holdingText: string;
  holding: { value: boolean };
  ink: string;
}) {
  const idle = useAnimatedStyle(() => ({ opacity: holding.value ? 0 : 1 }));
  const held = useAnimatedStyle(() => ({ opacity: holding.value ? 1 : 0 }));
  return (
    <View style={styles.labels}>
      <Animated.Text numberOfLines={1} style={[TYPE.buttonLabel, { color: ink }, idle]}>
        {text}
      </Animated.Text>
      <Animated.Text numberOfLines={1} style={[TYPE.buttonLabel, styles.over, { color: ink }, held]}>
        {holdingText}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    height: SIZE.buttonHeight,
    borderRadius: BUTTON.radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, transformOrigin: "left" },
  labels: { alignItems: "center", justifyContent: "center" },
  over: { position: "absolute" },
});
