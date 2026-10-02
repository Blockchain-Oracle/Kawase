// A live caption: words appear as they are heard or spoken, each one fading in once (DESIGN.md: "captions fade in by
// word"). Unlike ui-native's Caption, the row is not remounted when text grows, so earlier words stay put and only the
// new ones fade. Screen readers get the whole line.
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

type WordSegmenter = { segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }> };

/** Words with their punctuation; languages without spaces (Chinese) are split with Intl.Segmenter when present. */
function words(text: string): { text: string; spaceAfter: boolean }[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: object) => WordSegmenter }).Segmenter;
  const pieces: string[] = [];
  if (typeof Segmenter === "function") {
    for (const part of new Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (part.isWordLike || pieces.length === 0) pieces.push(part.segment);
      else pieces[pieces.length - 1] += part.segment;
    }
  } else pieces.push(...text.split(/(?<=\s)/).filter(Boolean));
  return pieces.map((piece) => ({ text: piece.trimEnd(), spaceAfter: /\s$/.test(piece) }));
}

export function LiveCaption({ id, text, className, textClassName }: { id: string; text: string; className?: string; textClassName?: string }) {
  const reduced = useReducedMotionLive();
  const list = React.useMemo(() => words(text.trim()), [text]);
  const [spaceWidth, setSpaceWidth] = React.useState(0);
  return (
    <View accessible accessibilityLabel={text} accessibilityLiveRegion="polite" className={cn("flex-row flex-wrap justify-center", className)}>
      <Text aria-hidden onLayout={(event) => setSpaceWidth(event.nativeEvent.layout.width)} className={cn(textClassName, "absolute opacity-0")}>
        {" "}
      </Text>
      {list.map((word, index) => (
        <Animated.View
          key={`${id}:${index}`}
          entering={reduced ? undefined : FadeIn.duration(MOTION.captionWordMs)}
          style={word.spaceAfter ? { marginEnd: spaceWidth } : undefined}
        >
          <Text className={textClassName}>{word.text}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
