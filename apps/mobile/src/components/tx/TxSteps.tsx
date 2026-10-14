/**
 * Signing, Sent, Confirmed under every money CTA (21st.dev ddoemonn/task-steps #23569 in its compact row and
 * sean0205/c-stepper-15 #29815 as the spec): a step is a mark and a word, never a colour alone. Done is a check, the
 * active step pulses, pending is a hollow ring. Mapped from the lifecycle (`txReached`). Quiet for screen readers: the
 * lifecycle already announces itself (`useTxLifecycle`).
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useT } from "@/i18n";

import { Check, Icon } from "../kit/icons";
import { RADIUS, SKELETON, SPACE, TYPE, useTheme } from "../kit/theme";
import { type TxState, txReached } from "./tx-state";

const STEPS = ["signing", "submitted", "confirmed"] as const;
const MARK = 16;
const DOT = 6;
const HALF = 2;

export type StepStatus = "done" | "active" | "pending";

/** The three steps and where each stands for a lifecycle state; null when nothing is in flight. */
export function txSteps(state: TxState): readonly { id: (typeof STEPS)[number]; status: StepStatus }[] | null {
  const at = txReached(state);
  if (at < 0) return null;
  return STEPS.map((id, i) => ({
    id,
    status: i < at || (i === at && id === "confirmed") ? "done" : i === at ? "active" : "pending",
  }));
}

export function TxSteps({ state }: { state: TxState }) {
  const { t } = useT();
  const { color } = useTheme();
  const steps = txSteps(state);
  if (!steps) return null;
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {steps.map((step, index) => (
        <View key={step.id} style={styles.step}>
          {index > 0 ? (
            <View style={[styles.line, { backgroundColor: step.status === "pending" ? color.skeleton : color.up }]} />
          ) : null}
          <StepMark status={step.status} />
          <Text style={[TYPE.meta, { color: step.status === "pending" ? color.text3 : color.ink }]}>
            {t(`shell.tx.steps.${step.id}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StepMark({ status }: { status: StepStatus }) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (status !== "active" || reduce) return;
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(SKELETON.from, { duration: SKELETON.periodMs / HALF }),
          withTiming(1, { duration: SKELETON.periodMs / HALF }),
        ),
        -1,
      ),
    );
  }, [status, reduce, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: status === "active" && !reduce ? pulse.get() : 1 }));
  if (status === "done") {
    return (
      <View style={[styles.mark, { backgroundColor: color.up }]}>
        <Icon icon={Check} size={11} tint={color.upForeground} strokeWidth={3} />
      </View>
    );
  }
  return (
    <Animated.View
      style={[styles.mark, { borderWidth: 1.5, borderColor: status === "active" ? color.ink : color.skeleton }, style]}
    >
      {status === "active" ? <View style={[styles.dot, { backgroundColor: color.ink }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.sm },
  step: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  line: { width: SPACE.lg, height: 2, borderRadius: 1, marginEnd: SPACE.xs },
  mark: { width: MARK, height: MARK, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.pill },
});
