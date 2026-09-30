// The Kawase brand mark: 為 above 替 in a rounded ink tile with a lime seal ring — the dock centre when the orb is
// idle, the story's last panel, the completion flag's companion, the QR centre. `mono` draws the glyphs alone in
// one colour (for chips and small contexts). The same geometry is exported as packages/identity/svg/kawase*.svg.
import { tokens } from "@kawase/ui-tokens";
import Svg, { G, Rect } from "react-native-svg";

import { KawaseGlyphs } from "./kawase-glyphs";

export const MARK_VIEWBOX = 200;
const TILE_RADIUS = 48;
const RING_INSET = 16;
const RING_WIDTH = 6;
const RING_RADIUS = TILE_RADIUS - RING_INSET;
const GLYPH_SIZE = 62;
const GLYPH_GAP = 6;
const HALF = 0.5;

type KawaseMarkProps = {
  size?: number;
  /** Glyphs only, in this colour. */
  mono?: string;
  ink?: string;
  lime?: string;
};

const DEFAULT_SIZE = 64;

export function KawaseMark({ size = DEFAULT_SIZE, mono, ink = tokens.themes.dark.background, lime = tokens.themes.dark.primary }: KawaseMarkProps) {
  const column = GLYPH_SIZE * 2 + GLYPH_GAP;
  const x = MARK_VIEWBOX * HALF - GLYPH_SIZE * HALF;
  const y = MARK_VIEWBOX * HALF - column * HALF;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}>
      {mono ? (
        <KawaseGlyphs size={GLYPH_SIZE} gap={GLYPH_GAP} layout="column" x={x} y={y} fill={mono} />
      ) : (
        <G>
          <Rect width={MARK_VIEWBOX} height={MARK_VIEWBOX} rx={TILE_RADIUS} fill={ink} />
          <Rect
            x={RING_INSET}
            y={RING_INSET}
            width={MARK_VIEWBOX - RING_INSET * 2}
            height={MARK_VIEWBOX - RING_INSET * 2}
            rx={RING_RADIUS}
            fill="none"
            stroke={lime}
            strokeWidth={RING_WIDTH}
          />
          <KawaseGlyphs size={GLYPH_SIZE} gap={GLYPH_GAP} layout="column" x={x} y={y} fill={lime} />
        </G>
      )}
    </Svg>
  );
}

export type { KawaseMarkProps };
