/**
 * The CTA of every money action, with the full lifecycle (Mitoshi's TxCta on Kawase's plate):
 *  - blocked: BlockedCta. A blocker with a fix IS the action ("Add money", "Set a budget"); the stated face only where none.
 *  - in flight: it never looks disabled. The plate stays at full strength, a phase bar fills its bottom edge (a third
 *    for signing, two thirds for sent, full for confirmed), the face names the phase and a tap is absorbed. Under it
 *    Signing, Sent and Confirmed run (`TxSteps`).
 *  - confirmed: it morphs into its receipt when the host gives one (`TxMorph`), else it reads "Done".
 *  - failed: the face is "Try again" and the caption says whether money moved. The full card is `TxFailureCard`.
 *  - still waiting: "Nothing is re-sent" under the plate; recovery reads the status.
 * One caption line is held in every state, so nothing jumps. The sound and haptic belong to `useTxLifecycle`.
 */
import { type ReactNode, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import { type BlockerFix } from "../kit/diagnosis";
import { Check, Icon } from "../kit/icons";
import { ShimmerText } from "../kit/wait";
import { BUTTON, CONTROL_FONT_SCALE, ELEVATION, SIZE, SPACE, SPRING, TIMING, TYPE, useTheme } from "../kit/theme";
import { usePressScale } from "../kit/usePressScale";
import { BlockedCta, type Blocker } from "./BlockedCta";
import { TxMorph } from "./TxMorph";
import { TxSteps } from "./TxSteps";
import { canConfirm, isInFlight, type TxState, txProgress } from "./tx-state";

const BAR = 3;
const WAITING_OPACITY = 0.85;
const PERCENT = 100;

export type TxCtaProps = {
  state: TxState;
  /** The action's verb phrase: "Swap 2 USDC to EURC", "Send $5 to Ada". */
  action: string;
  onConfirm: () => void;
  /** The magenta plate for a trade or a publish; black otherwise (Senryo: accent only where it matters). */
  tone?: "primary" | "accent";
  /** The blocker's words and fix while `state.kind === "blocked"` (else the reason alone, with no fix). */
  blocker?: Blocker;
  onFix?: (fix: BlockerFix) => void;
  /** Signing, Sent, Confirmed under the plate while in flight (default true). */
  steps?: boolean;
  /** On confirmed, the CTA morphs into this. */
  receipt?: ReactNode;
  /** A caption in the quiet states ("No fees to pay"). */
  caption?: string;
};

export function TxCta({ state, action, onConfirm, tone = "primary", blocker, onFix, steps = true, receipt, caption }: TxCtaProps) {
  const { t } = useT();
  const { color } = useTheme();
  const done = state.kind === "confirmed";
  if (state.kind === "blocked") {
    return <BlockedCta blocker={blocker ?? { label: state.reason }} {...(onFix ? { onFix } : {})} {...(caption ? { caption } : {})} />;
  }
  const cta = (
    <View style={styles.wrap}>
      <Plate state={state} action={action} tone={tone} onConfirm={onConfirm} />
      <View style={styles.caption} accessibilityLiveRegion={state.kind === "failed" ? "polite" : "none"}>
        {state.kind === "failed" ? (
          <Text style={[TYPE.rowDetail, styles.center, { color: color.ink }]}>{t(`shell.tx.moneyMoved.${state.moneyMoved}`)}</Text>
        ) : state.kind === "unknown" ? (
          <Text style={[TYPE.caption, styles.center, { color: color.text2 }]}>{t("shell.tx.notResent")}</Text>
        ) : steps && (isInFlight(state) || done) ? (
          <TxSteps state={state} />
        ) : caption ? (
          <Text style={[TYPE.caption, styles.center, { color: color.text3 }]}>{caption}</Text>
        ) : null}
      </View>
    </View>
  );
  if (receipt === undefined) return cta;
  return (
    <TxMorph morphed={done} receipt={receipt}>
      {cta}
    </TxMorph>
  );
}

function Plate({ state, action, tone, onConfirm }: { state: TxState; action: string; tone: "primary" | "accent"; onConfirm: () => void }) {
  const { color } = useTheme();
  const { t } = useT();
  const reduce = useReducedMotion();
  const press = usePressScale();
  const live = canConfirm(state);
  const flying = isInFlight(state);
  const bg = tone === "accent" ? color.accent : color.primary;
  const ink = tone === "accent" ? color.accentForeground : color.primaryForeground;
  const bar = useSharedValue(txProgress(state));
  const dim = useSharedValue(1);
  useEffect(() => {
    bar.set(reduce ? txProgress(state) : withSpring(txProgress(state), SPRING.compactSelector));
  }, [state, reduce, bar]);
  useEffect(() => {
    dim.set(withTiming(state.kind === "unknown" ? WAITING_OPACITY : 1, { duration: TIMING.selection }));
  }, [state.kind, dim]);
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, bar.get()) * PERCENT}%` }));
  const plateStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));

  const face =
    state.kind === "signing"
      ? t("shell.tx.signing")
      : state.kind === "submitted"
        ? t("shell.tx.sent")
        : state.kind === "unknown"
          ? t("shell.tx.waiting")
          : state.kind === "confirmed"
            ? t("shell.tx.done")
            : state.kind === "failed"
              ? t("shell.tx.tryAgain")
              : action;
  return (
    <Animated.View style={[styles.plateWrap, ELEVATION.button, press.style, plateStyle]}>
      <Pressable
        onPressIn={() => {
          if (live) fire("press");
          press.onPressIn();
        }}
        onPressOut={press.onPressOut}
        onPress={() => live && onConfirm()}
        accessibilityRole="button"
        accessibilityLabel={face}
        accessibilityState={{ busy: flying, disabled: !live && !flying && state.kind !== "confirmed" }}
        style={[styles.plate, { backgroundColor: bg }]}
      >
        {state.kind === "signing" || state.kind === "submitted" || state.kind === "unknown" ? (
          <ShimmerText style={[TYPE.buttonLabel, { color: ink }]}>{face}</ShimmerText>
        ) : (
          <View style={styles.face}>
            {state.kind === "confirmed" ? <Icon icon={Check} size={SIZE.icon} tint={ink} strokeWidth={3} /> : null}
            <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} numberOfLines={1} style={[TYPE.buttonLabel, { color: ink }]}>
              {face}
            </Text>
          </View>
        )}
        <Animated.View pointerEvents="none" style={[styles.bar, { backgroundColor: ink, opacity: 0.35 }, barStyle]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: SPACE.xs },
  plateWrap: { alignSelf: "stretch", opacity: 1 },
  plate: {
    height: SIZE.buttonHeight,
    borderRadius: BUTTON.radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.lg,
    flexDirection: "row",
  },
  face: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  bar: { position: "absolute", left: 0, bottom: 0, height: BAR },
  caption: { minHeight: SPACE.lg + SPACE.xs, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
});
