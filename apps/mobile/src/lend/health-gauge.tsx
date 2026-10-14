// The live health gauge (earn-borrow.md "How much"), on the kit's tokens (21st.dev designali-in "Gauge" 1757 as the
// spec, laid flat): a track from 1 (liquidation) to 3+, the refused zone under the floor in the down colour, the
// caution zone up to the warning line in its wash, the safe rest in the up wash, and a needle that eases to the health
// after this action as the amount changes, with a faint mark where it stands now. The number and a word say the same
// for a screen reader (never colour alone).
import * as React from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { HEALTH_GAUGE } from "@kawase/config";

import { RADIUS, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";
import { LiveNumber } from "@/trade/bits";

import { useLendFormat } from "./copy";

const HALF = 2;
const FULL = 1;
const SPAN = HEALTH_GAUGE.scaleMax - HEALTH_GAUGE.scaleMin;
const FIGURE_H = 36;
const FIGURE_H_COMPACT = 28;
const RIM = 2;

/** Where a health sits on the track, 0 (liquidation) to 1 (the top of the scale; no debt sits there too). */
const position = (health: number | null) => (health === null ? FULL : Math.min(FULL, Math.max(0, (health - HEALTH_GAUGE.scaleMin) / SPAN)));

export type HealthZone = "safe" | "near" | "low";

export const zoneOf = (health: number | null, min: number, warn: number): HealthZone => (health === null || health >= warn ? "safe" : health >= min ? "near" : "low");

export function HealthGauge({ before, after, min, warn, compact = false }: { before: number | null; after: number | null; min: number; warn: number; compact?: boolean }) {
  const { t } = useT();
  const { color } = useTheme();
  const format = useLendFormat();
  const reduced = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const needle = useSharedValue(position(after));
  React.useEffect(() => {
    needle.set(reduced ? position(after) : withTiming(position(after), { duration: HEALTH_GAUGE.moveMs }));
  }, [after, needle, reduced]);
  const needleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: needle.get() * width - HEALTH_GAUGE.needlePt / HALF }] }));
  const zone = zoneOf(after, min, warn);
  const tone = zone === "safe" ? color.up : zone === "near" ? color.warn : color.down;
  const minAt = position(min);
  const warnAt = position(warn);
  const changed = before !== after && before !== null;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t("lend.health")} ${format.health(after)}, ${t(`lend.zone_${zone}`)}`}
      accessibilityValue={{ min: HEALTH_GAUGE.scaleMin, max: HEALTH_GAUGE.scaleMax, now: Math.min(after ?? HEALTH_GAUGE.scaleMax, HEALTH_GAUGE.scaleMax) }}
    >
      <View style={styles.head}>
        <View>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("lend.health")}</Text>
          <LiveNumber text={format.health(after)} value={after ?? HEALTH_GAUGE.scaleMax} height={compact ? FIGURE_H_COMPACT : FIGURE_H} color={tone} />
        </View>
        <View style={styles.end}>
          <Text style={[TYPE.rowStrong, { color: tone }]}>{t(`lend.zone_${zone}`)}</Text>
          {changed ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("lend.healthWas", { health: format.health(before) })}</Text> : null}
        </View>
      </View>
      <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={[styles.ltr, { height: HEALTH_GAUGE.needlePt, justifyContent: "center" }]}>
        <View style={[styles.track, { height: HEALTH_GAUGE.trackPt }]}>
          <View style={{ flex: minAt, backgroundColor: color.down }} />
          <View style={{ flex: warnAt - minAt, backgroundColor: color.downWashStrong }} />
          <View style={{ flex: FULL - warnAt, backgroundColor: color.upWashStrong }} />
        </View>
        {changed && width > 0 ? (
          <View
            style={{
              position: "absolute",
              borderRadius: RADIUS.pill,
              backgroundColor: color.text3,
              width: HEALTH_GAUGE.trackPt / HALF,
              height: HEALTH_GAUGE.needlePt,
              left: position(before) * width - HEALTH_GAUGE.trackPt / (HALF * HALF),
            }}
          />
        ) : null}
        {width > 0 ? (
          <Animated.View
            style={[
              { position: "absolute", left: 0, width: HEALTH_GAUGE.needlePt, height: HEALTH_GAUGE.needlePt, borderRadius: RADIUS.pill, borderWidth: RIM, borderColor: color.ink, backgroundColor: color.ground },
              needleStyle,
            ]}
          />
        ) : null}
      </View>
      <View style={[styles.scale, styles.ltr]}>
        <Text style={[TYPE.micro, { color: color.text3 }]}>{t("lend.liquidatedAt", { health: format.health(HEALTH_GAUGE.scaleMin) })}</Text>
        <Text style={[TYPE.micro, { color: color.text3 }]}>{t("lend.floor", { health: format.health(min) })}</Text>
        <Text style={[TYPE.micro, { color: color.text3 }]}>{`${format.health(HEALTH_GAUGE.scaleMax)}+`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: SPACE.md },
  end: { alignItems: "flex-end", gap: SPACE.xxs },
  ltr: { direction: "ltr" },
  track: { flexDirection: "row", overflow: "hidden", borderRadius: RADIUS.pill },
  scale: { flexDirection: "row", justifyContent: "space-between" },
});
