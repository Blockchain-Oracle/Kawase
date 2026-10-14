// Web twin of SlideToConfirm: 21st.dev starc007/slide-action-button (id 29304) installed in ui-web (pointer drag,
// keyboard Enter/Space, reduced motion, the chevron bending into a check), reskinned to the kit's 56 px rail and wrapped
// to the kit's props. The tone picks the thumb and fill from tokens (black, magenta, up, down) on that tone's wash. A
// locked rail (disabled, or busy with a short preparation step) is a quiet static plate that says why, since the 21st
// component has no locked state. Commit comes at 90 % of the travel; `resetKey` remounts it, so a changed reviewed
// intent cancels a slide in progress.
import { SlideActionButton } from "@kawase/ui-web/components/ui/slide-action-button";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

import type { SlideTone, SlideToConfirmProps } from "./SlideToConfirm";
import { BUTTON, CONTROL_FONT_SCALE, SIZE, SPACE, TYPE, useTheme } from "./theme";

const COMMIT = 0.9;

/** Thumb, fill and track per tone, as token classes (the rail's wash is the tone at 12 %). */
const TONE: Record<SlideTone, { thumb: string; fill: string; track: string }> = {
  primary: { thumb: "bg-primary text-primary-foreground", fill: "bg-primary", track: "bg-primary/12" },
  accent: { thumb: "bg-accent text-accent-foreground", fill: "bg-accent", track: "bg-accent/12" },
  up: { thumb: "bg-up text-up-foreground", fill: "bg-up", track: "bg-up/12" },
  down: { thumb: "bg-down text-down-foreground", fill: "bg-down", track: "bg-down/12" },
};

export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  busy = false,
  tone = "primary",
  resetKey,
}: SlideToConfirmProps) {
  const { t } = useT();
  const { color } = useTheme();
  if (disabled || busy) {
    return (
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: true, busy }}
        style={[styles.locked, { backgroundColor: color.raised2 }]}
      >
        {busy ? <ActivityIndicator color={color.text2} /> : null}
        <Text
          maxFontSizeMultiplier={CONTROL_FONT_SCALE}
          numberOfLines={1}
          style={[TYPE.buttonLabel, { color: color.text3 }]}
        >
          {label}
        </Text>
      </View>
    );
  }
  const classes = TONE[tone];
  return (
    <SlideActionButton
      key={resetKey}
      threshold={COMMIT}
      completeLabel={t("shell.tx.signing")}
      onComplete={() => {
        fire("confirm");
        onConfirm();
      }}
      className={`w-full ${classes.track}`}
      thumbClassName={classes.thumb}
      fillClassName={classes.fill}
      aria-label={label}
    >
      {label}
    </SlideActionButton>
  );
}

const styles = StyleSheet.create({
  locked: {
    height: SIZE.buttonHeight,
    borderRadius: BUTTON.radius.md,
    flexDirection: "row",
    gap: SPACE.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACE.lg,
  },
});
