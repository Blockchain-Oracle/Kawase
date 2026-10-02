// The agent's words in a turn: short paragraphs and lists with **bold** and `code`, figures in the mono face. Each
// block fades in as it arrives; the block being streamed grows in place, so nothing jumps or replays. The model is
// told to keep replies brief and put facts on cards, so this covers what it writes; anything else shows as text.
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

type Block = { kind: "paragraph"; text: string } | { kind: "list"; ordered: boolean; items: string[] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^#{1,6}\s+/;

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;
    const bullets = lines.every((line) => BULLET.test(line));
    const numbered = lines.every((line) => NUMBERED.test(line));
    if (bullets || numbered)
      blocks.push({
        kind: "list",
        ordered: numbered,
        items: lines.map((line) => line.replace(bullets ? BULLET : NUMBERED, "")),
      });
    else blocks.push({ kind: "paragraph", text: lines.map((line) => line.replace(HEADING, "")).join("\n") });
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;
const BOLD = "**";
const CODE = "`";
/** A marked piece needs its marks on both sides plus at least one character. */
const BOTH_SIDES = 2;

/** Bold and inline code; a figure in backticks or bold reads in the mono face so amounts line up. */
function inline(text: string): React.ReactNode[] {
  return text.split(INLINE).map((piece, i) => {
    if (piece.startsWith(BOLD) && piece.endsWith(BOLD) && piece.length > BOLD.length * BOTH_SIDES)
      return (
        <Text key={i} className="text-foreground font-semibold">
          {piece.slice(BOLD.length, -BOLD.length)}
        </Text>
      );
    if (piece.startsWith(CODE) && piece.endsWith(CODE) && piece.length > CODE.length * BOTH_SIDES)
      return (
        <Text key={i} className="text-foreground bg-secondary rounded font-mono text-[15px]">
          {piece.slice(CODE.length, -CODE.length)}
        </Text>
      );
    return piece;
  });
}

export function MessageText({ text }: { text: string }) {
  const reduced = useReducedMotionLive();
  const blocks = React.useMemo(() => blocksOf(text), [text]);
  const entering = reduced ? undefined : FadeIn.duration(MOTION.captionWordMs);
  return (
    <View className="gap-2.5">
      {blocks.map((block, index) => (
        <Animated.View key={index} entering={entering}>
          {block.kind === "paragraph" ? (
            <Text className={cn("text-foreground text-[16px] leading-[25px]", TEXT_START)}>{inline(block.text)}</Text>
          ) : (
            <View className="gap-1.5">
              {block.items.map((item, i) => (
                <View key={i} className="flex-row gap-2.5">
                  <Text className="text-muted-foreground w-5 text-end font-mono text-[15px] leading-[25px]">
                    {block.ordered ? `${i + 1}.` : "•"}
                  </Text>
                  <Text className={cn("text-foreground flex-1 text-[16px] leading-[25px]", TEXT_START)}>
                    {inline(item)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      ))}
    </View>
  );
}
