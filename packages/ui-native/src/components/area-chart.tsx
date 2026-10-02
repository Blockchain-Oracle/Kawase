// The Balance Chart's native twin (21st.dev 30538 · ssychui, ShapeShift's BalanceChart in plain SVG): an area whose
// line colour follows the trend (mint up, red down), a fill that fades to nothing, the high and the low floating at
// their real points instead of a y-axis, and a finger that scrubs a readout along the line. Drawn with
// react-native-svg so it reads the theme's hex tokens; the scrub runs on the UI thread and only crosses to React
// when the index changes. Also the token page's price line (the candles live in `CandleChart`).
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

type ChartPoint = { t: number; v: number };

type AreaChartProps = {
  points: readonly ChartPoint[];
  height?: number;
  /** Theme hex colours: the up and down line, the extremes' text, the scrub line. */
  colors: { up: string; down: string; muted: string; scrub: string };
  /** The trend that picks the colour; by default the first point against the last. */
  trend?: "up" | "down";
  formatValue: (value: number) => string;
  /** Called with the point under the finger, and with null when it lifts. */
  onScrub?: (point: ChartPoint | null) => void;
  /** Spoken summary of the chart. */
  accessibilityLabel: string;
  className?: string;
};

const DEFAULT_HEIGHT = 180;
const STROKE = 2;
const TOP_PAD = 22;
const BOTTOM_PAD = 18;
const FILL_TOP_OPACITY = 0.16;
const DOT = 7;
const HALF = 0.5;
const SCRUB_SLOP = 6;
const EDGE_SHARE = 0.12;
const LABEL_WIDTH = 96;
const SIXTH = 6;
/** Decimal places in an SVG path coordinate. */
const PATH_DP = 2;
const SPARK_DP = 1;
/** The scrub gives way to a vertical scroll after this much vertical travel. */
const SCRUB_VERTICAL = 12;
const LABEL_NUDGE = 2;
const SPARK_STROKE = 1.5;
const MIN_POINTS = 2;

