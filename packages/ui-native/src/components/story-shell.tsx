// The story onboarding shell (Solflare S01–S06 / M01, C01): a rounded canvas that clips colour fields and layered
// art, segmented progress, a title and copy that change with the panel, and a footer that never moves. Swiping
// pages the canvas; the copy follows the page. Auto-advance is the caller's (it knows about reduced motion and
// visibility). The top-end slot holds the language pill from the first panel.
import { MOTION } from "@kawase/config";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

type StoryPanel = {
  key: string;
  /** The colour field behind the art, as hex (from tokens.story.fields). */
  field: string;
  title: string;
  body: string;
  /** The layered art; positioned absolutely inside the canvas by the panel itself. */
  art: React.ReactNode;
};

type StoryShellProps = {
  panels: readonly StoryPanel[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Progress dots' accessibility label, e.g. "Panel {n} of {total}". */
  progressLabel: (index: number, total: number) => string;
  topEnd?: React.ReactNode;
  footer: React.ReactNode;
  /** Height of the canvas in points (the caller derives it from the window). */
  canvasHeight: number;
  /** Colour for the ink text on the fields (the story ink token). */
  ink: string;
  className?: string;
};

const CANVAS_RADIUS = 32;
const CANVAS_MARGIN = 12;
const SEGMENT_GAP = 6;
const SEGMENT_HEIGHT = 4;
/** The copy crossfades in the first third of a panel change (it changes mid-travel, M01). */
const COPY_FRACTION = 0.33;
const COPY_MS = MOTION.storyPanelMs * COPY_FRACTION;
const HALF = 0.5;
const SEGMENT_ACTIVE_WIDTH = 22;
const SEGMENT_WIDTH = 8;
const SEGMENT_HIT_SLOP = 12;
const SEGMENT_ACTIVE_OPACITY = 0.9;
const SEGMENT_OPACITY = 0.35;

function StoryShell({ panels, index, onIndexChange, progressLabel, topEnd, footer, canvasHeight, ink, className }: StoryShellProps) {
  const scroller = React.useRef<ScrollView>(null);
  // True until the user drags: mount-time and programmatic scrolls (including the offset a right-to-left layout
  // applies on mount) must not report a page.
  const programmatic = React.useRef(true);
  const [width, setWidth] = React.useState(0);
  const current = panels[index] ?? panels[0];

  // Programmatic page changes (auto-advance, progress taps) scroll the canvas; only a user's swipe reports back,
  // so a programmatic scroll's own momentum event cannot bounce the index.
  React.useEffect(() => {
    if (width <= 0) return;
    programmatic.current = true;
    scroller.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onDragEnd = () => {
    programmatic.current = false;
  };
  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0 || programmatic.current) return;
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    const next = Math.min(panels.length - 1, Math.max(0, page));
    if (next !== index) onIndexChange(next);
  };

  return (
    <View className={cn("flex-1", className)}>
      <View
        className="overflow-hidden"
        style={{ height: canvasHeight, marginHorizontal: CANVAS_MARGIN, borderRadius: CANVAS_RADIUS }}
        onLayout={onLayout}
      >
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={onDragEnd}
          onMomentumScrollEnd={onMomentumEnd}
          // Fields travel the same way in every language: paging is a physical gesture, not reading order.
          style={{ direction: "ltr" }}
          contentContainerStyle={{ direction: "ltr" }}
        >
          {panels.map((panel) => (
            <View key={panel.key} style={{ width: width || 1, height: canvasHeight, backgroundColor: panel.field }}>
              {panel.art}
            </View>
          ))}
        </ScrollView>
        {/* Progress and the top-end slot float over the canvas. */}
        <View pointerEvents="box-none" className="absolute inset-x-0 top-0 flex-row items-center justify-between px-5 pt-4">
          <View accessibilityRole="progressbar" accessibilityLabel={progressLabel(index + 1, panels.length)} className="flex-row" style={{ gap: SEGMENT_GAP }}>
            {panels.map((panel, i) => (
              <Pressable
                key={panel.key}
                onPress={() => onIndexChange(i)}
                hitSlop={SEGMENT_HIT_SLOP}
                style={{
                  width: i === index ? SEGMENT_ACTIVE_WIDTH : SEGMENT_WIDTH,
                  height: SEGMENT_HEIGHT,
                  borderRadius: SEGMENT_HEIGHT * HALF,
                  backgroundColor: ink,
                  opacity: i === index ? SEGMENT_ACTIVE_OPACITY : SEGMENT_OPACITY,
                }}
              />
            ))}
          </View>
          {topEnd}
        </View>
      </View>

      <View className="flex-1 justify-between px-6 pt-6">
        <Animated.View key={current?.key} entering={FadeIn.duration(COPY_MS)} exiting={FadeOut.duration(COPY_MS)} className="gap-3">
          <Text className={cn("font-display text-foreground text-4xl font-bold leading-tight", TEXT_START)}>{current?.title}</Text>
          <Text className={cn("text-muted-foreground text-lg leading-6", TEXT_START)}>{current?.body}</Text>
        </Animated.View>
        <View className="gap-3 pb-2">{footer}</View>
      </View>
    </View>
  );
}

export { StoryShell };
export type { StoryPanel, StoryShellProps };
