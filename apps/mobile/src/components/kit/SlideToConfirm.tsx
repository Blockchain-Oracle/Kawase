/**
 * Slide to confirm (D-235; visuals ported from 21st.dev starc007/slide-action-button, id 29304): a 56 pt rail with a
 * 48 pt thumb in the action's tone. The travelled part fills behind the thumb, the label fades as the thumb passes it,
 * and the thumb's chevron bends into a check as it nears the end — so the user sees the commit coming. It commits once,
 * on release past 90 % of the travel; an early release springs back. A haptic detent marks the moment release would
 * confirm. Background, a changed `resetKey` (the reviewed intent), `disabled` or `busy` cancel it. VoiceOver gets an
 * explicit review-and-confirm action instead of the gesture. Reduced Motion removes the decorative travel.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { BUTTON, CONTROL_FONT_SCALE, SIZE, SPACE, TYPE, useTheme } from "./theme";

const RAIL_HEIGHT = 56;
const THUMB = 48;
const INSET = 4;
const ACTIVATE_X = 8;
const CANCEL_Y = 12;
const COMMIT_FRACTION = 0.9;
const RESET_SPRING = { damping: 28, stiffness: 280, mass: 0.7, overshootClamping: true };
const PRESSED_SCALE = 0.94;
/** Label fade window, as fractions of the travel (21st: 35 % → 65 %), and its midway opacity. */
const FADE_FROM = 0.35;
const FADE_TO = 0.65;
const FADE_MID_OPACITY = 0.75;
const LABEL_FADE = [0, FADE_FROM, FADE_TO];
const LABEL_OPACITY = [1, FADE_MID_OPACITY, 0];
/** Glyph: chevron → bend → check, written as paths (same three-point shape, so they interpolate). viewBox 24. */
const GLYPH_MIDWAY = 0.5;
const GLYPH_STEPS = [0, GLYPH_MIDWAY, 1];
const GLYPH_PATHS = ["M 8 5 L 15 12 L 8 19", "M 7 8 L 12 14 L 17 10", "M 5 12 L 10 17 L 19 7"];
const GLYPH_POINTS = GLYPH_PATHS.map((d) => (d.match(/\d+/g) ?? []).map(Number));
/** Indices of the six coordinates (three points) every glyph path carries. */
const GLYPH_COORDS = GLYPH_POINTS[0]?.map((_, i) => i) ?? [];
const GLYPH_BOX = 24;
const GLYPH_STROKE = 2.4;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type SlideTone = "primary" | "accent" | "up" | "down";

export interface SlideToConfirmProps {
  /** Shown on the rail ("Slide to use real money"); when disabled, the reason ("Enter an amount"). */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** A short preparation step is running (e.g. network fees): the rail holds still with a spinner. */
  busy?: boolean;
  tone?: SlideTone;
  /** Reference-style filled action rail, used where the brand action must remain visually primary. */
  surface?: "wash" | "solid";
  direction?: "left" | "right";
  /** The reviewed intent's identity: any change cancels a slide in progress. */
  resetKey?: string;
  onReset?: () => void;
  /** VoiceOver / Switch Control: replaces the default confirm alert with the screen's own review. */
  onAccessibleActivate?: () => void;
}

