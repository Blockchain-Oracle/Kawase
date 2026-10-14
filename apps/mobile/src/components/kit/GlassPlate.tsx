import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { type ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, type StyleProp, View, type ViewStyle } from "react-native";
import { HAIRLINE_PX, useTheme } from "./theme";

/** Checked once: Liquid Glass exists only on iOS 26+. */
const GLASS = Platform.OS === "ios" && isGlassEffectAPIAvailable();

/**
 * Floating chrome only (HIG: never glass in the content layer): Liquid Glass on iOS 26; on iOS 18–25, Android, or when
 * the user asked to reduce transparency, the opaque glass equivalent with the material's own rim (the one border the
 * surface rule allows on chrome).
 */
export function GlassPlate({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { name, color } = useTheme();
  const [reduceTransparency, setReduce] = useState(false);
  useEffect(() => {
    if (!GLASS) return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    return () => sub.remove();
  }, []);
  if (GLASS && !reduceTransparency) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme={name} style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[{ backgroundColor: color.glassOpaque, borderColor: color.glassRim, borderWidth: HAIRLINE_PX }, style]}
    >
      {children}
    </View>
  );
}
