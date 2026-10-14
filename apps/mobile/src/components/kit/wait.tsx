/**
 * Waiting, told honestly (Mitoshi's WaitingText and useHeldLoading, 21st.dev theshanelevine/loading-state #23591 and
 * serafimcloud/text-shimmer #12336 as the specs). Three small pieces every async surface shares:
 *   - `useHeldLoading`: a skeleton appears only if the wait outlasts a short delay and, once shown, stays at least
 *     300 ms, so nothing flashes and nothing blinks.
 *   - `useWaitClock`: elapsed seconds off one clock, the "show the seconds after 3 s" and "still waiting at about 15 s" rule.
 *   - `WaitingText`: a short verb with a shimmer ("Pricing", "Bridging"), the elapsed seconds after 3 s, and an honest
 *     "Still waiting · Retry" at about 15 s. A named wait never spins forever.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { type StyleProp, StyleSheet, Text, type TextStyle, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useT } from "@/i18n";

import { Button } from "./Button";
import { CircleAlert, Icon } from "./icons";
import { announce } from "./announce";
import { NUMERIC_VARIANT, SKELETON, SPACE, TYPE, useTheme } from "./theme";

const SECOND = 1000;
const SHOW_ELAPSED_AFTER_MS = 3000;
const TIMEOUT_MS = 15_000;
const HELD_DELAY_MS = 120;
const HELD_MIN_MS = 300;

/** True while the host should draw its skeleton: after `delayMs` of loading, for at least `minVisibleMs`. */
export function useHeldLoading(
  loading: boolean,
  delayMs: number = HELD_DELAY_MS,
  minVisibleMs: number = HELD_MIN_MS,
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (loading) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), Math.max(0, minVisibleMs - (Date.now() - shownAt.current)));
    return () => clearTimeout(timer);
  }, [loading, visible, delayMs, minVisibleMs]);
  return visible;
}

export type WaitPhase = "quiet" | "elapsed" | "late";

/** Pure: where a wait stands `elapsedMs` in (quiet, then the seconds show, then timed out). */
export function waitPhase(
  elapsedMs: number,
  showElapsedAfterMs: number = SHOW_ELAPSED_AFTER_MS,
  timeoutMs: number | null = TIMEOUT_MS,
): WaitPhase {
  if (timeoutMs !== null && elapsedMs >= timeoutMs) return "late";
  return elapsedMs >= showElapsedAfterMs ? "elapsed" : "quiet";
}

export type WaitClock = { elapsedSec: number; late: boolean; timedOut: boolean; restart: () => void };

/** The wait's clock: starts at `startedAtMs` or the first render, re-renders once a second only while it counts. */
export function useWaitClock(
  startedAtMs?: number,
  timeoutMs: number | null = TIMEOUT_MS,
  showElapsedAfterMs: number = SHOW_ELAPSED_AFTER_MS,
): WaitClock {
  const [start, setStart] = useState(() => startedAtMs ?? Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (startedAtMs !== undefined) setStart(startedAtMs);
  }, [startedAtMs]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), SECOND);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = Math.max(0, Math.floor((now - start) / SECOND) * SECOND);
  const phase = waitPhase(elapsedMs, showElapsedAfterMs, timeoutMs);
  const restart = useCallback(() => {
    const at = Date.now();
    setStart(at);
    setNow(at);
  }, []);
  return { elapsedSec: Math.floor(elapsedMs / SECOND), late: phase !== "quiet", timedOut: phase === "late", restart };
}

/** Words that shimmer while something is pending: an opacity sweep (Reanimated), static under Reduce Motion. */
export function ShimmerText({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue<number>(SKELETON.from);
  useEffect(() => {
    if (reduce) return;
    pulse.set(withRepeat(withTiming(SKELETON.to, { duration: SKELETON.periodMs }), -1, true));
  }, [reduce, pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: reduce ? 1 : pulse.get() }));
  return <Animated.Text style={[animated, style]}>{children}</Animated.Text>;
}

export function WaitingText({
  children,
  startedAtMs,
  timeoutMs = TIMEOUT_MS,
  onRetry,
  size = "caption",
}: {
  /** At most four words with a verb, no trailing ellipsis (the component adds it): "Pricing", "Bridging". */
  children: string;
  startedAtMs?: number;
  /** `null` only for a wallet or approval prompt (the person, not the network, is the wait). */
  timeoutMs?: number | null;
  onRetry?: () => void;
  size?: "caption" | "body";
}) {
  const { t } = useT();
  const { color } = useTheme();
  const clock = useWaitClock(startedAtMs, timeoutMs);
  const words = children.replace(/…$/, "");
  const style = size === "body" ? TYPE.body : TYPE.caption;
  useEffect(() => {
    if (clock.timedOut) announce(t("shell.wait.lateTitle"));
  }, [clock.timedOut, t]);
  if (clock.timedOut) {
    return (
      <View accessibilityRole="alert" style={styles.late}>
        <Icon icon={CircleAlert} size={16} tint={color.warn} />
        <View style={styles.lateCopy}>
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("shell.wait.lateTitle")}</Text>
          <Text style={[TYPE.caption, { color: color.text2 }]}>
            {t("shell.wait.lateBody", { seconds: clock.elapsedSec })}
          </Text>
        </View>
        {onRetry ? (
          <Button
            label={t("shell.wait.retry")}
            size="sm"
            variant="secondary"
            block={false}
            onPress={() => {
              clock.restart();
              onRetry();
            }}
          />
        ) : null}
      </View>
    );
  }
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={words}
      accessibilityState={{ busy: true }}
      style={styles.line}
    >
      <ShimmerText style={[style, { color: color.text2 }]}>{`${words}…`}</ShimmerText>
      {clock.late ? (
        <Text
          style={[style, { color: color.text3, fontVariant: NUMERIC_VARIANT }]}
        >{`· ${t("shell.wait.elapsed", { seconds: clock.elapsedSec })}`}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  late: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  lateCopy: { flex: 1, gap: SPACE.xxs },
});
