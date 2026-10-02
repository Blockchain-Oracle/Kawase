// Signal Bars Loader's native twin (21st.dev 24461 · elements-, its "equalizer" variant at size sm): thin bars that
// pulse between 30% and full height, each on its own period and a tenth of a second behind the one before, so
// together they read as a voice speaking. The source's CSS keyframes become a Reanimated loop on the UI thread.
// `level` (0–1) scales the pulse, so a caller can bring the bars up and down without a React render; with Reduce
// Motion the bars stand still.
import { SIGNAL_BARS } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import * as React from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const HALF = 0.5;
/** withRepeat's "forever". */
const FOREVER = -1;

function Bar({ slot, color, level, still }: { slot: number; color: string; level: SharedValue<number>; still: boolean }) {
  const phase = useSharedValue(0);
  React.useEffect(() => {
    if (still) {
      cancelAnimation(phase);
      phase.value = HALF;
      return undefined;
    }
    const period = SIGNAL_BARS.periodsMs[slot % SIGNAL_BARS.periodsMs.length] ?? SIGNAL_BARS.periodsMs[0];
    phase.value = 0;
    // The source's keyframe runs 0.3 → 1 → 0.3 over one period: half a period up, reversed back down.
    phase.value = withDelay(
      slot * SIGNAL_BARS.staggerMs,
      withRepeat(withTiming(1, { duration: period * HALF, easing: Easing.inOut(Easing.ease) }), FOREVER, true),
    );
    return () => cancelAnimation(phase);
  }, [slot, still, phase]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: SIGNAL_BARS.restScale + (1 - SIGNAL_BARS.restScale) * phase.value * level.value }],
  }));
  return (
    <Animated.View
      style={[
        {
          width: SIGNAL_BARS.widthPt,
          height: SIGNAL_BARS.heightPt,
          borderRadius: SIGNAL_BARS.widthPt * HALF,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function SignalBars({
  color,
  level,
  bars = SIGNAL_BARS.count,
}: {
  color: string;
  /** 0 → bars rest low; 1 → full pulse. */
  level: SharedValue<number>;
  bars?: number;
}) {
  const reduced = useReducedMotionLive();
  return (
    <View
      className="flex-row items-center"
      style={{ gap: SIGNAL_BARS.gapPt, height: SIGNAL_BARS.heightPt }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: bars }, (_, slot) => (
        <Bar key={slot} slot={slot} color={color} level={level} still={reduced} />
      ))}
    </View>
  );
}

export { SignalBars };
