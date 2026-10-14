// The kit's view of the design tokens (packages/ui-tokens/tokens.json): the active theme's colours as camelCase roles
// plus Senryo's app aliases, and the type, space, radius, elevation, motion and spring scales as React Native values.
// A thin shim: the values come from tokens.json, never from here, so changing the look means changing the tokens.
// Every kit component reads this instead of carrying a hex, a size or a duration of its own. The kit ships ported
// from Senryo, whose `useTheme().color` shape this keeps, so those components move across unchanged in structure.
import { tokens, type ThemeName } from "@kawase/ui-tokens";
import * as React from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { Easing, ReduceMotion, type WithSpringConfig } from "react-native-reanimated";

import { useTheme as useAppTheme } from "@/theme/theme-provider";

type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Head}${Capitalize<CamelCase<Tail>>}` : S;
type TokenRoles = { [K in keyof (typeof tokens.themes)["light"] as CamelCase<K & string>]: string };

const HEX_RADIX = 16;
const BYTE = 255;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const HEX_BODY_START = 1;
const HEX_DIGITS_NO_ALPHA = 6;

/** `#RRGGBB` plus an alpha fraction to rgba(), for the washes React Native has no `color-mix()` for. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(HEX_BODY_START, HEX_BODY_START + HEX_DIGITS_NO_ALPHA), HEX_RADIX);
  return `rgba(${(n >> RED_SHIFT) & BYTE}, ${(n >> GREEN_SHIFT) & BYTE}, ${n & BYTE}, ${alpha})`;
}

const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

/** Wash strengths (fractions of the up/down colour) and the chart area fill. */
const WASH = { soft: 0.12, strong: 0.24, chartFill: 0.16 } as const;
/** Edge light (fractions): the top highlight on a filled primary, the faint edge of a raised fill, the dock bubble. */
const RIM = { primary: 0.2, surface: 0.06, bubble: 0.12, bubbleEdge: 0.16 } as const;

function roles(themeName: ThemeName) {
  const source: Record<string, string> =
    themeName === "testnet"
      ? { ...tokens.themes.light, ...tokens.themes.testnet }
      : themeName === "testnet-dark"
        ? { ...tokens.themes.dark, ...tokens.themes["testnet-dark"] }
        : tokens.themes[themeName];
  const base = Object.fromEntries(Object.entries(source).map(([name, value]) => [camel(name), value])) as unknown as TokenRoles;
  return {
    ...base,
    /** Senryo's app names for the same roles. */
    ground: base.background,
    ink: base.foreground,
    inkMuted: base.mutedForeground,
    hairline: base.border,
    text2: base.mutedForeground,
    glassTint: base.glass,
    glassRim: base.glassBorder,
    sheetScrim: base.scrim,
    /** Washes: a tint of the direction colour on a plate, precomputed (no `color-mix()` in React Native). */
    upWash: withAlpha(base.up, WASH.soft),
    downWash: withAlpha(base.down, WASH.soft),
    upWashStrong: withAlpha(base.up, WASH.strong),
    downWashStrong: withAlpha(base.down, WASH.strong),
    primaryWash: withAlpha(base.primary, WASH.soft),
    primaryWashStrong: withAlpha(base.primary, WASH.strong),
    warnWash: base.warnSurface,
    destructiveWash: base.destructiveSurface,
    chartFillTop: withAlpha(base.up, WASH.chartFill),
    chartFillBottom: withAlpha(base.up, 0),
    chartDownFillTop: withAlpha(base.down, WASH.chartFill),
    chartDownFillBottom: withAlpha(base.down, 0),
    /** Depth without borders: 1 px inner highlights (the primary fill, raised plates, the dock bubble). */
    primaryRim: withAlpha(base.primaryForeground, RIM.primary),
    surfaceRim: withAlpha(base.foreground, RIM.surface),
    glassBubble: withAlpha(base.foreground, RIM.bubble),
    glassBubbleRim: withAlpha(base.foreground, RIM.bubbleEdge),
    /** A quiet plate on a group that already sits on a sheet (level 2): one step off `raisedTwo`. */
    nestedFill: themeName === "dark" || themeName === "testnet-dark" ? base.rowPressed : base.card,
    /** The light plate that stays light in both themes (a QR card) and its ink. */
    paper: tokens.themes.light.card,
    paperInk: tokens.themes.light.foreground,
    transparent: "transparent",
  };
}

export type KitPalette = ReturnType<typeof roles>;

const PALETTES: Record<ThemeName, KitPalette> = {
  light: roles("light"),
  dark: roles("dark"),
  testnet: roles("testnet"),
  "testnet-dark": roles("testnet-dark"),
};

export type KitTheme = { name: "light" | "dark"; themeName: ThemeName; network: "mainnet" | "testnet"; color: KitPalette };

/** A subtree can pin a theme (the gallery shows every kit part in all four) without touching the app's own. */
const KitThemeOverride = React.createContext<ThemeName | null>(null);
export const KitThemeProvider = KitThemeOverride.Provider;

export function useKitTheme(): KitTheme {
  const app = useAppTheme();
  const override = React.useContext(KitThemeOverride);
  const themeName = override ?? app.themeName;
  const dark = themeName === "dark" || themeName === "testnet-dark";
  return {
    name: dark ? "dark" : "light",
    themeName,
    network: themeName === "testnet" || themeName === "testnet-dark" ? "testnet" : "mainnet",
    color: PALETTES[themeName],
  };
}

/** Senryo's hook name, kept so ported components read the same. */
export const useTheme = useKitTheme;

