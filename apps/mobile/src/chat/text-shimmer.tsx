// Shimmering status text while the agent works (21st.dev 12336 · Text Shimmer, serafimcloud, from 21st Agent Elements),
// as a native twin. The web original sweeps a gradient clipped to the glyphs; React Native has no text clip on every
// platform (Skia text would need fonts loaded on the web export), so the sweep travels word by word: each word's
// opacity follows the same wave, offset by its place. Words, not letters: Arabic, Urdu, Hindi and Bengali join their
// letters, and a word keeps its shaping. Scripts written without spaces shimmer as one piece. Reduced motion: still.
import * as React from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";

import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn } from "@kawase/ui-native/lib/utils";

/** One sweep across the line (the original's default duration, 2 s). */
const SWEEP_MS = 2_000;
/** How dim a word is outside the highlight, and how wide the highlight is (in words). */
const DIM = 0.45;
const SPREAD = 1.6;
/** The highlight starts before the first word and ends past the last one. */
const BOTH_SIDES = 2;

function Word({ word, index, count, sweep, className }: { word: string; index: number; count: number; sweep: SharedValue<number>; className?: string | undefined }) {
  const style = useAnimatedStyle(() => {
    // The highlight travels from before the first word to past the last one.
    const at = sweep.value * (count + SPREAD * BOTH_SIDES) - SPREAD;
    const distance = Math.abs(at - index);
    return { opacity: interpolate(distance, [0, SPREAD], [1, DIM], "clamp") };
  });
  return <Animated.Text style={style} className={className}>{word}</Animated.Text>;
}

export function TextShimmer({ children, className, active = true }: { children: string; className?: string; active?: boolean }) {
  const reduced = useReducedMotionLive();
  const sweep = useSharedValue(0);
  const moving = active && !reduced;
  React.useEffect(() => {
    if (!moving) {
      cancelAnimation(sweep);
      sweep.value = 0;
      return undefined;
    }
    sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(sweep);
  }, [moving, sweep]);

  if (!moving) return <Text className={className}>{children}</Text>;
  const words = children.split(/(\s+)/).filter((part) => part.length > 0);
  const real = words.filter((part) => !/^\s+$/.test(part)).length;
  let index = -1;
  return (
    <View accessible accessibilityLabel={children} accessibilityLiveRegion="polite" className="flex-row flex-wrap">
      {words.map((part, position) => {
        if (/^\s+$/.test(part)) return <Text key={position} className={className}>{part}</Text>;
        index += 1;
        return <Word key={position} word={part} index={index} count={real} sweep={sweep} className={cn("text-foreground font-sans text-base", className)} />;
      })}
    </View>
  );
}