/** Catmull-Rom through the points as cubic Béziers: one smooth stroke. */
function smoothPath(pts: readonly { x: number; y: number }[]) {
  if (pts.length < MIN_POINTS) return "";
  let d = `M${pts[0]!.x.toFixed(PATH_DP)},${pts[0]!.y.toFixed(PATH_DP)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + MIN_POINTS] ?? p2;
    d += ` C${(p1.x + (p2.x - p0.x) / SIXTH).toFixed(PATH_DP)},${(p1.y + (p2.y - p0.y) / SIXTH).toFixed(PATH_DP)} ${(p2.x - (p3.x - p1.x) / SIXTH).toFixed(PATH_DP)},${(p2.y - (p3.y - p1.y) / SIXTH).toFixed(PATH_DP)} ${p2.x.toFixed(PATH_DP)},${p2.y.toFixed(PATH_DP)}`;
  }
  return d;
}

function AreaChart({ points, height = DEFAULT_HEIGHT, colors, trend, formatValue, onScrub, accessibilityLabel, className }: AreaChartProps) {
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const gradientId = React.useId().replace(/:/g, "");

  const shape = React.useMemo(() => {
    if (width === 0 || points.length < MIN_POINTS) return null;
    const values = points.map((point) => point.v);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const xy = points.map((point, index) => ({
      x: (index / (points.length - 1)) * width,
      y: height - BOTTOM_PAD - ((point.v - lo) / span) * (height - TOP_PAD - BOTTOM_PAD),
    }));
    const line = smoothPath(xy);
    return { xy, line, area: `${line} L${width},${height} L0,${height} Z`, lo, hi, iLo: values.indexOf(lo), iHi: values.indexOf(hi) };
  }, [points, width, height]);

  const up = trend ? trend === "up" : (points.at(-1)?.v ?? 0) >= (points[0]?.v ?? 0);
  const hue = up ? colors.up : colors.down;
  const count = points.length;

  const select = React.useCallback(
    (index: number | null) => {
      setHover(index);
      onScrub?.(index === null ? null : (points[index] ?? null));
    },
    [onScrub, points],
  );

  const indexAt = (x: number) => {
    "worklet";
    if (width === 0 || count < MIN_POINTS) return 0;
    return Math.max(0, Math.min(count - 1, Math.round((x / width) * (count - 1))));
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-SCRUB_SLOP, SCRUB_SLOP])
    .failOffsetY([-SCRUB_VERTICAL, SCRUB_VERTICAL])
    .onBegin((event) => scheduleOnRN(select, indexAt(event.x)))
    .onUpdate((event) => scheduleOnRN(select, indexAt(event.x)))
    .onFinalize(() => scheduleOnRN(select, null));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const hovered = hover !== null && shape ? shape.xy[hover] : null;
  const edge = (x: number) => (x / Math.max(width, 1) <= EDGE_SHARE ? { start: 0 } : x / Math.max(width, 1) >= 1 - EDGE_SHARE ? { end: 0 } : { start: x - LABEL_WIDTH * HALF });

  return (
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} onLayout={onLayout} className={cn("relative", className)} style={{ height }}>
        {shape ? (
          <>
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={hue} stopOpacity={FILL_TOP_OPACITY} />
                  <Stop offset="1" stopColor={hue} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={shape.area} fill={`url(#${gradientId})`} />
              <Path d={shape.line} fill="none" stroke={hue} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
              {hovered ? <Path d={`M${hovered.x},0 L${hovered.x},${height}`} stroke={colors.scrub} strokeWidth={1} strokeDasharray="4 4" /> : null}
            </Svg>
            {hovered ? (
              <View
                pointerEvents="none"
                className="absolute rounded-full"
                style={{ width: DOT, height: DOT, left: hovered.x - DOT * HALF, top: hovered.y - DOT * HALF, backgroundColor: hue }}
              />
            ) : (
              <>
                <Text pointerEvents="none" className="absolute font-mono text-[11px]" style={{ ...edge(shape.xy[shape.iHi]!.x), width: LABEL_WIDTH, top: shape.xy[shape.iHi]!.y - TOP_PAD + LABEL_NUDGE, color: colors.muted, textAlign: "center" }}>
                  {formatValue(shape.hi)}
                </Text>
                <Text pointerEvents="none" className="absolute font-mono text-[11px]" style={{ ...edge(shape.xy[shape.iLo]!.x), width: LABEL_WIDTH, top: shape.xy[shape.iLo]!.y + DOT, color: colors.muted, textAlign: "center" }}>
                  {formatValue(shape.lo)}
                </Text>
              </>
            )}
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

type SparklineProps = { values: readonly number[]; width: number; height: number; colors: { up: string; down: string } };

/** A row's 24-hour line: no fill, no labels, coloured by its own trend. */
function Sparkline({ values, width, height, colors }: SparklineProps) {
  if (values.length < MIN_POINTS) return <View style={{ width, height }} />;
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  const d = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${((index / (values.length - 1)) * width).toFixed(SPARK_DP)},${(height - ((value - lo) / span) * height).toFixed(SPARK_DP)}`)
    .join(" ");
  const up = values.at(-1)! >= values[0]!;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} fill="none" stroke={up ? colors.up : colors.down} strokeWidth={SPARK_STROKE} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

type RangePillsProps<R extends string> = {
  ranges: readonly R[];
  value: R;
  onChange: (range: R) => void;
  /** Spoken name of the group. */
  label: string;
  className?: string;
};

/** The Range Navigator's pills (21st.dev 23954 · ssychui): one row of ranges, the chosen one filled. */
function RangePills<R extends string>({ ranges, value, onChange, label, className }: RangePillsProps<R>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} className={cn("flex-row items-center justify-between gap-1", className)}>
      {ranges.map((range) => {
        const active = range === value;
        return (
          <Text
            key={range}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(range)}
            className={cn("rounded-full px-3 py-1.5 font-mono text-xs", active ? "bg-secondary text-foreground" : "text-muted-foreground")}
            suppressHighlighting
          >
            {range}
          </Text>
        );
      })}
    </View>
  );
}

export { AreaChart, RangePills, Sparkline };
export type { AreaChartProps, ChartPoint, RangePillsProps, SparklineProps };
