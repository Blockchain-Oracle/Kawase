// The collapsing header (Fomo F12 / M10, adapted): the pills row stays put while the page scrolls under it; once the
// balance card has scrolled past, a compact centre (mark · balance · network) fades in so the number is never out
// of sight. Driven by the page's scroll offset (a shared value from `useAnimatedScrollHandler`), so it costs no
// renders. The coloured views are plain; only the wrappers animate (the Stage 2 theme-change rule).
import { cn } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

type CollapsingHeaderProps = {
  /** The page's vertical scroll offset in points. */
  scrollY: SharedValue<number>;
  /** The offset at which the compact centre is fully shown (the card's bottom edge). */
  collapseAt: number;
  /** The start-side pills (language, network). */
  leading: React.ReactNode;
  /** The end-side buttons (inbox, settings). */
  trailing: React.ReactNode;
  /** What fades in at the centre when collapsed. */
  compact?: React.ReactNode;
  className?: string;
};

/** How far before `collapseAt` the fade starts. */
const FADE_SPAN = 48;
const RISE = 6;

function CollapsingHeader({ scrollY, collapseAt, leading, trailing, compact, className }: CollapsingHeaderProps) {
  const compactStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [collapseAt - FADE_SPAN, collapseAt], [0, 1], Extrapolation.CLAMP);
    return { opacity: progress, transform: [{ translateY: (1 - progress) * RISE }] };
  });
  return (
    <View className={cn("flex-row items-center justify-between", className)}>
      <View className="z-10 flex-row items-center gap-2">{leading}</View>
      {compact ? (
        <Animated.View pointerEvents="none" style={compactStyle} className="absolute inset-x-0 items-center">
          {compact}
        </Animated.View>
      ) : null}
      <View className="z-10 flex-row items-center gap-2">{trailing}</View>
    </View>
  );
}

export { CollapsingHeader };
export type { CollapsingHeaderProps };
