// Web twin of SlideToConfirm: 21st.dev starc007/slide-action-button (id 29304) installed in ui-web (pointer drag,
// keyboard, reduced motion, the chevron bending into a check), wrapped to the kit's props. A locked rail (disabled, or
// busy with a short preparation step) is a quiet static plate that says why, since the 21st component has no locked
// state. Commit comes at 90 % of the travel; `resetKey` remounts it, so a changed reviewed intent cancels a slide.
import { SlideActionButton } from "@kawase/ui-web/components/ui/slide-action-button";
import { StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";

import type { SlideToConfirmProps } from "./SlideToConfirm";
import { BUTTON, CONTROL_FONT_SCALE, SIZE, SPACE, TYPE, useTheme } from "./theme";

const COMMIT = 0.9;

export function SlideToConfirm({ label, onConfirm, disabled = false, busy = false, resetKey }: SlideToConfirmProps) {
  const { t } = useT();
  const { color } = useTheme();
  if (disabled || busy) {
    return (
      <View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: true, busy }} style={[styles.locked, { backgroundColor: color.raised2 }]}>
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} numberOfLines={1} style={[TYPE.buttonLabel, { color: color.text3 }]}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <SlideActionButton key={resetKey} threshold={COMMIT} completeLabel={t("shell.tx.signing")} onComplete={onConfirm} className="w-full" aria-label={label}>
      {label}
    </SlideActionButton>
  );
}

const styles = StyleSheet.create({
  locked: { height: SIZE.buttonHeight, borderRadius: BUTTON.radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACE.lg },
});
