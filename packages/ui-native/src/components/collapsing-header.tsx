// The collapsing header (Fomo F12 / M10, adapted): the pills row stays put while the page scrolls under it; once the
// balance card has scrolled past, a compact centre (mark · balance · network) fades in so the number is never out
// of sight. Driven by the page's scroll offset (a shared value from `useAnimatedScrollHandler`), so it costs no
// renders. The coloured views are plain; only the wrappers animate (the Stage 2 theme-change rule).
//
// The compact centre never sits over the controls (Codex review R13): it is centred between the wider of the two
// sides, and when a long language name or a narrow screen leaves it too little room it is not shown at all. It
// repeats the card's balance, so assistive tech reads the card, not this copy.
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
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
/** The clear space between the compact centre and the controls on either side. */
const SIDE_GAP = 8;
const BOTH_SIDES = 2;

type Widths = { header: number; leading: number; trailing: number; compact: number };

function CollapsingHeader({ scrollY, collapseAt, leading, trailing, compact, className }: CollapsingHeaderProps) {
  const [widths, setWidths] = React.useState<Widths>({ header: 0, leading: 0, trailing: 0, compact: 0 });
  const measure = (key: keyof Widths) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setWidths((was) => (was[key] === width ? was : { ...was, [key]: width }));
  };
  const side = Math.max(widths.leading, widths.trailing) + SIDE_GAP;
  const fits = widths.compact > 0 && widths.compact <= widths.header - BOTH_SIDES * side;

  const compactStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [collapseAt - FADE_SPAN, collapseAt], [0, 1], Extrapolation.CLAMP);
    return { opacity: progress, transform: [{ translateY: (1 - progress) * RISE }] };
  });
  return (
    <View onLayout={measure("header")} className={cn("flex-row items-center justify-between", className)}>
      <View onLayout={measure("leading")} className="z-10 flex-row items-center gap-2">
        {leading}
      </View>
      {compact ? (
        <View pointerEvents="none" aria-hidden className="absolute inset-x-0 items-center" style={{ opacity: fits ? 1 : 0 }}>
          <Animated.View onLayout={measure("compact")} style={compactStyle}>
            {compact}
          </Animated.View>
        </View>
      ) : null}
      <View onLayout={measure("trailing")} className="z-10 flex-row items-center gap-2">
        {trailing}
      </View>
    </View>
  );
}

export { CollapsingHeader };
export type { CollapsingHeaderProps };
