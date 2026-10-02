// The centred graduated leverage ruler, ported from Senryo's LeverageRuler (plan §B/§C; Fomo F33–F36): a strip of
// multiples between fine top and bottom rails, the selected multiple centred and lit, the rest fading toward the
// edges. Never a plain slider. The strip follows the finger on the UI thread, calls `onTick` once per step (the app
// plays the haptic, so this package stays free of app imports), and on release snaps to the nearest multiple on
// the ruler spring, clamped to 1…`max` (the cap the caller computes, e.g. from the market's collateral factor and
// the opening health floor). Tapping a multiple jumps to it. Reduce Motion: no spring, a short move. Screen
// readers: adjustable, ± one step. In Arabic and Urdu higher multiples run to the left (`rtl`).
import { RULER } from "@kawase/config";
import { tokens } from "@kawase/ui-tokens";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const MIN = 1;
const HAIRLINE = 1;
const TICK_WIDTH = 2;
const ONE_DECIMAL = 10;
const HALF = 2;
const BOTH_RAILS = 2;

type LeverageRulerProps = {
  value: number;
  /** The highest multiple allowed; the ruler never offers more. */
  max: number;
  onChange: (next: number) => void;
  /** Distance between multiples (1 by default; 0.5 when caps are low). */
  step?: number;
  /** Called on each step crossed ("tick") and on reaching either end ("snap"). */
  onTick?: (kind: "tick" | "snap") => void;
  /** How a multiple is written ("3×"); localised by the caller. */
  format?: (multiple: number) => string;
  /** The caption under the ruler and the screen-reader name ("Leverage"). */
  label: string;
  /** The active theme (its primary, muted and border tokens colour the strip). */
  scheme?: keyof typeof tokens.themes;
  rtl?: boolean;
  disabled?: boolean;
  className?: string;
};

const round = (value: number) => Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;

