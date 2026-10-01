// The story onboarding shell (Solflare S01–S06 / M01, C01): a rounded canvas that clips colour fields and layered
// art, segmented progress, a title and copy that change with the panel, and a footer that never moves. A panel
// change travels the field and its art horizontally inside the canvas over `MOTION.storyPanelMs` (the art a little
// behind the field, so the layers read as depth), and the copy changes mid-travel. A swipe drags the canvas and
// pages on release. Auto-advance is the caller's (it knows about reduced motion and sheets over the story). The
// top-end slot holds the language pill from the first panel.
import { MOTION } from "@kawase/config";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

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
/** The art trails the field by this share of the travel, so it arrives a beat later (layered depth). */
const ART_PARALLAX = 0.28;
/** A swipe pages once it passes this share of the canvas, or flicks faster than the velocity below. */
const PAGE_THRESHOLD = 0.22;
const FLICK_VELOCITY = 600;
/** Past the first and last panel the canvas follows the finger at this fraction (a rubber band). */
const EDGE_RESISTANCE = 0.25;
/** Horizontal movement before the swipe claims the gesture; vertical movement past this lets it go. */
const ACTIVE_OFFSET = 12;
/** A released swipe that does not page settles back faster than a full panel change. */
const SETTLE_MS = 280;

function PanelArt({ index, width, translate, children }: { index: number; width: number; translate: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    // 0 when this panel is centred; ±width as it enters or leaves.
    const offset = translate.value + index * width;
    return { transform: [{ translateX: offset * ART_PARALLAX }] };
  });
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

function StoryShell({ panels, index, onIndexChange, progressLabel, topEnd, footer, canvasHeight, ink, className }: StoryShellProps) {
  const reduced = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const translate = useSharedValue(0);
  const start = useSharedValue(0);
  const current = panels[index] ?? panels[0];
  const last = panels.length - 1;

  // Every index change (a swipe's release, auto-advance, a progress tap) travels the canvas to its panel.
  React.useEffect(() => {
    if (width <= 0) return;
    translate.value = withTiming(-index * width, { duration: reduced ? 0 : MOTION.storyPanelMs, easing: Easing.inOut(Easing.cubic) });
  }, [index, width, reduced, translate]);

  const settle = React.useCallback(
    (next: number) => {
      if (next !== index) onIndexChange(next);
      else translate.value = withTiming(-index * width, { duration: reduced ? 0 : SETTLE_MS, easing: Easing.out(Easing.cubic) });
    },
    [index, onIndexChange, translate, width, reduced],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .failOffsetY([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .onBegin(() => {
      start.value = translate.value;
    })
    .onUpdate((event) => {
      const min = -last * width;
      const raw = start.value + event.translationX;
      // Past either end the canvas resists instead of revealing nothing.
      translate.value = raw > 0 ? raw * EDGE_RESISTANCE : raw < min ? min + (raw - min) * EDGE_RESISTANCE : raw;
    })
    .onEnd((event) => {
      const travelled = event.translationX;
      const forward = travelled < -width * PAGE_THRESHOLD || event.velocityX < -FLICK_VELOCITY;
      const backward = travelled > width * PAGE_THRESHOLD || event.velocityX > FLICK_VELOCITY;
      const next = Math.min(last, Math.max(0, index + (forward ? 1 : backward ? -1 : 0)));
      scheduleOnRN(settle, next);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value }] }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View className={cn("flex-1", className)}>
      <GestureDetector gesture={pan}>
        <View
          className="overflow-hidden"
          style={{ height: canvasHeight, marginHorizontal: CANVAS_MARGIN, borderRadius: CANVAS_RADIUS }}
          onLayout={onLayout}
        >
          {/* Fields travel the same way in every language: paging is a physical gesture, not reading order. */}
          <Animated.View style={[{ flexDirection: "row", direction: "ltr", width: (width || 1) * panels.length, height: canvasHeight }, rowStyle]}>
            {panels.map((panel, i) => (
              <View
                key={panel.key}
                importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
                accessibilityElementsHidden={i !== index}
                style={{ width: width || 1, height: canvasHeight, backgroundColor: panel.field, overflow: "hidden" }}
              >
                <PanelArt index={i} width={width} translate={translate}>
                  {panel.art}
                </PanelArt>
              </View>
            ))}
          </Animated.View>
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
      </GestureDetector>

      {/* The copy area takes what is left, so a longer title never moves the footer (M01: the CTA is fixed). */}
      <View className="flex-1 px-6 pt-5">
        <View className="flex-1 overflow-hidden">
          <Animated.View key={current?.key} entering={FadeIn.duration(COPY_MS).delay(reduced ? 0 : COPY_MS)} exiting={FadeOut.duration(COPY_MS)} className="gap-2">
            <Text className={cn("font-display text-foreground text-3xl font-bold leading-tight", TEXT_START)}>{current?.title}</Text>
            <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{current?.body}</Text>
          </Animated.View>
        </View>
        <View className="gap-3 pb-2">{footer}</View>
      </View>
    </View>
  );
}

export { StoryShell };
export type { StoryPanel, StoryShellProps };
