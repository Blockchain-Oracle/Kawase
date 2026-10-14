import { createContext, type ReactNode, useContext } from "react";
import { type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { CONTROL_FONT_SCALE, HAIRLINE_PX, type Palette, SHEET_SHAPE, SPACE, TYPE, useTheme } from "./theme";

/**
 * How far above the page a surface sits: 0 on a page, 1 inside a sheet. A filled group is always one step lighter than
 * what it sits on, so it reads without a border (Fomo F20: borderless rows on the sheet; F16: cards on the page).
 */
export const SurfaceLevel = createContext(0);

/** The fill for a group or row at the current level. */
export function useGroupFill(): string {
  return groupFill(useTheme().color, useContext(SurfaceLevel));
}

function groupFill(color: Palette, level: number): string {
  return level > 0 ? color.raised2 : color.card;
}

/**
 * A filled group: one step lighter than its ground, 20 pt corners, no border and no shadow. What sits inside it is one
 * level up, so a quiet button on a group still reads as a plate.
 */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const level = useContext(SurfaceLevel);
  const { color } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: groupFill(color, level) }, style]}>
      <SurfaceLevel.Provider value={level + 1}>{children}</SurfaceLevel.Provider>
    </View>
  );
}

/** A section's quiet label above its content. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { color } = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={CONTROL_FONT_SCALE}
      accessibilityRole="header"
      style={[TYPE.rowDetail, { color: color.text3 }, style]}
    >
      {children}
    </Text>
  );
}

/** A label/value row (ticket summary, quote rows). */
export function KeyValue({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string | undefined;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.kv} accessible accessibilityLabel={`${label} ${value}`}>
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.rowDetail, { color: color.text3 }]}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.rowAmount, { color: valueColor ?? color.ink }]}>
        {value}
      </Text>
    </View>
  );
}

/** A hairline divider. */
export function Rule() {
  const { color } = useTheme();
  return <View style={[styles.rule, { backgroundColor: color.hairline }]} />;
}

const styles = StyleSheet.create({
  panel: { borderRadius: SHEET_SHAPE.rowRadius, overflow: "hidden" },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: SPACE.md,
    paddingVertical: SPACE.xs + SPACE.xxs,
  },
  rule: { height: HAIRLINE_PX, alignSelf: "stretch" },
});
