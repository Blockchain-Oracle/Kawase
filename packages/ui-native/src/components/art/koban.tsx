// The koban (小判): an oval Edo-period coin, Kawase's money object. Stippled metal, a ridged edge and the 為替
// stamp engraved in the centre. Silver by default, gold for the "funded" moment. Static; float it with a wrapper.
import Svg, { Ellipse, G } from "react-native-svg";

import { GOLD, SILVER, StippleDefs, StippleShape, type Palette } from "./stipple";
import { KawaseGlyphs } from "./kawase-glyphs";

export const KOBAN_VIEWBOX = { width: 240, height: 160 };
const CX = 120;
const CY = 80;
const RX = 108;
const RY = 66;
const RIDGE_INSET = 9;
const RIDGE_DASH = "3 4";
const RIDGE_WIDTH = 2;
const GLYPH_SIZE = 56;
const GLYPH_GAP = 10;
const RELIEF = 1.4;
const HALF = 0.5;

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;

type KobanProps = {
  /** Width in points; the height follows the coin's proportions. */
  width?: number;
  metal?: "silver" | "gold";
  /** Whether the 為替 stamp shows (the coins under the top one in a stack are plain). */
  stamped?: boolean;
  /** Unique per instance when several kobans share a screen. */
  id?: string;
  rotate?: number;
};

const DEFAULT_WIDTH = 160;

export function Koban({ width = DEFAULT_WIDTH, metal = "silver", stamped = true, id = "koban", rotate = 0 }: KobanProps) {
  const palette: Palette = metal === "gold" ? GOLD : SILVER;
  const height = (width * KOBAN_VIEWBOX.height) / KOBAN_VIEWBOX.width;
  const glyphX = CX - GLYPH_SIZE - GLYPH_GAP * HALF;
  const glyphY = CY - GLYPH_SIZE * HALF;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${KOBAN_VIEWBOX.width} ${KOBAN_VIEWBOX.height}`}>
      <StippleDefs id={id} palette={palette} box={{ x: 0, y: 0, width: KOBAN_VIEWBOX.width, height: KOBAN_VIEWBOX.height }} />
      <G transform={`rotate(${rotate} ${CX} ${CY})`}>
        <StippleShape id={id} d={ellipsePath(CX, CY, RX, RY)}>
          {/* The ridged edge: a dashed inner ellipse in the shade colour with a light twin. */}
          <Ellipse cx={CX} cy={CY} rx={RX - RIDGE_INSET} ry={RY - RIDGE_INSET} fill="none" stroke={palette.deep} strokeWidth={RIDGE_WIDTH} strokeDasharray={RIDGE_DASH} opacity={0.7} />
          <Ellipse cx={CX} cy={CY - 1} rx={RX - RIDGE_INSET} ry={RY - RIDGE_INSET} fill="none" stroke={palette.glint} strokeWidth={1} strokeDasharray={RIDGE_DASH} opacity={0.35} />
          {stamped ? (
            <KawaseGlyphs
              size={GLYPH_SIZE}
              gap={GLYPH_GAP}
              x={glyphX}
              y={glyphY}
              fill={palette.deep}
              relief={{ color: palette.glint, dx: RELIEF, dy: RELIEF, opacity: 0.55 }}
            />
          ) : null}
        </StippleShape>
      </G>
    </Svg>
  );
}

export type { KobanProps };
