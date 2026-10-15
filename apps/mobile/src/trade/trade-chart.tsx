// The one candle chart of the app (native twin of 21st.dev ssychui "Candle Chart", ids 20107 / 22250; the desktop docs
// pack's choice: react-native-svg, one drawing for iOS, Android and the web, SSR-safe, no WASM). The terminal draws it
// with the trade's levels and the token page with none; packages/ui-native's older candle-chart is no longer used.
// The price range follows the candles; a level far outside them is pinned to the edge (below).
// Candles over a volume strip, the live price ticking on the last bar, and the trade's levels drawn rather than
// written: the entry, the liquidation price with the zone past it washed in the down colour, and take-profit /
// stop-loss as dotted lines. A finger (pan) or a mouse (hover, web) reads the bar under it, and `onScrub` hands it to the page. Colours
// are the kit's tokens (up / down for direction only, the readout says the numbers so colour is never alone).
import * as React from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { Candle, MarginSide } from "@kawase/api-client";

import { NUMERIC_VARIANT, RADIUS, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";

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
  /** The price axis's gridline labels (72 px): shorter than `formatValue` ("$83,096", not "$83,096.12" cut off). */
  formatAxis?: (value: number) => string;
  formatTime: (seconds: number) => string;
  accessibilityLabel: string;
  /** The bar under the pointer or finger, and null when it leaves (a page's hero price can follow it). */
  onScrub?: (candle: Candle | null) => void;
};

const MAX_BARS = 150;
const AXIS_W = 72;
const VOLUME_SHARE = 0.16;
const GAP = 8;
const BODY_SHARE = 0.62;
const MIN_BODY = 1;
const PAD_SHARE = 0.08;
/** A level this far past the candles' range (as a share of it) still widens the range; farther ones are pinned. */
const LEVEL_REACH = 0.35;
/** A flat series' stand-in range, as a share of its price. */
const FLAT_SPAN = 0.01;
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

