// The card base every agent result sits on (revamp Phase A: "the ~40 cards inherit the material"): an ink card with
// a hairline, an eyebrow row (what it is · which network), the content, and an optional action row. While a tool is
// still working it is a compact live step chip instead ("Checking your wallet…") with a pulsing dot; the
// conversation's layout transition turns the chip into the card when the result arrives (plan §1.2).
import * as React from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

export function AgentCard({
  eyebrow,
  children,
  className,
}: {
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn("bg-card border-border gap-3 rounded-[26px] border p-4", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      {children}
    </View>
  );
}

const DOT_SIZE = 8;
const DOT_DIM = 0.35;
/** The dot breathes between these scales as it pulses. */
const DOT_SCALE_MIN = 0.8;
const DOT_SCALE_RANGE = 0.2;
const HALF = 2;

/** While a tool runs: a live step chip naming what it's doing. */
export function AgentCardLoading({ label }: { label: string }) {
  const reduced = useReducedMotionLive();
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (reduced) return undefined;
    pulse.value = withRepeat(
      withTiming(DOT_DIM, { duration: MOTION.sendingCycleMs / HALF, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: DOT_SCALE_MIN + pulse.value * DOT_SCALE_RANGE }] }));
  return (
    <View className="bg-card border-border flex-row items-center gap-2.5 self-start rounded-full border py-2 pe-4 ps-3">
      <Animated.View style={[dot, { width: DOT_SIZE, height: DOT_SIZE }]} className="bg-ring rounded-full" />
      <Text accessibilityLiveRegion="polite" className={cn("text-foreground text-sm font-medium", TEXT_START)}>
        {label}
      </Text>
    </View>
  );
}
