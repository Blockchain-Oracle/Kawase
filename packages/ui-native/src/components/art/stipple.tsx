// The stipple/engraving material shared by Kawase's art objects (the technique behind the references' "silver"
// renders: monochrome dots whose density follows the light). One helper draws a shape three times — the metal
// gradient, a dot pattern masked so the dots fade on the lit side, and a thin rim light — on both platforms
// through react-native-svg. Colours come in from the tokens (silver / silver-deep / ink).
import { tokens } from "@kawase/ui-tokens";
import * as React from "react";
import { Circle, Defs, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from "react-native-svg";

type Palette = {
  /** The lit side of the metal. */
  light: string;
  /** The shaded side. */
  deep: string;
  /** The dot colour (ink on silver, deep brown on gold). */
  ink: string;
  /** The rim/specular colour. */
  glint: string;
};

const DARK = tokens.themes.dark;
export const SILVER: Palette = { light: DARK.silver, deep: DARK["silver-deep"], ink: DARK.background, glint: DARK.foreground };
export const GOLD: Palette = { light: "#F1D98A", deep: "#8A6A1E", ink: "#3A2A05", glint: "#FFF6D0" };
/** The seal's vermilion; artwork, not the error colour. */
export const VERMILION: Palette = { light: "#E0463D", deep: "#9C2620", ink: "#5A100C", glint: "#FFD9D3" };
export const LIME: Palette = { light: tokens.orb.mainnet[1], deep: tokens.orb.mainnet[2], ink: DARK.background, glint: "#FFFFFF" };

const DOT_CELL = 5;
const DOT_RADIUS = 1.05;
const MASK_ID = "shade";
const METAL_ID = "metal";
const DOTS_ID = "dots";
const RIM_ID = "rim";

type StippleDefsProps = {
  /** Unique per object on the page, so several objects can coexist. */
  id: string;
  palette?: Palette;
  /** Light direction in degrees, 0 = from the start (left) side, 90 = from the top. */
  lightAngle?: number;
  /** The object's bounding box in its own viewBox units (the mask gradient spans it). */
  box: { x: number; y: number; width: number; height: number };
  /** 0 = matte (ink on paper), 1 = polished metal with a specular band. */
  sheen?: number;
};

const DEG_TO_RAD = Math.PI / 180;
const HALF = 0.5;

/** Gradient endpoints for a light coming from `angle`, spanning the box. */
const lightVector = (angle: number, box: StippleDefsProps["box"]) => {
  const rad = angle * DEG_TO_RAD;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  const cx = box.x + box.width * HALF;
  const cy = box.y + box.height * HALF;
  const rx = box.width * HALF;
  const ry = box.height * HALF;
  return { x1: cx - dx * rx, y1: cy - dy * ry, x2: cx + dx * rx, y2: cy + dy * ry };
};

export function StippleDefs({ id, palette = SILVER, lightAngle = 135, box, sheen = 1 }: StippleDefsProps) {
  const lit = lightVector(lightAngle, box);
  return (
    <Defs>
      <LinearGradient id={`${id}-${METAL_ID}`} x1={lit.x1} y1={lit.y1} x2={lit.x2} y2={lit.y2} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={palette.deep} />
        <Stop offset="0.45" stopColor={palette.light} />
        <Stop offset="0.62" stopColor={palette.glint} stopOpacity={0.9 * sheen} />
        <Stop offset="0.78" stopColor={palette.light} />
        <Stop offset="1" stopColor={palette.deep} />
      </LinearGradient>
      {/* White = dots visible (shade), black = dots gone (light). */}
      <LinearGradient id={`${id}-${MASK_ID}-g`} x1={lit.x1} y1={lit.y1} x2={lit.x2} y2={lit.y2} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.55" />
        <Stop offset="0.6" stopColor="#000000" />
        <Stop offset="0.85" stopColor="#FFFFFF" stopOpacity="0.5" />
        <Stop offset="1" stopColor="#FFFFFF" />
      </LinearGradient>
      <Mask id={`${id}-${MASK_ID}`} maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.width} height={box.height}>
        <Rect x={box.x} y={box.y} width={box.width} height={box.height} fill={`url(#${id}-${MASK_ID}-g)`} />
      </Mask>
      <Pattern id={`${id}-${DOTS_ID}`} patternUnits="userSpaceOnUse" width={DOT_CELL} height={DOT_CELL}>
        <Circle cx={DOT_CELL * HALF} cy={DOT_CELL * HALF} r={DOT_RADIUS} fill={palette.ink} fillOpacity={0.5} />
      </Pattern>
      <LinearGradient id={`${id}-${RIM_ID}`} x1={lit.x2} y1={lit.y2} x2={lit.x1} y2={lit.y1} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={palette.glint} stopOpacity="0.9" />
        <Stop offset="0.5" stopColor={palette.glint} stopOpacity="0" />
        <Stop offset="1" stopColor={palette.deep} stopOpacity="0.8" />
      </LinearGradient>
    </Defs>
  );
}

type StippleShapeProps = {
  id: string;
  /** SVG path data of the shape. */
  d: string;
  /** Rim stroke width in viewBox units; 0 for none. */
  rim?: number;
  children?: React.ReactNode;
};

const DEFAULT_RIM = 1.5;

/** A shape in the material: metal fill, shaded dots, rim light. Children draw on top (engravings, stamps). */
export function StippleShape({ id, d, rim = DEFAULT_RIM, children }: StippleShapeProps) {
  return (
    <G>
      <Path d={d} fill={`url(#${id}-${METAL_ID})`} />
      <Path d={d} fill={`url(#${id}-${DOTS_ID})`} mask={`url(#${id}-${MASK_ID})`} />
      {rim > 0 ? <Path d={d} fill="none" stroke={`url(#${id}-${RIM_ID})`} strokeWidth={rim} /> : null}
      {children}
    </G>
  );
}

export type { Palette };
