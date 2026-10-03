// Native twin of 21st.dev ssychui "Candle Chart" (#64, id 20107; plan §C's Trading Terminal pick): a trading terminal's
// price panel in the ink language — OHLC candles over a volume strip, a price axis of three ticks, and a crosshair
// that reads the exact bar under the finger (open, high, low, close). Direction is the only thing that carries hue
// (mint up, red down; never colour alone: the readout says the numbers). Drawn with react-native-svg so it reads the
// theme's hex tokens; the scrub runs on the UI thread and crosses to React only when the bar changes.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Line, Rect } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

export type CandlePoint = { t: number; o: number; h: number; l: number; c: number; v: number };

type CandleChartProps = {
  candles: readonly CandlePoint[];
  height?: number;
  /** Theme hex colours: up and down candles, axis text, grid lines, the crosshair. */
  colors: { up: string; down: string; muted: string; grid: string; scrub: string };
  formatValue: (value: number) => string;
  /** The bar under the finger, and null when it lifts. */
  onScrub?: (candle: CandlePoint | null) => void;
  /** Spoken summary of the chart. */
  accessibilityLabel: string;
  className?: string;
};

const DEFAULT_HEIGHT = 220;
const AXIS_W = 56;
const VOLUME_SHARE = 0.18;
const GAP = 6;
const BODY_SHARE = 0.62;
const MIN_BODY = 1;
const WICK = 1;
const PAD = 0.06;
const TICKS = 3;
const VOLUME_OPACITY = 0.35;
const SCRUB_SLOP = 6;
const SCRUB_VERTICAL = 12;
const HALF = 0.5;
const READOUT_WIDTH = 168;
const EDGE_SHARE = 0.5;

function CandleChart({ candles, height = DEFAULT_HEIGHT, colors, formatValue, onScrub, accessibilityLabel, className }: CandleChartProps) {
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const count = candles.length;
  const plotW = Math.max(width - AXIS_W, 0);
  const volumeH = height * VOLUME_SHARE;
  const priceH = height - volumeH - GAP;

  const scale = React.useMemo(() => {
    if (count === 0) return null;
    const hi = Math.max(...candles.map((candle) => candle.h));
    const lo = Math.min(...candles.map((candle) => candle.l));
    const pad = (hi - lo || hi || 1) * PAD;
    const top = hi + pad;
    const bottom = Math.max(lo - pad, 0);
    const maxVolume = Math.max(...candles.map((candle) => candle.v), 0) || 1;
    return { top, bottom, maxVolume };
  }, [candles, count]);

  const slot = count > 0 ? plotW / count : 0;
  const y = (value: number) => (scale ? ((scale.top - value) / (scale.top - scale.bottom || 1)) * priceH : 0);

  const select = React.useCallback(
    (index: number | null) => {
      setHover(index);
      onScrub?.(index === null ? null : (candles[index] ?? null));
    },
    [candles, onScrub],
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

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const ticks = scale ? Array.from({ length: TICKS }, (_, index) => scale.top - ((scale.top - scale.bottom) * (index + HALF)) / TICKS) : [];
  const active = hover !== null ? candles[hover] : undefined;
  const activeX = hover !== null ? hover * slot + slot * HALF : 0;

  return (
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} onLayout={onLayout} className={cn("relative", className)} style={{ height }}>
        {scale && width > 0 ? (
          <Svg width={width} height={height}>
            {ticks.map((tick) => (
              <Line key={tick} x1={0} x2={plotW} y1={y(tick)} y2={y(tick)} stroke={colors.grid} strokeWidth={1} strokeDasharray="2 4" />
            ))}
            {candles.map((candle, index) => {
              const x = index * slot + slot * HALF;
              const up = candle.c >= candle.o;
              const hue = up ? colors.up : colors.down;
              const bodyTop = y(Math.max(candle.o, candle.c));
              const bodyH = Math.max(Math.abs(y(candle.o) - y(candle.c)), MIN_BODY);
              const bodyW = Math.max(slot * BODY_SHARE, MIN_BODY);
              const volume = (candle.v / scale.maxVolume) * volumeH;
              return (
                <React.Fragment key={candle.t}>
                  <Line x1={x} x2={x} y1={y(candle.h)} y2={y(candle.l)} stroke={hue} strokeWidth={WICK} />
                  <Rect x={x - bodyW * HALF} y={bodyTop} width={bodyW} height={bodyH} fill={hue} rx={1} />
                  <Rect x={x - bodyW * HALF} y={height - volume} width={bodyW} height={volume} fill={hue} opacity={VOLUME_OPACITY} />
                </React.Fragment>
              );
            })}
            {active ? <Line x1={activeX} x2={activeX} y1={0} y2={height} stroke={colors.scrub} strokeWidth={1} strokeDasharray="4 4" /> : null}
          </Svg>
        ) : null}
        {scale && width > 0
          ? ticks.map((tick) => (
              <Text key={tick} pointerEvents="none" numberOfLines={1} className="absolute text-[10px]" style={{ color: colors.muted, top: y(tick) - GAP, end: 0, width: AXIS_W - GAP, textAlign: "right" }}>
                {formatValue(tick)}
              </Text>
            ))
          : null}
        {active ? (
          <View
            pointerEvents="none"
            className="bg-card border-border absolute top-0 gap-0.5 rounded-xl border px-2.5 py-1.5"
            style={activeX / Math.max(plotW, 1) > EDGE_SHARE ? { start: 0, width: READOUT_WIDTH } : { end: AXIS_W, width: READOUT_WIDTH }}
          >
            <Text className="text-[11px]" style={{ color: active.c >= active.o ? colors.up : colors.down }}>
              {`O ${formatValue(active.o)}  C ${formatValue(active.c)}`}
            </Text>
            <Text className="text-[11px]" style={{ color: colors.muted }}>
              {`H ${formatValue(active.h)}  L ${formatValue(active.l)}`}
            </Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

export { CandleChart };
export type { CandleChartProps };
