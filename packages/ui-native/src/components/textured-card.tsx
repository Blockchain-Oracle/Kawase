// The textured black card (Solflare S15's material, in Kawase's tokens): a `card` surface with a moiré of thin
// wave lines in the `texture` colour that fades towards the trailing edge, a hairline border and the big
// radius. Balances and receipts live on it. The texture is an SVG pattern behind the content, so it costs one
// draw and works on both platforms; it is still with reduced motion because it never moves.
import { cn } from "@kawase/ui-native/lib/utils";
import { View, type ViewProps } from "react-native";
import Svg, { Defs, LinearGradient, Mask, Path, Pattern, Rect, Stop } from "react-native-svg";

const WAVE_WIDTH = 96;
const WAVE_HEIGHT = 14;
const WAVE_ROWS = 4;
const LINE_WIDTH = 0.8;
const HALF = 0.5;
const QUARTER = 0.25;
/** Wave amplitude as a fraction of the row height. */
const AMPLITUDE = 0.35;

/** One row of a sine-like wave, repeated by the pattern. */
const wavePath = (row: number) => {
  const y = WAVE_HEIGHT * row + WAVE_HEIGHT * HALF;
  const q = WAVE_WIDTH * QUARTER;
  const amp = WAVE_HEIGHT * AMPLITUDE;
  return `M0 ${y} Q${q} ${y - amp} ${WAVE_WIDTH * HALF} ${y} T${WAVE_WIDTH} ${y}`;
};
const WAVES = Array.from({ length: WAVE_ROWS }, (_, row) => wavePath(row)).join(" ");

type TexturedCardProps = ViewProps & {
  /** Line colour, normally the `texture` token as hex. */
  lineColor: string;
  className?: string;
};

function TexturedCard({ lineColor, className, children, style, ...props }: TexturedCardProps) {
  return (
    <View className={cn("bg-card border-border relative overflow-hidden rounded-lg border", className)} style={style} {...props}>
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern id="waves" patternUnits="userSpaceOnUse" width={WAVE_WIDTH} height={WAVE_HEIGHT * WAVE_ROWS}>
              <Path d={WAVES} stroke={lineColor} strokeWidth={LINE_WIDTH} fill="none" />
            </Pattern>
            <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.25" />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.15" />
            </LinearGradient>
            <Mask id="fade-mask" maskUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
              <Rect width="100%" height="100%" fill="url(#fade)" />
            </Mask>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#waves)" mask="url(#fade-mask)" />
        </Svg>
      </View>
      {children}
    </View>
  );
}

export { TexturedCard };
export type { TexturedCardProps };
