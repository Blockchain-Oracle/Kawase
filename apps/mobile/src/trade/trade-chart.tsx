// The terminal's price panel (native twin of 21st.dev ssychui "Candle Chart", id 20107; the desktop docs pack's
// choice: react-native-svg, one drawing for iOS, Android and the web, SSR-safe, no WASM). Candles over a volume
// strip, the live price ticking on the last bar, and the trade's levels drawn rather than written: the entry, the
// liquidation price with the zone past it washed in the down colour, and take-profit / stop-loss as dotted lines.
// The price range always includes those levels, so how far liquidation is reads at a glance. A finger (pan) or a
// mouse (hover, web) reads the bar under it. Wicks share one path and bodies two (up / down), capped at 150 bars.
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { Candle, MarginSide } from "@kawase/api-client";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useThemeColors } from "@/theme/use-theme-colors";

export type ChartLevelKind = "price" | "entry" | "liquidation" | "takeProfit" | "stopLoss";
/** `label` is the short tag drawn beside the line ("Liq.", "Entry", "TP", "SL"); the axis pill carries the price. */
export type ChartLevel = { kind: ChartLevelKind; value: number; label: string };

type Props = {
  candles: readonly Candle[];
  /** The latest price from the venue's oracle: it moves the last bar between candle reads. */
  livePrice?: number | undefined;
  levels: readonly ChartLevel[];
  /** Which side of the liquidation line is the danger zone (below for a long, above for a short). */
  side?: MarginSide | undefined;
  height: number;
  formatValue: (value: number) => string;
  formatTime: (seconds: number) => string;
  accessibilityLabel: string;
  className?: string;
};

const MAX_BARS = 150;
const AXIS_W = 72;
const VOLUME_SHARE = 0.16;
const GAP = 8;
const BODY_SHARE = 0.62;
const MIN_BODY = 1;
const PAD_SHARE = 0.08;
const TICKS = 4;
const HALF = 0.5;
const VOLUME_OPACITY = 0.28;
const ZONE_OPACITY = 0.08;
const LABEL_H = 20;
const LABEL_FONT = 11;
const READOUT_W = 176;
const SCRUB_SLOP = 6;
const SCRUB_VERTICAL = 14;
const DASH = "3 4";
const DOT = "1 4";
const STROKE = 1;
const STROKE_BOLD = 1.5;

