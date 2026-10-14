/**
 * The desktop rail (Senryo/Mitoshi web shell; 21st.dev unlumen/sidebar-001 #21517 as the spec): a floating plate 248 px
 * wide (88 px compact, icons only) set 16 px off the window's edge with 24 px corners, sections of rows, a header slot
 * (brand and the mode capsule) and a footer slot (the person). The active row is a pill that springs to its row (500/36),
 * so a tab change reads as one object travelling, not a swap. Hover lifts a row on the web; keyboard focus draws the
 * ring. Rows that cannot be used here say why (the fix, never "soon"): they stay in place, dimmed, with the reason read out.
 * It mirrors in right-to-left languages because its rows are measured, not indexed.
 */
import { type ReactNode, type Ref, useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";

import { fire } from "@/feedback/fire";

import { Icon, type SymbolIcon } from "../kit/icons";
import {
  CONTROL_FONT_SCALE,
  DISABLED_OPACITY,
  ELEVATION,
  LAYOUT,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  TYPE,
  useTheme,
} from "../kit/theme";

export type RailRow = {
  key: string;
  label: string;
  icon?: SymbolIcon;
  /** A custom glyph (the voice orb). */
  render?: (active: boolean) => ReactNode;
  badge?: number;
  /** Does something rather than going somewhere: a button, never the selected row. */
  action?: boolean;
  /** Why the row cannot be used right now, in words that name the fix; the row stays, dimmed. */
  reason?: string;
  slotRef?: Ref<View>;
};

export type RailSection = { key: string; label?: string; rows: readonly RailRow[] };

const ROW_H = SIZE.touch + SPACE.xs;
const ICON = 20;
const BADGE = 18;
const HALF = 2;

export function Rail({
  label,
  sections,
  activeKey,
  onPress,
  compact,
  header,
  footer,
}: {
  /** The landmark name for assistive technology ("Navigation"). */
  label: string;
  sections: readonly RailSection[];
  activeKey: string;
  onPress: (key: string) => void;
  compact: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const { color } = useTheme();
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<Readonly<Record<string, { y: number; h: number }>>>({});
  const [sectionY, setSectionY] = useState<Readonly<Record<string, number>>>({});
  const pillY = useSharedValue(0);
  const pillH = useSharedValue(0);
  const activeSection = sections.find((section) => section.rows.some((row) => row.key === activeKey));
  const row = rows[activeKey];
  const offset = activeSection ? sectionY[activeSection.key] : undefined;
  const active = row && offset !== undefined ? { y: offset + row.y, h: row.h } : undefined;
  const selectable = sections.some((s) => s.rows.some((r) => r.key === activeKey && !r.action));
  useEffect(() => {
    if (!active) return;
    if (reduce || pillH.get() === 0) {
      pillY.set(active.y);
      pillH.set(active.h);
      return;
    }
    pillY.set(withSpring(active.y, SPRING.railPill));
    pillH.set(withSpring(active.h, SPRING.railPill));
  }, [active, reduce, pillY, pillH]);
  const pill = useAnimatedStyle(() => ({ height: pillH.get(), transform: [{ translateY: pillY.get() }] }));

  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={label}
      style={[
        styles.rail,
        ELEVATION.dock,
        { width: compact ? LAYOUT.railCompact : LAYOUT.railWide, backgroundColor: color.card },
      ]}
    >
      {header ? <View style={[styles.header, compact ? styles.centered : null]}>{header}</View> : null}
      {/* The rows scroll between the pinned header and footer, so a short window never hides them under the footer. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {selectable && active ? (
          <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: color.raised2 }, pill]} />
        ) : null}
        {sections.map((section) => (
          <View
            key={section.key}
            style={styles.section}
            onLayout={(e) => {
              const { y } = e.nativeEvent.layout;
              setSectionY((prev) => (prev[section.key] === y ? prev : { ...prev, [section.key]: y }));
            }}
          >
            {section.label && !compact ? (
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                style={[TYPE.meta, styles.sectionLabel, { color: color.text3 }]}
              >
                {section.label}
              </Text>
            ) : null}
            {section.rows.map((row) => (
              <RailItem
                key={row.key}
                row={row}
                compact={compact}
                selected={!row.action && row.key === activeKey}
                onPress={() => {
                  if (row.reason) return;
                  if (row.action || row.key !== activeKey) fire("tick");
                  onPress(row.key);
                }}
                onLayout={(e) => {
                  // Relative to its section; the pill adds the section's own offset.
                  const { y, height } = e.nativeEvent.layout;
                  setRows((prev) =>
                    prev[row.key]?.y === y && prev[row.key]?.h === height
                      ? prev
                      : { ...prev, [row.key]: { y, h: height } },
                  );
                }}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      {footer ? <View style={[styles.footer, compact ? styles.centered : null]}>{footer}</View> : null}
    </View>
  );
}

function RailItem({
  row,
  selected,
  compact,
  onPress,
  onLayout,
}: {
  row: RailRow;
  selected: boolean;
  compact: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { color } = useTheme();
  const blocked = row.reason !== undefined;
  return (
    <Pressable
      ref={row.slotRef}
      onLayout={onLayout}
      onPress={onPress}
      accessibilityRole={row.action ? "button" : "menuitem"}
      accessibilityLabel={row.badge ? `${row.label}, ${row.badge}` : row.label}
      accessibilityHint={row.reason}
      accessibilityState={{ selected, disabled: blocked }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        compact ? styles.rowCompact : null,
        blocked ? { opacity: DISABLED_OPACITY } : null,
        !selected && (pressed || hovered) ? { backgroundColor: color.rowPressed } : null,
      ]}
    >
      {row.render ? (
        row.render(selected)
      ) : row.icon ? (
        <Icon icon={row.icon} size={ICON} tint={selected ? color.ink : color.text2} />
      ) : null}
      {compact ? null : (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={CONTROL_FONT_SCALE}
          style={[selected ? TYPE.rowStrong : TYPE.row, styles.label, { color: selected ? color.ink : color.text2 }]}
        >
          {row.label}
        </Text>
      )}
      {row.badge ? (
        <View style={[styles.badge, compact ? styles.badgeCompact : null, { backgroundColor: color.accent }]}>
          <Text style={[TYPE.tabLabel, { color: color.accentForeground }]}>{row.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRadius: LAYOUT.stageRadius,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.md,
    gap: SPACE.lg,
    alignSelf: "stretch",
  },
  header: { gap: SPACE.md },
  footer: { gap: SPACE.sm },
  centered: { alignItems: "center" },
  // minHeight 0 lets the scroller shrink below its rows inside the rail's column (a flex child keeps its content's
  // height otherwise, and the footer would cover the last rows again).
  scroll: { flex: 1, minHeight: 0 },
  body: { gap: SPACE.lg },
  pill: { position: "absolute", left: 0, right: 0, top: 0, borderRadius: RADIUS.md },
  section: { gap: SPACE.xxs },
  sectionLabel: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: ROW_H,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
  },
  rowCompact: { justifyContent: "center", paddingHorizontal: 0 },
  label: { flex: 1 },
  badge: {
    minWidth: BADGE,
    height: BADGE,
    borderRadius: BADGE / HALF,
    paddingHorizontal: SPACE.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCompact: { position: "absolute", top: 4, end: 8 },
});
