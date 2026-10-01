// Native twin of ui-web's hold-to-confirm (21st.dev ddoemonn/hold-to-confirm): press and hold while a fill
// sweeps across; the callback fires only after the full hold, and releasing early cancels.
//
// Completing the hold is the person's deliberate decision, not the operation's success (Codex review R05). A
// controlled caller passes `done`: after the hold the control shows the pending words with no check mark until
// the parent reports success; a failure is reported by changing `resetKey`, which returns the control to a usable
// idle state. Without `done` the control keeps its original self-resetting behaviour (the gallery).
//
// The fill is a clip whose width follows the hold. A transform would avoid layout, but transforms are not mirrored
// by the per-tree reading direction, while `start-0` is; the clip stays correct in Arabic and Urdu.
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Check } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// For the spoken hint: the hold time in seconds, to one decimal.
const MS_PER_TENTH = 100;
const TENTHS_PER_SECOND = 10;

type HoldToConfirmProps = {
  onConfirm: () => void;
  /** The label. */
  children: string;
  onAbort?: () => void;
  /** Shown once the hold is complete: with a check when uncontrolled; as the pending words when `done` is given. */
  confirmLabel?: string;
  /** Controlled outcome. `true` shows the check and `doneLabel`; `false` keeps the pending words after the hold. */
  done?: boolean;
  /** Shown with the check when `done` is true; defaults to `confirmLabel`. */
  doneLabel?: string;
  /** Changing it returns a held control to idle, so a failed operation can be held again. */
  resetKey?: string | number;
  /** The spoken hint, in the person's language (an English sentence when not given). */
  hint?: string;
  /** How long the hold takes, in milliseconds. */
  duration?: number;
  /** Uncontrolled only: how long the confirmed state shows before the button resets; 0 keeps it. */
  resetAfter?: number;
  /** How much faster than the hold the fill drains on release. */
  releaseRate?: number;
  disabled?: boolean;
  className?: string;
};

function HoldToConfirm({
  onConfirm,
  children,
  onAbort,
  confirmLabel = "Confirmed",
  done,
  doneLabel,
  resetKey,
  hint,
  duration = 1800,
  resetAfter = 1600,
  releaseRate = 2.5,
  disabled = false,
  className,
}: HoldToConfirmProps) {
  const controlled = done !== undefined;
  const [held, setHeld] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const progress = useSharedValue(0);
  const seconds = Math.round(duration / MS_PER_TENTH) / TENTHS_PER_SECOND;

  const commit = React.useCallback(() => {
    setHeld(true);
    onConfirm();
  }, [onConfirm]);

  // Uncontrolled: the confirmed face shows for a moment, then the control resets on its own.
  React.useEffect(() => {
    if (controlled || !held || resetAfter <= 0) return;
    const back = setTimeout(() => {
      progress.value = 0;
      setHeld(false);
    }, resetAfter);
    return () => clearTimeout(back);
  }, [controlled, held, resetAfter, progress]);

  // Controlled: a new reset key means the operation failed; the control can be held again.
  const firstKey = React.useRef(resetKey);
  React.useEffect(() => {
    if (resetKey === firstKey.current) return;
    firstKey.current = resetKey;
    progress.value = 0;
    setHeld(false);
  }, [resetKey, progress]);

  // The hold time is the safeguard, so these timings must not be shortened by the reduced-motion setting.
  const begin = () => {
    if (disabled || held) return;
    progress.value = withTiming(
      1,
      { duration: duration * (1 - progress.value), easing: Easing.linear, reduceMotion: ReduceMotion.Never },
      (finished) => {
        "worklet";
        if (finished) scheduleOnRN(commit);
      },
    );
  };

  const release = () => {
    if (disabled || held) return;
    if (progress.value > 0 && progress.value < 1) onAbort?.();
    progress.value = withTiming(0, {
      duration: (duration * progress.value) / releaseRate,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
  };

  const sweep = useAnimatedStyle(() => ({ width: progress.value * width }));

  // What the face says: the action; then, after the hold, either the pending words (controlled, not done yet) or
  // the check with the confirmed words. A check never appears before the outcome is known.
  const pending = held && controlled && !done;
  const showCheck = held && (!controlled || done === true);
  const heldLabel = showCheck && controlled ? (doneLabel ?? confirmLabel) : confirmLabel;
  const label = held ? heldLabel : children;

  const face = (textClassName: string) =>
    showCheck ? (
      <View className="flex-row items-center justify-center gap-1.5">
        <Icon as={Check} className={cn("size-4", textClassName)} />
        <Text className={cn("text-base font-semibold", textClassName)}>{label}</Text>
      </View>
    ) : (
      <Text className={cn("text-base font-semibold", textClassName)}>{label}</Text>
    );

  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityHint={hint ?? `Press and hold for ${seconds} seconds to confirm. Releasing early cancels and nothing happens.`}
      accessibilityState={{ disabled: disabled || held, busy: pending }}
      // Screen-reader users activate with a double tap, which is already a deliberate gesture.
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate" && !disabled && !held) {
          progress.value = 1;
          commit();
        }
      }}
      onPressIn={begin}
      onPressOut={release}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className={cn(
        "border-border bg-secondary h-14 items-center justify-center overflow-hidden rounded-full border",
        disabled && !held && "opacity-50",
        className,
      )}
    >
      {face("text-secondary-foreground")}
      <Animated.View pointerEvents="none" style={sweep} className="absolute inset-y-0 start-0 overflow-hidden">
        <View style={{ width }} className="bg-network absolute inset-y-0 start-0 items-center justify-center">
          {face("text-network-foreground")}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export { HoldToConfirm };
export type { HoldToConfirmProps };