export function TradeChart({ candles, livePrice, levels, side, height, formatValue, formatTime, accessibilityLabel, className }: Props) {
  const { t } = useT();
  const colors = useThemeColors();
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);

  // The last bar follows the live price, so the chart ticks between candle reads.
  const bars = React.useMemo(() => {
    const recent = candles.slice(-MAX_BARS);
    const lastBar = recent[recent.length - 1];
    if (!lastBar || livePrice === undefined || !Number.isFinite(livePrice)) return recent;
    return [...recent.slice(0, -1), { ...lastBar, c: livePrice, h: Math.max(lastBar.h, livePrice), l: Math.min(lastBar.l, livePrice) }];
  }, [candles, livePrice]);

  const count = bars.length;
  const plotW = Math.max(width - AXIS_W, 0);
  const volumeH = height * VOLUME_SHARE;
  const priceH = height - volumeH - GAP;

  const scale = React.useMemo(() => {
    const values = [...bars.flatMap((bar) => [bar.h, bar.l]), ...levels.map((level) => level.value)].filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) return null;
    const hi = Math.max(...values);
    const lo = Math.min(...values);
    const pad = (hi - lo || hi) * PAD_SHARE;
    return { top: hi + pad, bottom: Math.max(lo - pad, 0), maxVolume: Math.max(...bars.map((bar) => bar.v), 0) || 1 };
  }, [bars, levels]);

  const y = React.useCallback((value: number) => (scale ? ((scale.top - value) / (scale.top - scale.bottom || 1)) * priceH : 0), [scale, priceH]);
  const slot = count > 0 ? plotW / count : 0;

  const paths = React.useMemo(() => {
    let wicks = "";
    let up = "";
    let down = "";
    let volumeUp = "";
    let volumeDown = "";
    if (!scale || slot === 0) return { wicks, up, down, volumeUp, volumeDown };
    const bodyW = Math.max(slot * BODY_SHARE, MIN_BODY);
    bars.forEach((bar, index) => {
      const x = index * slot + slot * HALF;
      const rising = bar.c >= bar.o;
      wicks += `M${x} ${y(bar.h)}V${y(bar.l)}`;
      const top = y(Math.max(bar.o, bar.c));
      const h = Math.max(Math.abs(y(bar.o) - y(bar.c)), MIN_BODY);
      const body = `M${x - bodyW * HALF} ${top}h${bodyW}v${h}h${-bodyW}Z`;
      const volume = (bar.v / scale.maxVolume) * volumeH;
      const strip = `M${x - bodyW * HALF} ${height - volume}h${bodyW}v${volume}h${-bodyW}Z`;
      if (rising) {
        up += body;
        volumeUp += strip;
      } else {
        down += body;
        volumeDown += strip;
      }
    });
    return { wicks, up, down, volumeUp, volumeDown };
  }, [bars, height, scale, slot, volumeH, y]);

  const select = React.useCallback((index: number | null) => setHover(index), []);
  const indexAt = (x: number) => {
    "worklet";
    if (slot === 0) return 0;
    return Math.max(0, Math.min(count - 1, Math.floor(x / slot)));
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-SCRUB_SLOP, SCRUB_SLOP])
    .failOffsetY([-SCRUB_VERTICAL, SCRUB_VERTICAL])
    .onBegin((event) => scheduleOnRN(select, indexAt(event.x)))
    .onUpdate((event) => scheduleOnRN(select, indexAt(event.x)))
    .onFinalize(() => scheduleOnRN(select, null));
  // A mouse reads the bar under the pointer without a click (web; a no-op on touch screens).
  const hoverGesture = Gesture.Hover()
    .onUpdate((event) => scheduleOnRN(select, indexAt(event.x)))
    .onEnd(() => scheduleOnRN(select, null));
  const gesture = Gesture.Simultaneous(pan, hoverGesture);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const ticks = scale ? Array.from({ length: TICKS }, (_, index) => scale.top - ((scale.top - scale.bottom) * (index + HALF)) / TICKS) : [];
  const active = hover !== null ? bars[hover] : undefined;
  const activeX = hover !== null ? hover * slot + slot * HALF : 0;

  const tone = (kind: ChartLevelKind) =>
    kind === "liquidation" || kind === "stopLoss" ? colors.destructive : kind === "takeProfit" ? colors.success : kind === "entry" ? colors.foreground : colors["muted-foreground"];

  // Labels sit on the price axis; ones that would overlap are nudged apart, in price order.
  const labels = React.useMemo(() => {
    const placed = levels.map((level) => ({ level, top: y(level.value) - LABEL_H * HALF })).sort((a, b) => a.top - b.top);
    for (let index = 1; index < placed.length; index++) {
      const previous = placed[index - 1]!;
      const current = placed[index]!;
      if (current.top < previous.top + LABEL_H) current.top = previous.top + LABEL_H;
    }
    return placed;
  }, [levels, y]);

  const liquidation = levels.find((level) => level.kind === "liquidation");
  const zone = liquidation && side ? (side === "long" ? { top: y(liquidation.value), bottom: priceH } : { top: 0, bottom: y(liquidation.value) }) : undefined;

  return (
    <GestureDetector gesture={gesture}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} onLayout={onLayout} className={cn("relative", className)} style={{ height }}>
        {scale && width > 0 ? (
          <Svg width={width} height={height}>
            {zone ? <Rect x={0} y={zone.top} width={plotW} height={Math.max(zone.bottom - zone.top, 0)} fill={colors.destructive} opacity={ZONE_OPACITY} /> : null}
            {ticks.map((tick) => (
              <Line key={tick} x1={0} x2={plotW} y1={y(tick)} y2={y(tick)} stroke={colors.border} strokeWidth={1} strokeDasharray={DASH} />
            ))}
            <Path d={paths.wicks} stroke={colors["muted-foreground"]} strokeWidth={1} />
            <Path d={paths.up} fill={colors.success} />
            <Path d={paths.down} fill={colors.destructive} />
            <Path d={paths.volumeUp} fill={colors.success} opacity={VOLUME_OPACITY} />
            <Path d={paths.volumeDown} fill={colors.destructive} opacity={VOLUME_OPACITY} />
            {levels.map((level) => (
              <Line
                key={level.kind}
                x1={0}
                x2={plotW}
                y1={y(level.value)}
                y2={y(level.value)}
                stroke={tone(level.kind)}
                strokeWidth={level.kind === "liquidation" || level.kind === "entry" ? STROKE_BOLD : STROKE}
                strokeDasharray={level.kind === "takeProfit" || level.kind === "stopLoss" ? DOT : level.kind === "price" ? DASH : undefined}
              />
            ))}
            {active ? <Line x1={activeX} x2={activeX} y1={0} y2={height} stroke={colors["muted-foreground"]} strokeWidth={1} strokeDasharray={DASH} /> : null}
          </Svg>
        ) : null}
        {scale && width > 0
          ? ticks.map((tick) => (
              <Text key={tick} pointerEvents="none" numberOfLines={1} className="text-muted-foreground absolute font-mono text-[10px] tabular-nums" style={{ top: y(tick) - GAP, end: 0, width: AXIS_W - GAP, textAlign: "right" }}>
                {formatValue(tick)}
              </Text>
            ))
          : null}
        {scale && width > 0
          ? labels.map(({ level, top }) => (
              <View
                key={level.kind}
                pointerEvents="none"
                className={cn("absolute justify-center rounded-md px-1.5", level.kind === "price" ? "bg-foreground" : level.kind === "entry" ? "bg-card border-foreground border" : "bg-card border")}
                style={{ top, end: 0, height: LABEL_H, width: AXIS_W, borderColor: level.kind === "price" || level.kind === "entry" ? undefined : tone(level.kind) }}
              >
                <Text numberOfLines={1} className={cn("font-mono tabular-nums", level.kind === "price" ? "text-background" : "text-foreground")} style={{ fontSize: LABEL_FONT }}>
                  {formatValue(level.value)}
                </Text>
              </View>
            ))
          : null}
        {scale && width > 0
          ? labels
              .filter(({ level }) => level.kind !== "price")
              .map(({ level, top }) => (
                <Text
                  key={`tag-${level.kind}`}
                  pointerEvents="none"
                  numberOfLines={1}
                  className="absolute font-semibold"
                  style={{ top, end: AXIS_W + GAP * HALF, lineHeight: LABEL_H, fontSize: LABEL_FONT, color: tone(level.kind) }}
                >
                  {level.label}
                </Text>
              ))
          : null}
        {active ? (
          <View pointerEvents="none" className="bg-card border-border absolute top-2 gap-0.5 rounded-xl border px-2.5 py-1.5" style={activeX > plotW * HALF ? { start: GAP, width: READOUT_W } : { end: AXIS_W + GAP, width: READOUT_W }}>
            <Text className="text-muted-foreground text-[11px]">{formatTime(active.t)}</Text>
            <Text className={cn("font-mono text-[11px] tabular-nums", active.c >= active.o ? "text-success" : "text-destructive")}>{t("desktop.ohlcOpenClose", { open: formatValue(active.o), close: formatValue(active.c) })}</Text>
            <Text className="text-muted-foreground font-mono text-[11px] tabular-nums">{t("desktop.ohlcHighLow", { high: formatValue(active.h), low: formatValue(active.l) })}</Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}
