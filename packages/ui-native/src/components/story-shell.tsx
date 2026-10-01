// The story onboarding shell (Solflare S01–S06 / M01, C01): a rounded canvas that clips colour fields and layered
// art, segmented progress, a title and copy that change with the panel, and a footer that never moves. A panel
// change travels the field and its art horizontally inside the canvas over `MOTION.storyPanelMs` (the art a little
// behind the field, so the layers read as depth), and the copy changes mid-travel. Panels are only ever adjacent
// or chosen: the caller stops at the last one instead of sweeping back to the first (Codex review R11).
//
// The finger always wins: grabbing the canvas stops the travel where it is, the canvas follows the finger, and the
// release pages or settles back; a cancelled gesture settles too. `onInteraction` tells the caller so it can hold
// auto-advance and restart the dwell afterwards. For screen readers the canvas is one adjustable control (swipe up
// or down to change panel) and each progress segment is a labelled button with its own, non-overlapping target.
// The copy scrolls when a long translation needs more room than the space under the canvas. The top-end slot holds
// the language pill from the first panel.
import { MOTION } from "@kawase/config";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Pressable, ScrollView, View, type AccessibilityActionEvent, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
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
  /** A segment's spoken label, e.g. "Go to step {n}". */
  segmentLabel?: (index: number) => string;
  /** The canvas's spoken hint, e.g. "Swipe up or down to change step". */
  canvasHint?: string;
  /** The person grabbed ("start") or let go of ("end") the canvas. */
  onInteraction?: (phase: "start" | "end") => void;
  /** Right-to-left: panels run from right to left, and swiping right goes forward. */
  rtl?: boolean;
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
/** Each segment's own touch target; laid out side by side, so targets never overlap. */
const SEGMENT_TARGET = 28;
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

/**
 * One panel. Every panel is laid out at the same place and moved by its own transform: transforms are physical in
 * every language, so the canvas does not depend on how a right-to-left tree flips rows or `left`. `slot` is where
 * the panel sits in the strip (+1 is one canvas width to the right).
 */
function Panel({
  slot,
  width,
  height,
  field,
  translate,
  children,
  ...a11y
}: {
  slot: number;
  width: number;
  height: number;
  field: string;
  translate: SharedValue<number>;
  children: React.ReactNode;
  importantForAccessibility: "auto" | "no-hide-descendants";
  accessibilityElementsHidden: boolean;
}) {
  const travel = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value + slot * width }] }));
  const art = useAnimatedStyle(() => {
    // 0 when this panel is centred; ±width as it enters or leaves. The art trails the field (layered depth).
    const offset = translate.value + slot * width;
    return { transform: [{ translateX: offset * ART_PARALLAX }] };
  });
  return (
    <Animated.View {...a11y} style={[{ position: "absolute", top: 0, left: 0, width, height, backgroundColor: field, overflow: "hidden" }, travel]}>
      <Animated.View style={[{ flex: 1 }, art]}>{children}</Animated.View>
    </Animated.View>
  );
}

