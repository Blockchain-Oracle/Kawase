// The 為替 letterforms as paths, laid out side by side (or stacked), for stamps, seals and the brand mark.
import { G, Path } from "react-native-svg";

import { GLYPH_BOX, KAWASE_GLYPHS } from "./glyphs";

type KawaseGlyphsProps = {
  /** Height of one glyph in the parent's viewBox units. */
  size: number;
  /** Top-start corner of the first glyph. */
  x: number;
  y: number;
  /** Space between the glyphs, in the same units. */
  gap?: number;
  /** "row" = 為 then 替 across; "column" = 為 above 替. */
  layout?: "row" | "column";
  fill: string;
  /** An offset copy underneath in this colour gives an engraved/embossed edge. */
  relief?: { color: string; dx: number; dy: number; opacity?: number };
  opacity?: number;
};

const DEFAULT_GAP_RATIO = 0.08;

export function KawaseGlyphs({ size, x, y, gap, layout = "row", fill, relief, opacity }: KawaseGlyphsProps) {
  const scale = size / GLYPH_BOX;
  const step = size + (gap ?? size * DEFAULT_GAP_RATIO);
  const second = layout === "row" ? { x: x + step, y } : { x, y: y + step };
  const glyph = (key: string, d: string, gx: number, gy: number, color: string, alpha?: number) => (
    <G key={key} transform={`translate(${gx} ${gy}) scale(${scale})`}>
      <Path d={d} fill={color} opacity={alpha} />
    </G>
  );
  return (
    <G opacity={opacity}>
      {relief ? glyph("kawa-relief", KAWASE_GLYPHS.kawa, x + relief.dx, y + relief.dy, relief.color, relief.opacity) : null}
      {relief ? glyph("se-relief", KAWASE_GLYPHS.se, second.x + relief.dx, second.y + relief.dy, relief.color, relief.opacity) : null}
      {glyph("kawa", KAWASE_GLYPHS.kawa, x, y, fill)}
      {glyph("se", KAWASE_GLYPHS.se, second.x, second.y, fill)}
    </G>
  );
}

export type { KawaseGlyphsProps };
