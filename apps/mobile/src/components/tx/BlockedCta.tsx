/**
 * A blocker that names its fix IS the action (Mitoshi's BlockedCta; owner rule: a disabled button says the fix, never
 * "Soon"). The plate wears the fix ("Add money", "Set a budget", "Sign in") and does it; the reason sits under it as one
 * caption line. Only where no fix exists, or the host cannot run it, does a stated, readable blocked face appear (the
 * blocker's own words on a quiet plate, never a 40 % grey ghost) and never as a fake action. The kit runs no fix itself
 * (opening Add money, signing in and so on belong to the screens that own them): the host passes `onFix`.
 * Faces crossfade in one place, so a countdown or an amount updates in place and only a new fix or block swaps.
 */
import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useT } from "@/i18n";

import { Button } from "../kit/Button";
import type { BlockerFix } from "../kit/diagnosis";
import { WaitingText } from "../kit/wait";
import { BUTTON, CONTROL_FONT_SCALE, SIZE, SPACE, TIMING, TYPE, useTheme } from "../kit/theme";

export type Blocker = {
  /** The blocker in words, the face when nothing can fix it here ("Enter an amount", "Over your weekly budget"). */
  label: string;
  /** One line of why, under the plate. */
  reason?: string | null;
  fix?: BlockerFix | null;
  /** The blocker is a wait (a quote is loading): the face shows a named wait instead. */
  busy?: boolean;
};

export function BlockedCta({
  blocker,
  onFix,
  fixLabel,
  caption,
}: {
  blocker: Blocker;
  /** Runs the named fix; without it the fix cannot be offered and the blocked face is stated instead. */
  onFix?: (fix: BlockerFix) => void;
  /** Overrides the fix's standard label ("Buy $3.40 to cover it"). */
  fixLabel?: string;
  /** The caption when the blocker gives no reason. */
  caption?: ReactNode;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const fix = blocker.fix && onFix ? blocker.fix : null;
  const reason = blocker.reason ?? caption ?? null;
  const faceKey = fix ? `fix:${fix.kind}` : `block:${blocker.label}`;
  return (
    <View style={styles.wrap}>
      <Animated.View key={faceKey} entering={FadeIn.duration(TIMING.numberChange)}>
        {fix ? (
          <Button label={fixLabel ?? t(`shell.fix.${fix.kind}`)} onPress={() => onFix?.(fix)} />
        ) : (
          <View
            accessible
            accessibilityRole="button"
            accessibilityState={{ disabled: true, busy: blocker.busy === true }}
            accessibilityLabel={
              reason ? `${blocker.label}. ${typeof reason === "string" ? reason : ""}` : blocker.label
            }
            style={[styles.plate, { backgroundColor: color.raised2 }]}
          >
            {blocker.busy ? (
              <WaitingText size="body" timeoutMs={null}>
                {blocker.label}
              </WaitingText>
            ) : (
              <Text
                maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                numberOfLines={1}
                style={[TYPE.buttonLabel, { color: color.text2 }]}
              >
                {blocker.label}
              </Text>
            )}
          </View>
        )}
      </Animated.View>
      <View style={styles.caption}>
        {typeof reason === "string" ? (
          <Text style={[TYPE.caption, styles.center, { color: color.text3 }]} aria-hidden={fix ? undefined : true}>
            {reason}
          </Text>
        ) : (
          reason
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: SPACE.xs },
  plate: {
    height: SIZE.buttonHeight,
    borderRadius: BUTTON.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.lg,
  },
  caption: { minHeight: SPACE.lg + SPACE.xs, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
});