function LeverageRuler({ value, max, onChange, step = 1, onTick, format = (multiple) => `${multiple}×`, label, scheme = "dark", rtl = false, disabled = false, className }: LeverageRulerProps) {
  const reduce = useReducedMotion();
  const theme = tokens.themes[scheme];
  const [width, setWidth] = React.useState(0);
  const count = Math.max(0, Math.floor(round((Math.max(max, MIN) - MIN) / step)));
  const steps = React.useMemo(() => Array.from({ length: count + 1 }, (_, index) => round(MIN + index * step)), [count, step]);
  const top = steps[steps.length - 1] ?? MIN;
  const indexOf = (multiple: number) => Math.round((Math.min(Math.max(multiple, MIN), top) - MIN) / step);
  const limit = -count * RULER.stepPt;
  const sign = rtl ? -1 : 1;
  // Offset 0 centres 1×; each step moves the strip one step toward the start.
  const offset = useSharedValue(-indexOf(value) * RULER.stepPt);
  const start = useSharedValue(0);
  const last = useSharedValue(indexOf(value));
  const dragging = useSharedValue(false);

  React.useEffect(() => {
    if (dragging.value) return;
    const index = indexOf(value);
    last.value = index;
    const target = -index * RULER.stepPt;
    offset.value = reduce
      ? withTiming(target, { duration: RULER.reducedMotionMs, reduceMotion: ReduceMotion.Never })
      : withSpring(target, RULER.snap);
    // indexOf depends only on top and step, which `steps` covers.
  }, [value, steps, reduce]);

  const commit = React.useCallback(
    (index: number) => {
      onTick?.(index === 0 || index === count ? "snap" : "tick");
      onChange(steps[index] ?? MIN);
    },
    [count, onChange, onTick, steps],
  );

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-RULER.activatePt, RULER.activatePt])
    .failOffsetY([-RULER.failVerticalPt, RULER.failVerticalPt])
    .onBegin(() => {
      dragging.value = true;
      start.value = offset.value;
    })
    .onUpdate((event) => {
      const next = Math.min(0, Math.max(limit, start.value + event.translationX * sign));
      offset.value = next;
      const index = Math.round(-next / RULER.stepPt);
      if (index !== last.value) {
        last.value = index;
        scheduleOnRN(commit, index);
      }
    })
    .onEnd((event) => {
      const projected = Math.min(0, Math.max(limit, offset.value + event.velocityX * sign * RULER.flingSec));
      const index = Math.round(-projected / RULER.stepPt);
      if (index !== last.value) {
        last.value = index;
        scheduleOnRN(commit, index);
      }
      const target = -index * RULER.stepPt;
      offset.value = reduce ? withTiming(target, { duration: RULER.reducedMotionMs, reduceMotion: ReduceMotion.Never }) : withSpring(target, RULER.snap);
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  // Laid out left to right in both directions: ascending in LTR, descending in RTL, so higher multiples sit on the
  // reading-forward side; the selected one is centred either way.
  const centreOffset = width / HALF - RULER.stepPt / HALF;
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: rtl ? centreOffset + limit - offset.value : centreOffset + offset.value }] }));
  const current = indexOf(value);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: MIN, max: top, now: value, text: format(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        const next = event.nativeEvent.actionName === "increment" ? Math.min(current + 1, count) : Math.max(current - 1, 0);
        if (next !== current) commit(next);
      }}
      className={cn("gap-1", disabled && "opacity-50", className)}
    >
      <GestureDetector gesture={pan}>
        <View
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          style={{ height: RULER.stepPt + BOTH_RAILS * RULER.tickPt }}
          className="justify-center overflow-hidden"
        >
          <View style={{ height: HAIRLINE, backgroundColor: theme.border }} className="absolute inset-x-0 top-0" />
          <View style={{ height: HAIRLINE, backgroundColor: theme.border }} className="absolute inset-x-0 bottom-0" />
          <Animated.View style={[strip, { direction: "ltr", flexDirection: "row", left: 0, width: steps.length * RULER.stepPt }]} className="absolute inset-y-0">
            {(rtl ? [...steps].reverse() : steps).map((multiple) => (
              <Multiple
                key={multiple}
                index={indexOf(multiple)}
                text={format(multiple)}
                offset={offset}
                colors={{ on: theme.primary, off: theme["muted-foreground"], tick: theme.border }}
                onPress={() => !disabled && indexOf(multiple) !== current && commit(indexOf(multiple))}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
      <Text className="text-muted-foreground text-center text-xs">{label}</Text>
    </View>
  );
}

/** One multiple: its ticks on both rails and its label, faded by distance from the centre, lit when centred. */
function Multiple({ index, text, offset, colors, onPress }: { index: number; text: string; offset: SharedValue<number>; colors: { on: string; off: string; tick: string }; onPress: () => void }) {
  const centre = -index * RULER.stepPt;
  const fade = useAnimatedStyle(() => {
    const away = Math.abs(offset.value - centre) / RULER.stepPt;
    return { opacity: Math.max(RULER.minOpacity, 1 - away / RULER.fadeSteps) };
  });
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(Math.min(1, Math.abs(offset.value - centre) / RULER.stepPt), [0, 1], [colors.on, colors.off]) }));
  const tick = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(Math.min(1, Math.abs(offset.value - centre) / RULER.stepPt), [0, 1], [colors.on, colors.tick]) }));
  return (
    <Animated.View style={[fade, { width: RULER.stepPt }]} className="items-center justify-center">
      <Animated.View style={[tick, { width: TICK_WIDTH, height: RULER.tickPt }]} className="absolute top-0" />
      <Pressable onPress={onPress} accessibilityElementsHidden importantForAccessibility="no" hitSlop={RULER.tickPt} className="min-h-11 justify-center px-0.5">
        <Animated.Text style={ink} className="font-display text-base font-bold">
          {text}
        </Animated.Text>
      </Pressable>
      <Animated.View style={[tick, { width: TICK_WIDTH, height: RULER.tickPt }]} className="absolute bottom-0" />
    </Animated.View>
  );
}

export { LeverageRuler };
export type { LeverageRulerProps };
