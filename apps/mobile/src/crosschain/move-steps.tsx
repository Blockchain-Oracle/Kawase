// A move's four steps under its plate: Signed → Sent from Arc → Filling on Base → Delivered. The kit's TxSteps grammar
// (21st.dev ddoemonn/task-steps #23569 and sean0205/c-stepper-15 #29815): a step is a mark and a word, never colour
// alone; done is a check, the active step pulses, pending is a hollow ring; the line between two done steps is the up
// colour. Vertical, because a move's step names carry chain names. TxSteps has three fixed steps, so this is its
// four-step sibling drawn from the same tokens. The live region says each new step once.
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import type { CrossChainIntent } from "@kawase/api-client";

import { announce, Icon, SKELETON, SPACE, TYPE, useTheme } from "@/components/kit";
import { Check, X } from "@/components/kit/icons";
import { useT } from "@/i18n";

const MARK = 16;
const DOT = 6;
const HALF = 2;
const LINE = 12;
const STEPS = ["stepSigned", "stepSent", "stepFilling", "stepDelivered"] as const;
const SENT = 1;
const FILLING = 2;
const DELIVERED = 3;

type Status = "done" | "active" | "pending" | "broken";

/** How far the move got: 0 signing, 1 sent from Arc, 2 filling there, 3 delivered; -1 before the yes. */
export function moveReached(intent: CrossChainIntent, signing: boolean): number {
  if (intent.stage === "delivered") return DELIVERED;
  if (intent.stage === "filling") return FILLING;
  if (intent.stage === "submitted" || intent.state === "approved" || intent.state === "executing") return SENT;
  if (intent.stage === "refunded" || intent.stage === "failed") return intent.tx ? FILLING : SENT;
  return signing ? 0 : -1;
}

export function MoveSteps({ intent, signing }: { intent: CrossChainIntent; signing: boolean }) {
  const { t } = useT();
  const { color } = useTheme();
  const reached = moveReached(intent, signing);
  const failed = intent.stage === "refunded" || intent.stage === "failed";
  const names = { source: intent.draft?.source.name ?? "", destination: intent.draft?.destination.name ?? "" };
  const label = (index: number) => t(`move.${STEPS[index]}`, { chain: index === SENT ? names.source : names.destination });
  const said = React.useRef(-1);
  React.useEffect(() => {
    if (reached > said.current && reached >= 0) {
      said.current = reached;
      announce(label(reached));
    }
  });
  if (reached < 0) return null;
  return (
    <View style={styles.list} accessibilityRole="list">
      {STEPS.map((step, index) => {
        const status: Status = failed && index === reached ? "broken" : index < reached || (index === DELIVERED && intent.stage === "delivered") ? "done" : index === reached ? "active" : "pending";
        return (
          <View key={step} style={styles.step}>
            <View style={styles.rail}>
              <StepMark status={status} />
              {index < STEPS.length - 1 ? <View style={[styles.line, { backgroundColor: status === "done" ? color.up : color.skeleton }]} /> : null}
            </View>
            <Text style={[TYPE.rowDetail, { color: status === "pending" ? color.text3 : status === "broken" ? color.destructive : color.ink }]}>{label(index)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StepMark({ status }: { status: Status }) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (status !== "active" || reduce) return;
    pulse.set(withRepeat(withSequence(withTiming(SKELETON.from, { duration: SKELETON.periodMs / HALF }), withTiming(1, { duration: SKELETON.periodMs / HALF })), -1));
  }, [status, reduce, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: status === "active" && !reduce ? pulse.get() : 1 }));
  if (status === "done") {
    return (
      <View style={[styles.mark, { backgroundColor: color.up }]}>
        <Icon icon={Check} size={MARK - DOT} tint={color.onFill} strokeWidth={3} />
      </View>
    );
  }
  if (status === "broken") {
    return (
      <View style={[styles.mark, { backgroundColor: color.destructive }]}>
        <Icon icon={X} size={MARK - DOT} tint={color.destructiveForeground} strokeWidth={3} />
      </View>
    );
  }
  return (
    <Animated.View style={[styles.mark, { borderWidth: HALF, borderColor: status === "active" ? color.ink : color.skeleton }, style]}>
      {status === "active" ? <View style={[styles.dot, { backgroundColor: color.ink }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0, paddingVertical: SPACE.xs },
  step: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm },
  rail: { alignItems: "center" },
  mark: { width: MARK, height: MARK, borderRadius: MARK / HALF, alignItems: "center", justifyContent: "center" },
  dot: { width: DOT, height: DOT, borderRadius: DOT / HALF },
  line: { width: HALF, height: LINE, marginVertical: SPACE.xxs },
});
