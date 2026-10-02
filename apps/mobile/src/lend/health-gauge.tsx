// The live health gauge (earn-borrow.md "How much"): a track from 1 (liquidation) to 3+, the refused zone under the
// floor, the caution zone up to the warning line, and a needle that eases to the health after this action as the
// amount changes, with a faint mark where it stands now. The number and a word say the same for a screen reader.
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { HEALTH_GAUGE } from "@kawase/config";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

import { useLendFormat } from "./copy";

const HALF = 2;
const FULL = 1;
const SPAN = HEALTH_GAUGE.scaleMax - HEALTH_GAUGE.scaleMin;

/** Where a health sits on the track, 0 (liquidation) to 1 (the top of the scale; no debt sits there too). */
const position = (health: number | null) => (health === null ? FULL : Math.min(FULL, Math.max(0, (health - HEALTH_GAUGE.scaleMin) / SPAN)));

export type HealthZone = "safe" | "near" | "low";

export const zoneOf = (health: number | null, min: number, warn: number): HealthZone => (health === null || health >= warn ? "safe" : health >= min ? "near" : "low");

export function HealthGauge({ before, after, min, warn, compact = false }: { before: number | null; after: number | null; min: number; warn: number; compact?: boolean }) {
  const { t } = useT();
  const format = useLendFormat();
  const reduced = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const needle = useSharedValue(position(after));
  React.useEffect(() => {
    needle.value = reduced ? position(after) : withTiming(position(after), { duration: HEALTH_GAUGE.moveMs });
  }, [after, needle, reduced]);
  const needleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: needle.value * width - HEALTH_GAUGE.needlePt / HALF }] }));
  const zone = zoneOf(after, min, warn);
  const tone = zone === "safe" ? "text-success" : "text-destructive";
  const minAt = position(min);
  const warnAt = position(warn);
  const changed = before !== after && before !== null;

  return (
    <View
      className="gap-2"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t("lend.health")} ${format.health(after)}, ${t(`lend.zone_${zone}`)}`}
      accessibilityValue={{ min: HEALTH_GAUGE.scaleMin, max: HEALTH_GAUGE.scaleMax, now: Math.min(after ?? HEALTH_GAUGE.scaleMax, HEALTH_GAUGE.scaleMax) }}
    >
      <View className="flex-row items-end justify-between gap-3">
        <View className="gap-0.5">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("lend.health")}</Text>
          <Text className={cn("font-display font-bold", compact ? "text-2xl" : "text-3xl", tone)} style={{ fontVariant: ["tabular-nums"] }}>
            {format.health(after)}
          </Text>
        </View>
        <View className="items-end gap-0.5">
          <Text className={cn("text-sm font-semibold", tone)}>{t(`lend.zone_${zone}`)}</Text>
          {changed ? <Text className="text-muted-foreground text-xs">{t("lend.healthWas", { health: format.health(before) })}</Text> : null}
        </View>
      </View>
      <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={{ direction: "ltr", height: HEALTH_GAUGE.needlePt, justifyContent: "center" }}>
        <View className="flex-row overflow-hidden rounded-full" style={{ height: HEALTH_GAUGE.trackPt }}>
          <View className="bg-destructive" style={{ flex: minAt }} />
          <View className="bg-destructive/40" style={{ flex: warnAt - minAt }} />
          <View className="bg-success/60" style={{ flex: FULL - warnAt }} />
        </View>
        {changed && width > 0 ? (
          <View className="bg-foreground/40 absolute rounded-full" style={{ width: HEALTH_GAUGE.trackPt / HALF, height: HEALTH_GAUGE.needlePt, left: position(before) * width - HEALTH_GAUGE.trackPt / (HALF * HALF) }} />
        ) : null}
        {width > 0 ? (
          <Animated.View
            className="bg-background border-foreground absolute rounded-full border-2"
            style={[{ width: HEALTH_GAUGE.needlePt, height: HEALTH_GAUGE.needlePt, left: 0 }, needleStyle]}
          />
        ) : null}
      </View>
      <View className="flex-row justify-between" style={{ direction: "ltr" }}>
        <Text className="text-muted-foreground text-[10px]">{t("lend.liquidatedAt", { health: format.health(HEALTH_GAUGE.scaleMin) })}</Text>
        <Text className="text-muted-foreground text-[10px]">{t("lend.floor", { health: format.health(min) })}</Text>
        <Text className="text-muted-foreground text-[10px]">{`${format.health(HEALTH_GAUGE.scaleMax)}+`}</Text>
      </View>
    </View>
  );
}