export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  busy = false,
  tone = "primary",
  surface = "wash",
  direction = "right",
  resetKey,
  onReset,
  onAccessibleActivate,
}: SlideToConfirmProps) {
  const { color } = useTheme();
  const { t } = useT();
  const reduce = useReducedMotion();
  const left = direction === "left";
  const travel = useSharedValue(0);
  const width = useSharedValue(0);
  const epoch = useSharedValue(0);
  const gestureEpoch = useSharedValue(0);
  const active = useSharedValue(false);
  const pressed = useSharedValue(false);
  const armed = useSharedValue(false);
  const [reader, setReader] = useState(false);
  const alive = useRef(true);
  const done = useRef(false);
  const locked = disabled || busy;
  const current = useRef({ locked, onConfirm, onReset });
  current.current = { locked, onConfirm, onReset };

  const cancel = useCallback(() => {
    epoch.value += 1;
    active.value = false;
    armed.value = false;
    cancelAnimation(travel);
    travel.value = 0;
  }, [active, armed, epoch, travel]);
  useLayoutEffect(() => {
    const wasActive = active.value;
    cancel();
    done.current = false;
    if (wasActive) current.current.onReset?.();
  }, [resetKey, locked, direction, active, cancel]);
  useEffect(() => {
    alive.current = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(setReader);
    const readerSub = AccessibilityInfo.addEventListener("screenReaderChanged", setReader);
    const stateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => {
      alive.current = false;
      cancel();
      readerSub.remove();
      stateSub.remove();
    };
  }, [cancel]);

  const commit = (attempt: number) => {
    if (!alive.current || done.current || current.current.locked || attempt !== epoch.value) return;
    if (AppState.currentState !== "active") return;
    done.current = true;
    fire("confirm");
    current.current.onConfirm();
  };
  const detent = () => fire("tick");
  const review = () => {
    if (locked) return;
    if (onAccessibleActivate) return onAccessibleActivate();
    // An explicit activate from a screen reader or switch control: the slide guards fingers, not assistive tech.
    commit(epoch.value);
  };

  const pan = Gesture.Pan()
    .enabled(!locked && !reader)
    .maxPointers(1)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-CANCEL_Y, CANCEL_Y])
    .onBegin(() => {
      cancelAnimation(travel);
      gestureEpoch.value = epoch.value;
      active.value = true;
      pressed.value = true;
    })
    .onUpdate((event) => {
      if (gestureEpoch.value !== epoch.value) return;
      travel.value = Math.max(0, Math.min(width.value, event.translationX * (left ? -1 : 1)));
      const ready = width.value > 0 && travel.value >= width.value * COMMIT_FRACTION;
      if (ready !== armed.value) {
        armed.value = ready;
        if (ready) scheduleOnRN(detent);
      }
    })
    .onEnd((_event, success) => {
      if (success && active.value && gestureEpoch.value === epoch.value && armed.value) {
        active.value = false;
        travel.value = width.value;
        scheduleOnRN(commit, gestureEpoch.value);
      } else travel.value = reduce ? 0 : withSpring(0, RESET_SPRING);
    })
    .onFinalize(() => {
      pressed.value = false;
      armed.value = false;
      if (active.value) travel.value = reduce ? 0 : withSpring(0, RESET_SPRING);
      active.value = false;
    });

  const progress = () => {
    "worklet";
    return width.value > 0 ? travel.value / width.value : 0;
  };
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: travel.value * (left ? -1 : 1) },
      { scale: pressed.value && !reduce ? PRESSED_SCALE : 1 },
    ],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: travel.value + THUMB + INSET * 2 }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress(), LABEL_FADE, LABEL_OPACITY, "clamp"),
  }));
  const glyphProps = useAnimatedProps(() => {
    const p = progress();
    const at = (i: number) =>
      interpolate(
        p,
        GLYPH_STEPS,
        GLYPH_POINTS.map((points, step) =>
          left && step === 0 && i % 2 === 0 ? GLYPH_BOX - (points[i] ?? 0) : (points[i] ?? 0),
        ),
        "clamp",
      );
    const xy = GLYPH_COORDS.map(at);
    return { d: `M ${xy[0]} ${xy[1]} L ${xy[2]} ${xy[3]} L ${xy[4]} ${xy[5]}` };
  });

  const solid =
    tone === "up" ? color.up : tone === "down" ? color.down : tone === "accent" ? color.accent : color.primary;
  const onSolid =
    tone === "up"
      ? color.upForeground
      : tone === "down"
        ? color.downForeground
        : tone === "accent"
          ? color.accentForeground
          : color.primaryForeground;
  const wash = tone === "up" ? color.upWash : tone === "down" ? color.downWash : color.primaryWash;
  const washStrong =
    tone === "up" ? color.upWashStrong : tone === "down" ? color.downWashStrong : color.primaryWashStrong;
  const filled = surface === "solid" && !locked;

  return (
    <View
      accessible={!reader}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={locked ? undefined : t("shell.kit.slideHint")}
      accessibilityState={{ disabled: locked, busy }}
      accessibilityActions={[{ name: "activate", label: t("shell.kit.slideActivate") }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate") review();
      }}
      onLayout={(event) => {
        width.value = Math.max(0, event.nativeEvent.layout.width - THUMB - INSET * 2);
      }}
      style={[styles.rail, { backgroundColor: locked ? color.raised2 : filled ? solid : wash }]}
    >
      {locked ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            left ? { left: undefined, right: 0 } : null,
            { backgroundColor: filled ? solid : washStrong },
            fillStyle,
          ]}
        />
      )}
      <Animated.View
        pointerEvents="none"
        style={[styles.label, left ? { paddingLeft: SPACE.md, paddingRight: THUMB + SPACE.sm } : null, labelStyle]}
      >
        <Text
          maxFontSizeMultiplier={CONTROL_FONT_SCALE}
          numberOfLines={1}
          style={[TYPE.buttonLabel, { color: locked ? color.text3 : filled ? onSolid : color.ink }]}
        >
          {label}
        </Text>
      </Animated.View>
      {reader ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={review}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: locked }}
          disabled={locked}
        />
      ) : (
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.thumb,
              left ? { left: undefined, right: INSET } : null,
              { backgroundColor: locked ? color.muted : filled ? color.raised2 : solid },
              thumbStyle,
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {busy ? (
              <ActivityIndicator color={color.text2} />
            ) : (
              <Svg width={SIZE.icon} height={SIZE.icon} viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}>
                <AnimatedPath
                  animatedProps={glyphProps}
                  fill="none"
                  stroke={locked ? color.text3 : filled ? color.ink : onSolid}
                  strokeWidth={GLYPH_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { height: RAIL_HEIGHT, borderRadius: BUTTON.radius.md, justifyContent: "center", overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: BUTTON.radius.md },
  thumb: {
    position: "absolute",
    left: INSET,
    top: INSET,
    width: THUMB,
    height: THUMB,
    borderRadius: BUTTON.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { alignItems: "center", paddingLeft: THUMB + SPACE.sm, paddingRight: SPACE.md },
});
