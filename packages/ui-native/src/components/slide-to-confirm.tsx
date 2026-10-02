// Native twin of 21st.dev starc007/slide-action-button (plan §C, 29304), with Senryo's ticket behaviour: drag the
// thumb along a 56pt rail; it commits only past 90% of the travel, short of that it springs back and nothing
// happens. The fill follows the thumb and the label fades as it travels; the arrow becomes a check only once the
// caller reports the outcome.
//
// Like HoldToConfirm, completing the slide is the person's decision, not the operation's success. A controlled
// caller passes `done`: after the slide the face shows the pending words until the parent reports success. Any
// change of what is being confirmed (market, side, amount, leverage, quote freshness, the app going to the
// background) must change `resetKey`, which returns the thumb to the start (R5).
//
// Screen readers: the control is one adjustable-free button whose double tap confirms (a deliberate gesture
// already), with the action named in its label and hint. Haptics stay in the app: `onHaptic` is called when the
// thumb crosses the commit point (arm), on commit, and when an armed slide is released short (cancel).
// Reading direction: in Arabic and Urdu the thumb starts at the right and travels left (`rtl`).
import { SLIDE } from "@kawase/config";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { ArrowLeft, ArrowRight, Check } from "lucide-react-native";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const BOTH_SIDES = 2;

export type SlideHaptic = "arm" | "commit" | "cancel";

type SlideToConfirmProps = {
  /** The action, e.g. "Slide to open Long". */
  children: string;
  onConfirm: () => void;
  /** Shown after the slide while the outcome is pending (controlled) or briefly (uncontrolled). */
  pendingLabel?: string;
  /** Controlled outcome: `true` shows the check and `doneLabel`. */
  done?: boolean;
  doneLabel?: string;
  /** Change it on any change of what is confirmed; the thumb returns to the start. */
  resetKey?: string | number;
  disabled?: boolean;
  /** The spoken hint, in the person's language. */
  hint?: string;
  /** "long"/"buy" fills mint, "short"/"sell" fills red, "primary" fills lime. */
  tone?: "primary" | "long" | "short";
  rtl?: boolean;
  onHaptic?: (kind: SlideHaptic) => void;
  className?: string;
};

const FILL: Record<NonNullable<SlideToConfirmProps["tone"]>, string> = {
  primary: "bg-primary",
  long: "bg-success",
  short: "bg-destructive",
};
const ON_FILL: Record<NonNullable<SlideToConfirmProps["tone"]>, string> = {
  primary: "text-primary-foreground",
  long: "text-background",
  short: "text-destructive-foreground",
};

function SlideToConfirm({
  children,
  onConfirm,
  pendingLabel,
  done,
  doneLabel,
  resetKey,
  disabled = false,
  hint,
  tone = "primary",
  rtl = false,
  onHaptic,
  className,
}: SlideToConfirmProps) {
  const reduce = useReducedMotion();
  const controlled = done !== undefined;
  const [width, setWidth] = React.useState(0);
  const [committed, setCommitted] = React.useState(false);
  const travel = Math.max(width - SLIDE.thumbPt - SLIDE.insetPt * BOTH_SIDES, 1);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const locked = useSharedValue(false);
  const sign = rtl ? -1 : 1;

  const settle = React.useCallback(
    (target: number) => {
      "worklet";
      x.value = reduce ? withTiming(target, { duration: SLIDE.reducedMotionMs, reduceMotion: ReduceMotion.Never }) : withSpring(target, SLIDE.spring);
    },
    [reduce, x],
  );

  const commit = React.useCallback(() => {
    setCommitted(true);
    onHaptic?.("commit");
    onConfirm();
  }, [onConfirm, onHaptic]);
  const haptic = React.useCallback((kind: SlideHaptic) => onHaptic?.(kind), [onHaptic]);

  // A new key: whatever was confirmed has changed (or failed), so the thumb goes back and the slide is usable again.
  const firstKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (resetKey === firstKey.current) return;
    firstKey.current = resetKey;
    locked.value = false;
    armed.value = false;
    settle(0);
    setCommitted(false);
  }, [resetKey, locked, armed, settle]);

  // Uncontrolled: the committed face shows for a moment, then the control resets on its own.
  React.useEffect(() => {
    if (controlled || !committed) return;
    const back = setTimeout(() => {
      locked.value = false;
      settle(0);
      setCommitted(false);
    }, SLIDE.uncontrolledResetMs);
    return () => clearTimeout(back);
  }, [controlled, committed, locked, settle]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !committed)
    .onBegin(() => {
      start.value = x.value;
    })
    .onUpdate((event) => {
      if (locked.value) return;
      const next = Math.min(travel, Math.max(0, start.value + event.translationX * sign));
      x.value = next;
      const past = next >= travel * SLIDE.commitAt;
      if (past !== armed.value) {
        armed.value = past;
        if (past) scheduleOnRN(haptic, "arm");
      }
    })
    .onEnd(() => {
      if (locked.value) return;
      if (x.value >= travel * SLIDE.commitAt) {
        locked.value = true;
        settle(travel);
        scheduleOnRN(commit);
      } else {
        if (armed.value) scheduleOnRN(haptic, "cancel");
        armed.value = false;
        settle(0);
      }
    });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * sign }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value + SLIDE.thumbPt + SLIDE.insetPt }));
  const label = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - x.value / (travel * SLIDE.labelFadeAt)) }));

  const showCheck = committed && (!controlled || done === true);
  const committedLabel = showCheck && controlled ? (doneLabel ?? pendingLabel ?? children) : (pendingLabel ?? children);
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  return (
    <View
      accessible
      role="button"
      accessibilityLabel={committed ? committedLabel : children}
      accessibilityHint={hint ?? "Double tap to confirm. Sliding stops short of the end cancels."}
      accessibilityState={{ disabled: disabled || committed, busy: committed && controlled && !done }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName !== "activate" || disabled || committed) return;
        locked.value = true;
        x.value = travel;
        commit();
      }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: SLIDE.railPt }}
      className={cn("bg-secondary border-border overflow-hidden rounded-full border", disabled && !committed && "opacity-50", className)}
    >
      <Animated.View pointerEvents="none" style={fill} className={cn("absolute inset-y-0 start-0 rounded-full", FILL[tone])} />
      <Animated.View pointerEvents="none" style={committed ? undefined : label} className="absolute inset-0 items-center justify-center ps-12">
        {committed ? null : <Text className="text-secondary-foreground text-base font-semibold">{children}</Text>}
      </Animated.View>
      {committed ? (
        <View pointerEvents="none" className="absolute inset-0 flex-row items-center justify-center gap-1.5 pe-12">
          {showCheck ? <Icon as={Check} className={cn("size-4", ON_FILL[tone])} /> : null}
          <Text className={cn("text-base font-semibold", ON_FILL[tone])}>{committedLabel}</Text>
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[thumb, { width: SLIDE.thumbPt, height: SLIDE.thumbPt, top: SLIDE.insetPt, marginStart: SLIDE.insetPt }]}
          className={cn("absolute start-0 items-center justify-center rounded-full", committed ? "bg-background" : FILL[tone])}
        >
          <Icon as={showCheck ? Check : Arrow} className={cn("size-5", committed ? "text-foreground" : ON_FILL[tone])} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export { SlideToConfirm };
export type { SlideToConfirmProps };
