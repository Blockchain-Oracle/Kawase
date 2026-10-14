// Small parts the money-in sheets share (Add money, Buy): a header row with Back at the leading edge and the title
// centred, and a cluster of real marks (three exchanges, three chains) that names a whole group at a glance.
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Mark } from "@kawase/ui-native/components/mark";

import { ChevronLeft, Icon, X } from "@/components/kit/icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";

const STACK_OVERLAP = 0.35;
const STACK_RING = 2;
const STACK_MAX = 3;
const SIDES = 2;

/** Back (or Close) at the leading edge, the title centred, a spacer at the trailing edge so it stays centred. */
export function SheetHeaderRow({ title, back, close }: { title: string; back?: { label: string; onPress: () => void }; close?: { label: string; onPress: () => void } }) {
  const { color } = useTheme();
  const button = (action: { label: string; onPress: () => void }, glyph: typeof ChevronLeft) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      hitSlop={SPACE.sm}
      onPress={() => {
        fire("tick");
        action.onPress();
      }}
      style={({ pressed }) => [styles.button, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={glyph} size={SIZE.iconSm} tint={color.ink} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {back ? button(back, ChevronLeft) : <View style={styles.button} />}
      <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.sheetHeading, styles.title, { color: color.ink }]}>
        {title}
      </Text>
      {close ? button(close, X) : <View style={styles.button} />}
    </View>
  );
}

/** Up to three marks overlapping, each ringed in the row's fill so the stack reads as separate coins. */
export function MarkStack({ entities, size = SIZE.markToken }: { entities: readonly string[]; size?: number }) {
  const { color } = useTheme();
  const shown = entities.slice(0, STACK_MAX);
  return (
    <View style={[styles.stack, { height: size, width: size + (shown.length - 1) * size * (1 - STACK_OVERLAP) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map((entity, index) => (
        <View key={entity} style={[styles.coin, { left: index * size * (1 - STACK_OVERLAP), borderColor: color.raised2, borderRadius: RADIUS.pill }]}>
          <Mark entity={entity} size={size - STACK_RING * SIDES} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  title: { flex: 1, textAlign: "center" },
  button: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  stack: { justifyContent: "center" },
  coin: { position: "absolute", borderWidth: STACK_RING },
});