/** Colours for code that has no hook (a worklet's constants, a static style): the named theme's palette. */
export const paletteOf = (themeName: ThemeName): KitPalette => PALETTES[themeName];

const S = tokens.scale;

export const SPACE = S.space;
export const RADIUS = S.radius;
export const SIZE = S.size;
export const HAIRLINE_PX = S.hairline;
export const DISABLED_OPACITY = S.disabledOpacity;
export const HERO_FONT_SCALE = S.maxFontScale.hero;
export const CONTROL_FONT_SCALE = S.maxFontScale.control;
/** Past this Dynamic Type scale a row of side-by-side cells has no room: they stack, one per line. */
export const STACK_FONT_SCALE = 1.2;
export const SHEET_SHAPE = S.sheet;
export const DOCK = S.dock;
export const LAYOUT = S.layout;
export const SKELETON = { periodMs: S.motion.skeletonPeriodMs, from: S.motion.skeletonFrom, to: S.motion.skeletonTo } as const;

export const BUTTON = {
  radius: { md: S.button.radiusMd, sm: S.button.radiusSm },
  rim: S.button.rim,
  icon: S.button.icon,
  utility: S.button.utility,
} as const;

/** Money and other changing figures align in columns: tabular + lining figures (Inter's `tnum`/`lnum`). */
export const NUMERIC_VARIANT: TextStyle["fontVariant"] = ["tabular-nums", "lining-nums"];

type TypeRole = keyof typeof S.type;
const DISPLAY_WEIGHT = "900";

function textStyle(spec: (typeof S.type)[TypeRole]): TextStyle {
  const display = spec.font === "display";
  return {
    fontFamily: display ? tokens.fonts.display : tokens.fonts.body,
    fontWeight: display ? DISPLAY_WEIGHT : (String(spec.weight) as TextStyle["fontWeight"]),
    fontSize: spec.size,
    lineHeight: spec.lineHeight,
    letterSpacing: spec.tracking * spec.size,
    ...(spec.numeric ? { fontVariant: NUMERIC_VARIANT } : {}),
  };
}

/** Every type role as a React Native text style: sentence case, display tracking -0.02em, tabular money. */
export const TYPE = Object.fromEntries(
  (Object.keys(S.type) as TypeRole[]).map((role) => [role, textStyle(S.type[role])]),
) as Readonly<Record<TypeRole, TextStyle>>;

export const FONT = { sans: tokens.fonts.body, display: tokens.fonts.display } as const;

const boxShadow = (e: { x: number; y: number; blur: number; spread: number; color: string }): ViewStyle => ({
  boxShadow: `${e.x}px ${e.y}px ${e.blur}px ${e.spread}px ${e.color}`,
});
/** Shadows: the dock and sheets only; raised content surfaces carry none. */
export const ELEVATION = {
  button: boxShadow(S.elevation.button),
  dock: boxShadow(S.elevation.dock),
  sheet: boxShadow(S.elevation.sheet),
  receipt: boxShadow(S.elevation.receipt),
} as const;

/** Motion: ordinary transitions decelerate on one curve; sheets ride the iOS drawer curve. */
export const EASE = Easing.bezier(...(S.motion.easing as [number, number, number, number]));
export const EASE_SHEET = Easing.bezier(...(S.motion.sheetEasing as [number, number, number, number]));
export const EASE_OVERSHOOT = Easing.bezier(...(S.motion.overshootEasing as [number, number, number, number]));

type SpringSpec = { mass: number; stiffness: number; damping: number; overshoot: boolean };
function spring(s: SpringSpec): WithSpringConfig {
  return {
    mass: s.mass,
    stiffness: s.stiffness,
    damping: s.damping,
    overshootClamping: !s.overshoot,
    energyThreshold: S.springEnergyThreshold,
    reduceMotion: ReduceMotion.System,
  };
}
export const SPRING = Object.fromEntries(
  Object.entries(S.spring).map(([name, spec]) => [name, spring(spec)]),
) as Readonly<Record<keyof typeof S.spring, WithSpringConfig>>;

const M = S.motion;
export const TIMING = {
  press: M.pressMs,
  pressRelease: M.pressReleaseMs,
  sheetEnter: M.sheetEnterMs,
  sheetExit: M.sheetExitMs,
  stagger: M.staggerMs,
  staggerItem: M.staggerItemMs,
  selection: M.selectionMs,
  pagePush: M.pagePushMs,
  compactSelector: M.compactSelectorMs,
  tallDetail: M.tallDetailMs,
  parentChild: M.parentChildMs,
  dockActive: M.dockActiveMs,
  numberChange: M.numberChangeMs,
  chartReveal: M.chartRevealMs,
  onboardingScene: M.onboardingSceneMs,
  qrReveal: M.qrRevealMs,
  ambientLoop: M.ambientLoopMs,
  completionFoil: M.completionFoilMs,
  /** Reduced motion swaps travel for a crossfade of this length. */
  reducedMotion: M.reducedMotionMs,
} as const;

/** Press feedback scale on tappable plates (no bounce). */
export const PRESS_SCALE = M.pressScale;
/** Staggered content rises this far (pt) as it fades in; the page under a sheet steps back to this scale. */
export const STAGGER_RISE = M.staggerRise;
export const SHEET_PARENT_SCALE = M.sheetParentScale;
export const DURATION = { fast: M.pressMs, base: M.selectionMs, slow: M.staggerItemMs } as const;

/** Distance from the screen's bottom edge to the dock's bottom edge. */
export function dockBottom(safeBottom: number): number {
  return Math.max(DOCK.minBottom, safeBottom + DOCK.bottomOffset);
}
export type Palette = KitPalette;
