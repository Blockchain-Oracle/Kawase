import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useGroupFill } from "@/components/kit/Surface";
import { usePressScale } from "@/components/kit/usePressScale";
import { fire } from "@/feedback/fire";
import { CONTROL_FONT_SCALE, SHEET_SHAPE, SPACE, STAGGER_RISE, TIMING, TYPE, useTheme } from "@/components/kit/theme";

/** A rich row barely moves under the finger: it is wide, so 0.97 would read as a lurch. */
const ROW_PRESS_SCALE = 0.985;

/**
 * A selector row (Fomo F20/F21, C33): a borderless filled card — title, one line of detail, and what it leads to at
 * the trailing edge (real marks, an icon, a check). Rows arrive in a short stagger behind their sheet and shrink a
 * hair under the finger. `selected` marks the current choice for VoiceOver; the caller draws the check in `trailing`.
 */
export function SheetRow({
  title,
  detail,
  badge,
  leading,
  trailing,
  onPress,
  index = 0,
  selected,
  disabled = false,
}: {
  title: string;
  detail?: string;
  /** A small status beside the title ("New", "Sandbox"). */
  badge?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Position in the list, for the entrance stagger. */
  index?: number;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { color } = useTheme();
  const fill = useGroupFill();
  const press = usePressScale(ROW_PRESS_SCALE);
  return (
    <Animated.View
      // On the web a custom entering animation (`withInitialValues`) is pinned `position: absolute` at a snapshot
      // taken while the sheet still slides up from below the screen (Reanimated 4.5's web cleanup), so every row left
      // the layout and the sheet shrank to its heading (Abu, 10-15: "it opens, then truncates"). The web uses the
      // predefined fade-up, which is never pinned; the phone keeps its shorter rise.
      entering={
        Platform.OS === "web"
          ? FadeInDown.duration(TIMING.staggerItem).delay(index * TIMING.stagger)
          : FadeInDown.duration(TIMING.staggerItem)
              .delay(index * TIMING.stagger)
              .withInitialValues({ transform: [{ translateY: STAGGER_RISE }] })
      }
    >
      <Animated.View style={press.style}>
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={() => {
            fire("tick");
            onPress?.();
          }}
          disabled={disabled || !onPress}
          accessibilityRole="button"
          accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? color.rowPressed : fill }]}
        >
          {leading}
          <View style={styles.text}>
            <View style={styles.titleLine}>
              <Text
                maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                style={[TYPE.rowTitle, { color: disabled ? color.text3 : color.ink }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              {badge}
            </View>
            {detail ? (
              <Text
                maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                style={[TYPE.rowDetail, { color: color.text3 }]}
                numberOfLines={2}
              >
                {detail}
              </Text>
            ) : null}
          </View>
          {trailing}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: SHEET_SHAPE.rowMinHeight,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: SHEET_SHAPE.rowRadius,
  },
  text: { flex: 1, gap: SPACE.xxs },
  titleLine: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
});
