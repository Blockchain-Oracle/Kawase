import { type ReactNode, useContext } from "react";
import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { fire } from "@/feedback/fire";
import { BUTTON, CONTROL_FONT_SCALE, DISABLED_OPACITY, type Palette, SIZE, SPACE, TYPE, useTheme } from "./theme";
import { SurfaceLevel } from "./Surface";
import { usePressScale } from "./usePressScale";

/** Native reference controls: flat pill buttons, black primary, outlined secondary and gray disabled. */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  /** Stretch across the row (default) or size to the label. */
  block?: boolean;
  leading?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

interface Tone {
  bg: string;
  pressed: string;
  ink: string;
}

/**
 * Quiet fills step up with their ground: on a sheet (level 1) they are one step lighter than on a page, and on a group
 * inside a sheet (level 2, whose fill is `raised2`) they take `nestedFill` — `raised2` there is the group's own colour.
 */
function tones(variant: ButtonVariant, c: Palette, level: number): Tone {
  switch (variant) {
    case "primary":
      return { bg: c.primary, pressed: c.primaryPressed, ink: c.primaryForeground };
    case "secondary":
      return level > 0
        ? { bg: c.rowPressed, pressed: c.raised2, ink: c.foreground }
        : { bg: c.raised2, pressed: c.rowPressed, ink: c.foreground };
    case "outline":
      return { bg: c.transparent, pressed: c.rowPressed, ink: c.foreground };
    case "ghost":
      return { bg: c.transparent, pressed: c.rowPressed, ink: c.link };
    case "destructive":
      return { bg: c.destructiveWash, pressed: c.destructiveWash, ink: c.destructive };
  }
}

/** Disabled filled buttons use the reference's gray inset plate. */
function quiet(c: Palette): Tone {
  const bg = c.input;
  return { bg, pressed: bg, ink: c.text3 };
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  block = true,
  leading,
  accessibilityHint,
  style,
}: Props) {
  const { color } = useTheme();
  const press = usePressScale();
  const inert = disabled || loading;
  const level = useContext(SurfaceLevel);
  const tone = disabled && variant !== "ghost" ? quiet(color) : tones(variant, color, level);
  const compact = size === "sm";
  return (
    <Animated.View style={[block ? styles.block : styles.inline, style, press.style]}>
      <Pressable
        onPressIn={() => {
          fire("press");
          press.onPressIn();
        }}
        onPressOut={press.onPressOut}
        {...(onPress ? { onPress } : {})}
        disabled={inert}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...(accessibilityHint ? { accessibilityHint } : {})}
        accessibilityState={{ disabled: inert, busy: loading }}
        style={({ pressed }) => [
          styles.base,
          {
            height: compact ? SIZE.buttonHeightSm : SIZE.buttonHeight,
            borderRadius: compact ? BUTTON.radius.sm : BUTTON.radius.md,
            backgroundColor: pressed ? tone.pressed : tone.bg,
          },
          variant === "outline" ? { borderWidth: 1.5, borderColor: color.ink } : null,
          disabled && variant === "ghost" ? styles.faded : null,
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={tone.ink} /> : leading}
        <Text
          maxFontSizeMultiplier={CONTROL_FONT_SCALE}
          style={[compact ? TYPE.buttonCompact : TYPE.buttonLabel, { color: tone.ink }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: "stretch" },
  inline: { alignSelf: "flex-start" },
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    minHeight: SIZE.touch,
  },
  faded: { opacity: DISABLED_OPACITY },
});
