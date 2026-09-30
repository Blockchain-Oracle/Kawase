// Native twin of ui-web's response-stream in "fade" mode (21st.dev ibelick/response-stream):
// the text appears word by word. Screen readers get the whole sentence at once.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

const WORD_FADE_MS = 250;

type WordSegmenter = { segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }> };

type Word = { text: string; spaceAfter: boolean };

// Splits into words and keeps punctuation with the word before it, so a comma never starts a line.
// Each word is drawn as its own text. The space after a word is a margin on its trailing side, not a space
// character: a trailing space is dropped from right-to-left text and lands on the wrong side of a number
// or Latin word inside an Arabic sentence.
// Languages written without spaces (Chinese, Japanese) need Intl.Segmenter; without it the text is one piece.
function splitWords(text: string): Word[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: object) => WordSegmenter })
    .Segmenter;
  const pieces: string[] = [];
  if (typeof Segmenter === "function") {
    for (const part of new Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (part.isWordLike || pieces.length === 0) pieces.push(part.segment);
      else pieces[pieces.length - 1] += part.segment;
    }
  } else {
    pieces.push(...text.split(/(?<=\s)/).filter(Boolean));
  }
  return pieces.map((piece) => ({ text: piece.trimEnd(), spaceAfter: /\s$/.test(piece) }));
}

type CaptionProps = {
  text: string;
  /** Delay between words, in milliseconds. */
  wordDelayMs?: number;
  /** Classes for the wrapping row (alignment). */
  className?: string;
  /** Classes for every word (font, size, colour). */
  textClassName?: string;
};

function Caption({ text, wordDelayMs = 80, className, textClassName }: CaptionProps) {
  const words = React.useMemo(() => splitWords(text), [text]);
  // The width of a space in this font and size, measured once from a hidden no-break space.
  const [spaceWidth, setSpaceWidth] = React.useState(0);
  return (
    <View
      key={text}
      accessible
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      className={cn("flex-row flex-wrap", className)}
    >
      <Text
        aria-hidden
        onLayout={(event) => setSpaceWidth(event.nativeEvent.layout.width)}
        className={cn(textClassName, "absolute opacity-0")}
      >
        {"\u00a0"}
      </Text>
      {words.map((word, index) => (
        <Animated.View
          key={`${index}-${word.text}`}
          entering={FadeIn.delay(index * wordDelayMs).duration(WORD_FADE_MS)}
          style={word.spaceAfter ? { marginEnd: spaceWidth } : undefined}
        >
          <Text className={textClassName}>{word.text}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

export { Caption };
export type { CaptionProps };
