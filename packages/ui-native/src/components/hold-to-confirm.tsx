// Native twin of ui-web's hold-to-confirm (21st.dev ddoemonn/hold-to-confirm): press and hold while a fill
// sweeps across; the callback fires only after the full hold, and releasing early cancels.
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
  confirmLabel?: string;
  /** How long the hold takes, in milliseconds. */
  duration?: number;
  /** How long the confirmed state shows before the button resets; 0 keeps it. */
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
  duration = 1800,
  resetAfter = 1600,
  releaseRate = 2.5,
  disabled = false,
  className,
}: HoldToConfirmProps) {
  const [committed, setCommitted] = React.useState(false);
  const [width, setWidth] = React.useState(0);
  const progress = useSharedValue(0);
  const seconds = Math.round(duration / MS_PER_TENTH) / TENTHS_PER_SECOND;

  const commit = React.useCallback(() => {
    setCommitted(true);
    onConfirm();
  }, [onConfirm]);

  React.useEffect(() => {
    if (!committed || resetAfter <= 0) return;
    const back = setTimeout(() => {
      progress.value = 0;
      setCommitted(false);
    }, resetAfter);
    return () => clearTimeout(back);
  }, [committed, resetAfter, progress]);

  // The hold time is the safeguard, so these timings must not be shortened by the reduced-motion setting.
  const begin = () => {
    if (disabled || committed) return;
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
    if (disabled || committed) return;
    if (progress.value > 0 && progress.value < 1) onAbort?.();
    progress.value = withTiming(0, {
      duration: (duration * progress.value) / releaseRate,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
  };

  const sweep = useAnimatedStyle(() => ({ width: progress.value * width }));

  const face = (textClassName: string) =>
    committed ? (
      <View className="flex-row items-center justify-center gap-1.5">
        <Icon as={Check} className={cn("size-4", textClassName)} />
        <Text className={cn("text-base font-semibold", textClassName)}>{confirmLabel}</Text>
      </View>
    ) : (
      <Text className={cn("text-base font-semibold", textClassName)}>{children}</Text>
    );

  return (
    <Pressable
      role="button"
      accessibilityLabel={committed ? confirmLabel : children}
      accessibilityHint={`Press and hold for ${seconds} seconds to confirm. Releasing early cancels and nothing happens.`}
      accessibilityState={{ disabled: disabled || committed }}
      // Screen-reader users activate with a double tap, which is already a deliberate gesture.
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "activate" && !disabled && !committed) {
          progress.value = 1;
          commit();
        }
      }}
      onPressIn={begin}
      onPressOut={release}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className={cn(
        "border-border bg-secondary h-14 items-center justify-center overflow-hidden rounded-full border",
        disabled && "opacity-50",
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
