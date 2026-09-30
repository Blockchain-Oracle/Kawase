// The paper plane in brushed silver: Kawase's send object. Three facets with the light on different sides so the
// folds read; the shaded facet carries the stipple. Static; fly it with a wrapper.
import Svg, { G, Path } from "react-native-svg";

import { SILVER, StippleDefs, StippleShape } from "./stipple";

export const PLANE_VIEWBOX = { width: 240, height: 160 };
// Nose at the trailing top, tail at the leading bottom, so it flies "away" to the end side.
const BODY = "M232 18 L118 148 L104 96 Z";
const TOP_WING = "M232 18 L14 78 L104 96 Z";
const FOLD = "M232 18 L104 96 L126 118 Z";
const FOLD_LINE = "M104 96 L232 18";

type PaperPlaneProps = {
  width?: number;
  id?: string;
};

const DEFAULT_WIDTH = 180;

export function PaperPlane({ width = DEFAULT_WIDTH, id = "plane" }: PaperPlaneProps) {
  const height = (width * PLANE_VIEWBOX.height) / PLANE_VIEWBOX.width;
  const box = { x: 0, y: 0, width: PLANE_VIEWBOX.width, height: PLANE_VIEWBOX.height };
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${PLANE_VIEWBOX.width} ${PLANE_VIEWBOX.height}`}>
      <StippleDefs id={`${id}-a`} palette={SILVER} lightAngle={110} box={box} />
      <StippleDefs id={`${id}-b`} palette={SILVER} lightAngle={250} box={box} />
      <StippleDefs id={`${id}-c`} palette={SILVER} lightAngle={40} box={box} />
      <G>
        <StippleShape id={`${id}-b`} d={BODY} rim={1} />
        <StippleShape id={`${id}-a`} d={TOP_WING} rim={1} />
        <StippleShape id={`${id}-c`} d={FOLD} rim={1} />
        <Path d={FOLD_LINE} stroke={SILVER.glint} strokeWidth={1.2} opacity={0.7} fill="none" />
      </G>
    </Svg>
  );
}

export type { PaperPlaneProps };
