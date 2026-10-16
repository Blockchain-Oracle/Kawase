// The card's own shape while the wallet is read: the slip, the avatar and handle, a block where the chart goes, the
// figure, three facts — never a spinner on an empty page.
import { StyleSheet, View } from "react-native";

import { Skeleton } from "@/components/kit/states";
import { RADIUS, SPACE, useTheme } from "@/components/kit/theme";

import { FRAME, L } from "./layout";

/** The skeleton figure: most of the display face's height. */
const FIGURE_SHARE = 0.8;

export function CardSkeleton({ width, label }: { width: number; label: string }) {
  const { color } = useTheme();
  const k = width / FRAME.w;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ width, height: FRAME.h * k, borderRadius: L.paper.r * k, backgroundColor: color.ground, padding: L.paper.x * k }}>
      <View style={{ flex: 1, borderRadius: L.paper.r * k, backgroundColor: color.card, padding: (L.left - L.paper.x) * k, gap: SPACE.lg }}>
        <View style={styles.row}>
          <Skeleton width={L.header.avatar.size * k} height={L.header.avatar.size * k} radius={L.header.avatar.size} />
          <View style={[styles.grow, { gap: SPACE.xs }]}>
            <Skeleton width="55%" />
            <Skeleton width="35%" />
          </View>
        </View>
        <Skeleton height={L.plot.h * k} radius={RADIUS.md} />
        <Skeleton width="30%" />
        <Skeleton width="62%" height={L.hero.figure.size * k * FIGURE_SHARE} radius={RADIUS.sm} />
        <View style={styles.row}>
          <Skeleton width="28%" />
          <Skeleton width="28%" />
          <Skeleton width="28%" />
        </View>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
});
