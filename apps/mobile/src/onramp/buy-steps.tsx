// A purchase's steps: Paying · Buying · On Arc, with "Moving to Arc" between for a Coinbase delivery on Base (its CCTP
// leg is part of the same run). The visual grammar of the kit's TxSteps (21st.dev ddoemonn/task-steps #23569 compact row,
// sean0205/c-stepper-15 #29815 as the spec): a step is a mark and a word, never a colour alone. Done is a filled check,
// the running step pulses, the next ones are hollow rings, a failed one is a cross in the failure colour. The line into
// a step fills when it is reached. Reduced motion: no pulse, instant fills.
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import type { OnrampOrderView } from "@kawase/api-client";

import { Check, Icon, X } from "@/components/kit/icons";
import { RADIUS, SKELETON, SPACE, TIMING, TYPE, useTheme } from "@/components/kit/theme";
import { useT } from "@/i18n";

import { railSteps, type RailStep } from "./order-events";

const MARK = 18;
const DOT = 6;
const HALF = 2;
const GLYPH = 11;
const GLYPH_STROKE = 3;
const RING = 1.5;
const LINE = 2;

export function BuySteps({ order }: { order: Pick<OnrampOrderView, "engine" | "status" | "stage"> }) {
  const { t } = useT();
  const steps = railSteps(order);
  const label = steps.map((step) => `${t(`buy.rail_${step.id}`)}: ${t(`buy.step_${step.state}`)}`).join(", ");
  return (
    <View style={styles.row} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      {steps.map((step, index) => (
        <View key={step.id} style={styles.step}>
          {index > 0 ? <Line reached={step.state !== "pending"} /> : null}
          <StepMark state={step.state} />
          <StepWord state={step.state}>{t(`buy.rail_${step.id}`)}</StepWord>
        </View>
      ))}
    </View>
  );
}

function StepWord({ state, children }: { state: RailStep["state"]; children: string }) {
  const { color } = useTheme();
  const tint = state === "failed" ? color.destructive : state === "pending" ? color.text3 : color.ink;
  return (
    <Text numberOfLines={1} style={[TYPE.meta, { color: tint }]}>
      {children}
    </Text>
  );
}

function Line({ reached }: { reached: boolean }) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const fill = useSharedValue(reached ? 1 : 0);
  React.useEffect(() => {
    fill.set(reduce ? (reached ? 1 : 0) : withTiming(reached ? 1 : 0, { duration: TIMING.numberChange }));
  }, [reached, reduce, fill]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  return (
    <View style={[styles.line, { backgroundColor: color.skeleton }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.lineFill, { backgroundColor: color.up }, style]} />
    </View>
  );
}

function StepMark({ state }: { state: RailStep["state"] }) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (state !== "active" || reduce) {
      pulse.set(1);
      return;
    }
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(SKELETON.from, { duration: SKELETON.periodMs / HALF }),
          withTiming(1, { duration: SKELETON.periodMs / HALF }),
        ),
        -1,
      ),
    );
  }, [state, reduce, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  if (state === "done") {
    return (
      <View style={[styles.mark, { backgroundColor: color.up }]}>
        <Icon icon={Check} size={GLYPH} tint={color.upForeground} strokeWidth={GLYPH_STROKE} />
      </View>
    );
  }
  if (state === "failed") {
    return (
      <View style={[styles.mark, { backgroundColor: color.destructive }]}>
        <Icon icon={X} size={GLYPH} tint={color.destructiveForeground} strokeWidth={GLYPH_STROKE} />
      </View>
    );
  }
  return (
    <Animated.View style={[styles.mark, { borderWidth: RING, borderColor: state === "active" ? color.ink : color.skeleton }, style]}>
      {state === "active" ? <View style={[styles.dot, { backgroundColor: color.ink }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", rowGap: SPACE.sm, columnGap: SPACE.xs },
  step: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  line: { width: SPACE.lg, height: LINE, borderRadius: RADIUS.pill, overflow: "hidden", marginEnd: SPACE.xxs },
  lineFill: { transformOrigin: "left" },
  mark: { width: MARK, height: MARK, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.pill },
});
