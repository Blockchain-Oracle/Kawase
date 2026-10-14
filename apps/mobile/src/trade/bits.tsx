// Small parts this lane's money surfaces share, composed only from the Senryo kit's tokens and parts:
//  - LiveNumber: the kit's RollingFigure (Skia odometer on the phone, NumberFlow on the web) for any live figure given
//    as a number (P&L, a price, a balance); digits roll up on a rise and down on a fall.
//  - ChoiceChips: a row of equal pills (presets, close shares, take-profit steps), the AmountPad chip anatomy.
//  - SideTag: Long / Short on its direction wash, the word always with the hue (never colour alone).
//  - Note: one line on the warn wash (a risk line, a stale read), no border.
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DISABLED_OPACITY, RollingFigure, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { Icon, TriangleAlert } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

const CENTS = 100;
const HALF = 2;
const ZERO = 0n;

/** A live figure as rolling digits; `value` orders the roll (a rise rolls forward), `text` is what shows. */
export function LiveNumber({ text, value, height, color, align = "left", sensitive = false }: { text: string; value: number; height: number; color?: string; align?: "left" | "right"; sensitive?: boolean }) {
  const theme = useTheme().color;
  const units = Number.isFinite(value) ? BigInt(Math.round(value * CENTS)) : ZERO;
  return <RollingFigure text={text} value={units} height={height} color={color ?? theme.ink} align={align} sensitive={sensitive} />;
}

export type Choice<T> = { value: T; label: string; disabled?: boolean };

export function ChoiceChips<T extends string | number>({ options, value, onChange, label }: { options: readonly Choice<T>[]; value: T | null | undefined; onChange: (next: T) => void; label: string }) {
  const { color } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: Boolean(option.disabled) }}
            disabled={option.disabled}
            onPress={() => {
              fire("tick");
              onChange(option.value);
            }}
            style={[styles.chip, { backgroundColor: on ? color.ink : color.raised2, opacity: option.disabled ? DISABLED_OPACITY : 1 }]}
          >
            <Text numberOfLines={1} style={[TYPE.chipLabel, { color: on ? color.ground : color.ink }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SideTag({ side }: { side: "long" | "short" }) {
  const { t } = useT();
  const { color } = useTheme();
  const up = side === "long";
  return (
    <View style={[styles.tag, { backgroundColor: up ? color.upSurface : color.downSurface }]}>
      <Text style={[TYPE.chipLabel, { color: up ? color.up : color.down }]}>{t(`margin.${side}`)}</Text>
    </View>
  );
}

/** The "Real money" marker on every mainnet ticket: a magenta dot and the words (never the colour alone). */
export function RealMoney({ label }: { label?: string }) {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <View style={styles.marker} accessibilityRole="text">
      <View style={[styles.dot, { backgroundColor: color.accent }]} />
      <Text style={[TYPE.meta, { color: color.ink }]}>{label ? `${label} · ${t("network.realMoney")}` : t("network.realMoney")}</Text>
    </View>
  );
}

export function Note({ children, tone = "warn" }: { children: string; tone?: "warn" | "quiet" }) {
  const { color } = useTheme();
  if (tone === "quiet") return <Text style={[TYPE.caption, { color: color.text3 }]}>{children}</Text>;
  return (
    <View style={[styles.note, { backgroundColor: color.warnSurface }]}>
      <Icon icon={TriangleAlert} size={SIZE.iconSm} tint={color.warn} />
      <Text style={[TYPE.rowDetail, styles.grow, { color: color.ink }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: SPACE.sm },
  chip: { flex: 1, minHeight: SIZE.chipHeight, borderRadius: SIZE.chipHeight / HALF, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACE.sm },
  tag: { borderRadius: RADIUS.pill, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs, alignSelf: "flex-start" },
  note: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  grow: { flex: 1 },
  marker: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  dot: { width: SIZE.dot, height: SIZE.dot, borderRadius: SIZE.dot },
});
