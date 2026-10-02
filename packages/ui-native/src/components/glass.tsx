// The glass material: Liquid Glass on iOS 26+ (expo-glass-effect), a blur with the `glass` tint elsewhere
// (expo-blur; backdrop-filter on web), always with the `glass-border` rim. The dock, the fan's backdrop and the
// voice overlay are made of it. The material is a layer behind the children, so layout classes apply to a plain
// view (the native glass view does not take class names).
import { BLUR } from "@kawase/config";
import { cn } from "@kawase/ui-native/lib/utils";
import { BlurView, type BlurTint } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { StyleSheet, View, type ViewProps } from "react-native";

import { useAndroidBlur } from "./blur-target";

type GlassProps = ViewProps & {
  /** Which base theme the page is on, so the blur tint matches. */
  scheme: "light" | "dark";
  /** Blur strength (0–100); defaults to the dock's. */
  intensity?: number;
  /** The `glass` token as hex, painted over the blur (ignored by Liquid Glass, which tints itself). */
  tint: string;
  /** Corner radius in points; the glass takes the same shape as the clip. */
  radius: number;
  className?: string;
};

const liquid = isLiquidGlassAvailable();

/** Android without a blur target has no blur at all: the tint is made nearly opaque so text behind never shows through. */
const SOLID_ALPHA = "F2";
const HEX_RGB = 7;
const solid = (hex: string) => (hex.startsWith("#") && hex.length >= HEX_RGB ? `${hex.slice(0, HEX_RGB)}${SOLID_ALPHA}` : hex);

function Glass({ scheme, intensity = BLUR.dock, tint, radius, className, style, children, ...props }: GlassProps) {
  const blurTint: BlurTint = scheme === "dark" ? "dark" : "light";
  const android = useAndroidBlur();
  return (
    <View className={cn("border-glass-border overflow-hidden border", className)} style={[{ borderRadius: radius }, style]} {...props}>
      {liquid ? (
        <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme={scheme} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />
      ) : (
        <>
          <BlurView
            pointerEvents="none"
            intensity={intensity}
            tint={blurTint}
            {...android}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: android.blurMethod === "none" ? solid(tint) : tint }]} />
        </>
      )}
      {children}
    </View>
  );
}

export { Glass };
export type { GlassProps };