export function TradeChart({ candles, livePrice, levels, side, height, formatValue, formatAxis = formatValue, formatTime, accessibilityLabel, onScrub }: Props) {
  const { t } = useT();
  const { color } = useTheme();
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

  // The range is the candles'. A level near them widens it; one far off (a 2x liquidation, ~50% away) stays pinned to
  // the edge as a pill with an arrow, so choosing a side or typing an amount never squashes the candles into a band.
  const scale = React.useMemo(() => {
    const values = bars.flatMap((bar) => [bar.h, bar.l]).filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) return null;
    let hi = Math.max(...values);
    let lo = Math.min(...values);
    const reach = (hi - lo || hi * FLAT_SPAN) * LEVEL_REACH;
    for (const level of levels) {
      if (!Number.isFinite(level.value) || level.value <= 0 || level.value > hi + reach || level.value < lo - reach) continue;
      hi = Math.max(hi, level.value);
      lo = Math.min(lo, level.value);
    }
    const pad = (hi - lo || hi) * PAD_SHARE;
    return { top: hi + pad, bottom: Math.max(lo - pad, 0), maxVolume: Math.max(...bars.map((bar) => bar.v), 0) || 1 };
  }, [bars, levels]);
  const within = React.useCallback((value: number) => (scale ? value <= scale.top && value >= scale.bottom : false), [scale]);

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

  const barsRef = React.useRef(bars);
  barsRef.current = bars;
  const select = React.useCallback(
    (index: number | null) => {
      setHover(index);
      onScrub?.(index === null ? null : (barsRef.current[index] ?? null));
    },
    [onScrub],
  );
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

  const tone = (kind: ChartLevelKind) => (kind === "liquidation" || kind === "stopLoss" ? color.down : kind === "takeProfit" ? color.up : kind === "entry" ? color.ink : color.text3);

  // Labels sit on the price axis; ones that would overlap are nudged apart, in price order.
  const labels = React.useMemo(() => {
    const placed = levels
      .map((level) => ({ level, pinned: within(level.value) ? null : scale && level.value > scale.top ? ("above" as const) : ("below" as const) }))
      .map(({ level, pinned }) => ({ level, pinned, top: pinned === "above" ? 0 : pinned === "below" ? priceH - LABEL_H : y(level.value) - LABEL_H * HALF }))
      .sort((a, b) => a.top - b.top);
    for (let index = 1; index < placed.length; index++) {
      const previous = placed[index - 1]!;
      const current = placed[index]!;
      if (current.top < previous.top + LABEL_H) current.top = previous.top + LABEL_H;
    }
    return placed;
  }, [levels, y, within, scale, priceH]);

  const liquidation = levels.find((level) => level.kind === "liquidation" && within(level.value));
  const zone = liquidation && side ? (side === "long" ? { top: y(liquidation.value), bottom: priceH } : { top: 0, bottom: y(liquidation.value) }) : undefined;
  const drawn = Boolean(scale) && width > 0;

  return (
    <GestureDetector gesture={gesture}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={{ height }}>
        {drawn ? (
          <Svg width={width} height={height}>
            {zone ? <Rect x={0} y={zone.top} width={plotW} height={Math.max(zone.bottom - zone.top, 0)} fill={color.down} opacity={ZONE_OPACITY} /> : null}
            {ticks.map((tick) => (
              <Line key={tick} x1={0} x2={plotW} y1={y(tick)} y2={y(tick)} stroke={color.hairline} strokeWidth={STROKE} strokeDasharray={DASH} />
            ))}
            <Path d={paths.wicks} stroke={color.text3} strokeWidth={STROKE} />
            <Path d={paths.up} fill={color.up} />
            <Path d={paths.down} fill={color.down} />
            <Path d={paths.volumeUp} fill={color.up} opacity={VOLUME_OPACITY} />
            <Path d={paths.volumeDown} fill={color.down} opacity={VOLUME_OPACITY} />
            {levels.filter((level) => within(level.value)).map((level) => (
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
            {active ? <Line x1={activeX} x2={activeX} y1={0} y2={height} stroke={color.text3} strokeWidth={STROKE} strokeDasharray={DASH} /> : null}
          </Svg>
        ) : null}
        {drawn
          ? ticks.map((tick) => (
              <Text key={tick} pointerEvents="none" numberOfLines={1} style={[TYPE.micro, { position: "absolute", color: color.text3, fontVariant: NUMERIC_VARIANT, top: y(tick) - GAP, end: 0, width: AXIS_W - GAP, textAlign: "right" }]}>
                {formatAxis(tick)}
              </Text>
            ))
          : null}
        {drawn
          ? labels.map(({ level, top, pinned }) => (
              <View
                key={level.kind}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  justifyContent: "center",
                  borderRadius: RADIUS.xs,
                  paddingHorizontal: SPACE.xs,
                  top,
                  end: 0,
                  height: LABEL_H,
                  width: AXIS_W,
                  backgroundColor: level.kind === "price" ? color.ink : color.card,
                  borderWidth: level.kind === "price" ? 0 : STROKE,
                  borderColor: tone(level.kind),
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: LABEL_FONT, fontVariant: NUMERIC_VARIANT, color: level.kind === "price" ? color.ground : color.ink }}>
                  {pinned === "above" ? "↑ " : pinned === "below" ? "↓ " : ""}
                  {formatValue(level.value)}
                </Text>
              </View>
            ))
          : null}
        {drawn
          ? labels
              .filter(({ level }) => level.kind !== "price")
              .map(({ level, top }) => (
                <Text key={`tag-${level.kind}`} pointerEvents="none" numberOfLines={1} style={[TYPE.micro, { position: "absolute", top, end: AXIS_W + GAP * HALF, lineHeight: LABEL_H, color: tone(level.kind) }]}>
                  {level.label}
                </Text>
              ))
          : null}
        {active ? (
          <View
            pointerEvents="none"
            style={[
              { position: "absolute", top: SPACE.sm, gap: SPACE.xxs, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs, backgroundColor: color.raised2 },
              activeX > plotW * HALF ? { start: GAP, width: READOUT_W } : { end: AXIS_W + GAP, width: READOUT_W },
            ]}
          >
            <Text style={[TYPE.micro, { color: color.text3 }]}>{formatTime(active.t)}</Text>
            <Text style={[TYPE.micro, { fontVariant: NUMERIC_VARIANT, color: active.c >= active.o ? color.up : color.down }]}>{t("desktop.ohlcOpenClose", { open: formatValue(active.o), close: formatValue(active.c) })}</Text>
            <Text style={[TYPE.micro, { fontVariant: NUMERIC_VARIANT, color: color.text3 }]}>{t("desktop.ohlcHighLow", { high: formatValue(active.h), low: formatValue(active.l) })}</Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}