function StoryShell({ panels, index, onIndexChange, progressLabel, segmentLabel, canvasHint, onInteraction, rtl = false, topEnd, footer, canvasHeight, ink, className }: StoryShellProps) {
  const reduced = useReducedMotion();
  const [width, setWidth] = React.useState(0);
  const translate = useSharedValue(0);
  const start = useSharedValue(0);
  /** Whether a drag is under way, and whether it ended by release (pages) rather than being cancelled (settles back). */
  const dragging = useSharedValue(false);
  const released = useSharedValue(false);
  const current = panels[index] ?? panels[0];
  const last = panels.length - 1;
  /** +1 per panel to the right in left-to-right reading, to the left in right-to-left. */
  const dir = rtl ? -1 : 1;

  // Every index change (a swipe's release, auto-advance, a progress tap) travels the canvas to its panel.
  React.useEffect(() => {
    if (width <= 0) return;
    translate.value = withTiming(-dir * index * width, { duration: reduced ? 0 : MOTION.storyPanelMs, easing: Easing.inOut(Easing.cubic) });
  }, [index, width, reduced, translate, dir]);

  const settle = React.useCallback(
    (next: number) => {
      if (next !== index) onIndexChange(next);
      else translate.value = withTiming(-dir * index * width, { duration: reduced ? 0 : SETTLE_MS, easing: Easing.out(Easing.cubic) });
    },
    [index, onIndexChange, translate, width, reduced, dir],
  );

  const interaction = React.useCallback((phase: "start" | "end") => onInteraction?.(phase), [onInteraction]);

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .failOffsetY([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .onStart(() => {
      // The finger takes over mid-travel: stop where the canvas is and follow from there.
      cancelAnimation(translate);
      start.value = translate.value;
      dragging.value = true;
      released.value = false;
      scheduleOnRN(interaction, "start");
    })
    .onUpdate((event) => {
      // The strip's two ends, in physical points: [-last·w, 0] left-to-right, [0, last·w] right-to-left.
      const min = dir > 0 ? -last * width : 0;
      const max = dir > 0 ? 0 : last * width;
      const raw = start.value + event.translationX;
      // Past either end the canvas resists instead of revealing nothing.
      translate.value = raw > max ? max + (raw - max) * EDGE_RESISTANCE : raw < min ? min + (raw - min) * EDGE_RESISTANCE : raw;
    })
    .onEnd((event) => {
      released.value = true;
      // Forward is a swipe against the reading direction's flow: leftward in LTR, rightward in RTL.
      const travelled = event.translationX * dir;
      const velocity = event.velocityX * dir;
      const forward = travelled < -width * PAGE_THRESHOLD || velocity < -FLICK_VELOCITY;
      const backward = travelled > width * PAGE_THRESHOLD || velocity > FLICK_VELOCITY;
      const next = Math.min(last, Math.max(0, index + (forward ? 1 : backward ? -1 : 0)));
      scheduleOnRN(settle, next);
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
      // A drag taken away (a system gesture, a sheet) settles on the current panel instead of stranding mid-way.
      if (!released.value) scheduleOnRN(settle, index);
      scheduleOnRN(interaction, "end");
    });

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment" && index < last) onIndexChange(index + 1);
    if (event.nativeEvent.actionName === "decrement" && index > 0) onIndexChange(index - 1);
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View className={cn("flex-1", className)}>
      <GestureDetector gesture={pan}>
        <View
          className="overflow-hidden"
          style={{ height: canvasHeight, marginHorizontal: CANVAS_MARGIN, borderRadius: CANVAS_RADIUS }}
          onLayout={onLayout}
        >
          {/* Every panel is placed by its own transform, so the strip is the same in every reading direction. */}
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={current?.title}
            accessibilityValue={{ text: progressLabel(index + 1, panels.length) }}
            {...(canvasHint ? { accessibilityHint: canvasHint } : {})}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={onAccessibilityAction}
            style={{ width: width || 1, height: canvasHeight }}
          >
            {panels.map((panel, i) => (
              <Panel
                key={panel.key}
                slot={dir * i}
                width={width || 1}
                height={canvasHeight}
                field={panel.field}
                translate={translate}
                importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
                accessibilityElementsHidden={i !== index}
              >
                {panel.art}
              </Panel>
            ))}
          </View>
          {/* Progress and the top-end slot float over the canvas. */}
          <View pointerEvents="box-none" className="absolute inset-x-0 top-0 flex-row items-center justify-between px-5 pt-4">
            <View className="flex-row items-center">
              {panels.map((panel, i) => (
                <Pressable
                  key={panel.key}
                  accessibilityRole="button"
                  accessibilityLabel={segmentLabel ? segmentLabel(i + 1) : progressLabel(i + 1, panels.length)}
                  accessibilityState={{ selected: i === index }}
                  onPress={() => onIndexChange(i)}
                  className="items-center justify-center"
                  style={{ height: SEGMENT_TARGET, minWidth: (i === index ? SEGMENT_ACTIVE_WIDTH : SEGMENT_WIDTH) + SEGMENT_GAP }}
                >
                  <View
                    style={{
                      width: i === index ? SEGMENT_ACTIVE_WIDTH : SEGMENT_WIDTH,
                      height: SEGMENT_HEIGHT,
                      borderRadius: SEGMENT_HEIGHT * HALF,
                      backgroundColor: ink,
                      opacity: i === index ? SEGMENT_ACTIVE_OPACITY : SEGMENT_OPACITY,
                    }}
                  />
                </Pressable>
              ))}
            </View>
            {topEnd}
          </View>
        </View>
      </GestureDetector>

      {/* The copy area takes what is left, so a longer title never moves the footer (M01: the CTA is fixed). */}
      <View className="flex-1 px-6 pt-5">
        <ScrollView className="flex-1" contentContainerClassName="pb-2" showsVerticalScrollIndicator={false}>
          <Animated.View key={current?.key} entering={FadeIn.duration(COPY_MS).delay(reduced ? 0 : COPY_MS)} exiting={FadeOut.duration(COPY_MS)} className="gap-2">
            <Text accessibilityRole="header" className={cn("font-display text-foreground text-3xl font-bold leading-tight", TEXT_START)}>
              {current?.title}
            </Text>
            <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{current?.body}</Text>
          </Animated.View>
        </ScrollView>
        <View className="gap-3 pb-2">{footer}</View>
      </View>
    </View>
  );
}

export { StoryShell };
export type { StoryPanel, StoryShellProps };
