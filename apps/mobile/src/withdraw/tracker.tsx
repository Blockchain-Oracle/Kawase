// A withdrawal's moves as a vertical timeline on the kit (21st.dev shadcnui-blocks "Process Timeline" 28381 as the
// spec, drawn with the kit's tokens like TxSteps): each step's mark (done, failed, the active one with a named wait,
// pending), its title and the one line under it, a link to the explorer once it has a transaction, and the line
// between marks filling in the up colour as steps finish. A screen reader hears each step's title and state in words.
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, RADIUS, SIZE, SPACE, TYPE, useTheme, WaitingText } from "@/components/kit";
import { ArrowUpRight, Check, X } from "@/components/kit/icons";
import { useT } from "@/i18n";

export type TrackStep = {
  id: string;
  title: string;
  description?: string | undefined;
  state: "pending" | "active" | "done" | "failed";
  explorerUrl?: string | null | undefined;
};

const DISC = 28;
const LINE = 2;
const HALF = 2;

function Mark({ state }: { state: TrackStep["state"] }) {
  const { color } = useTheme();
  const fill = state === "done" ? color.up : state === "failed" ? color.down : state === "active" ? color.ink : color.raised2;
  const ink = state === "pending" ? color.text3 : color.ground;
  return (
    <View style={[styles.disc, { backgroundColor: fill }]}>
      {state === "done" ? <Icon icon={Check} size={SIZE.iconSm} tint={ink} /> : state === "failed" ? <Icon icon={X} size={SIZE.iconSm} tint={ink} /> : <View style={[styles.dot, { backgroundColor: ink }]} />}
    </View>
  );
}

export function WithdrawTracker({ steps, onOpen }: { steps: readonly TrackStep[]; onOpen: (url: string) => void }) {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <View accessibilityRole="list" style={styles.list}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <View key={step.id} accessible accessibilityLabel={`${step.title}, ${t(`desktop.step_${step.state}`)}`} style={styles.row}>
            <View style={styles.rail}>
              <Mark state={step.state} />
              {!last ? <View style={[styles.line, { backgroundColor: step.state === "done" ? color.up : color.skeleton }]} /> : null}
            </View>
            <View style={[styles.copy, !last ? styles.gap : null]}>
              <View style={styles.head}>
                <Text style={[TYPE.rowStrong, styles.grow, { color: step.state === "pending" ? color.text3 : color.ink }]}>{step.title}</Text>
                {step.explorerUrl ? (
                  <Pressable accessibilityRole="link" accessibilityLabel={t("withdraw.viewTx")} hitSlop={SPACE.sm} onPress={() => onOpen(step.explorerUrl!)}>
                    <Icon icon={ArrowUpRight} size={SIZE.iconSm} tint={color.text2} />
                  </Pressable>
                ) : null}
              </View>
              {step.state === "active" && !step.description ? <WaitingText>{t("desktop.step_active")}</WaitingText> : null}
              {step.description ? <Text style={[TYPE.rowDetail, { color: step.state === "failed" ? color.down : color.text2 }]}>{step.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  row: { flexDirection: "row", gap: SPACE.md },
  rail: { alignItems: "center", width: DISC },
  disc: { width: DISC, height: DISC, borderRadius: DISC / HALF, alignItems: "center", justifyContent: "center" },
  dot: { width: SIZE.dot, height: SIZE.dot, borderRadius: RADIUS.pill },
  line: { width: LINE, flex: 1, minHeight: SPACE.lg },
  copy: { flex: 1, minWidth: 0, gap: SPACE.xxs, paddingTop: SPACE.xxs },
  gap: { paddingBottom: SPACE.lg },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  grow: { flex: 1, minWidth: 0 },
});
