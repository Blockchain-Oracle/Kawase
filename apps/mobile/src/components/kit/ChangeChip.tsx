/**
 * "+2.34%" on a tinted plate in the direction's colour (no border), grey when level: a 24-hour change next to a price or
 * a balance. The change comes from the caller as a fraction (0.0234 = +2.34%); null draws nothing, never a fake 0.
 */
import { StyleSheet, Text, View } from "react-native";

import { useT } from "@/i18n";

import { RADIUS, SPACE, TYPE, useTheme } from "./theme";

const CHIP_H = 22;
/** Below half a basis point a move is level. */
const LEVEL = 0.00005;

export function ChangeChip({ change }: { change: number | null }) {
  const { color } = useTheme();
  const { i18n } = useT();
  if (change === null || !Number.isFinite(change)) return null;
  const tone = Math.abs(change) < LEVEL ? "flat" : change > 0 ? "up" : "down";
  const plate = tone === "up" ? color.upSurface : tone === "down" ? color.downSurface : color.muted;
  const ink = tone === "up" ? color.up : tone === "down" ? color.down : color.inkMuted;
  const text = new Intl.NumberFormat(i18n.language, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(change);
  return (
    <View style={[styles.chip, { backgroundColor: plate }]}>
      <Text style={[TYPE.micro, styles.figure, { color: ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: CHIP_H, paddingHorizontal: SPACE.xs, borderRadius: RADIUS.xs, justifyContent: "center" },
  figure: { fontVariant: ["tabular-nums"], fontWeight: "600" },
});
