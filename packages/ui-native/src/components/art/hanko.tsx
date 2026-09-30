// The hanko (判子): a vermilion seal impression reading 為替, Kawase's "approved" object (the allowance, Face ID,
// completion). Drawn as the impression, not the stamp: a slightly rotated ring with the glyphs inside and the
// stipple texture so it reads as ink on paper. Static; scale it in with a wrapper.
import Svg, { Circle, G } from "react-native-svg";

import { KawaseGlyphs } from "./kawase-glyphs";
import { StippleDefs, StippleShape, VERMILION } from "./stipple";

export const HANKO_VIEWBOX = { width: 160, height: 160 };
const C = 80;
const R = 72;
const RING_INSET = 8;
const RING_WIDTH = 3;
const GLYPH_SIZE = 46;
const GLYPH_GAP = 4;
const TILT = -8;
const HALF = 0.5;

const circlePath = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

type HankoProps = {
  size?: number;
  id?: string;
  /** The paper/ink colour for the glyphs and ring (default: the pale glint). */
  paper?: string;
};

const DEFAULT_SIZE = 120;

export function Hanko({ size = DEFAULT_SIZE, id = "hanko", paper = VERMILION.glint }: HankoProps) {
  const glyphX = C - GLYPH_SIZE - GLYPH_GAP * HALF;
  const glyphY = C - GLYPH_SIZE * HALF;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${HANKO_VIEWBOX.width} ${HANKO_VIEWBOX.height}`}>
      <StippleDefs id={id} palette={VERMILION} lightAngle={120} sheen={0} box={{ x: 0, y: 0, width: HANKO_VIEWBOX.width, height: HANKO_VIEWBOX.height }} />
      <G transform={`rotate(${TILT} ${C} ${C})`}>
        <StippleShape id={id} d={circlePath(C, C, R)} rim={0}>
          <Circle cx={C} cy={C} r={R - RING_INSET} fill="none" stroke={paper} strokeWidth={RING_WIDTH} opacity={0.9} />
          <KawaseGlyphs size={GLYPH_SIZE} gap={GLYPH_GAP} x={glyphX} y={glyphY} fill={paper} opacity={0.95} />
        </StippleShape>
      </G>
    </Svg>
  );
}

export type { HankoProps };
