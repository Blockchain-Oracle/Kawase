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
import { MOTION, SPRING } from "@kawase/config";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import * as React from "react";
import { Pressable, ScrollView, View, type AccessibilityActionEvent, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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
const HALF = 0.5;
const SEGMENT_ACTIVE_WIDTH = 22;
/** Each segment's own touch target; laid out side by side, so targets never overlap. */
const SEGMENT_TARGET = 44;
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
/** The copy moves at this share of the field's travel, and is fully faded by 1 / COPY_FADE of a panel. */
const COPY_TRAVEL = 0.35;
const COPY_FADE = 1.8;

function StoryCopy({
  panel,
  slot,
  width,
  translate,
  active,
  onHeight,
}: {
  panel: StoryPanel;
  slot: number;
  width: number;
  translate: SharedValue<number>;
  active: boolean;
  onHeight: (height: number) => void;
}) {
  // The copy travels with its panel (M01: copy changes mid-travel), at a share of the field's speed, and fades
  // faster than it moves, so mid-swipe reads as motion rather than two texts overlapping in place.
  const style = useAnimatedStyle(() => {
    const offset = translate.value / width + slot;
    return {
      opacity: Math.max(0, 1 - Math.abs(offset) * COPY_FADE),
      transform: [{ translateX: offset * width * COPY_TRAVEL }],
    };
  });
  return (
    <Animated.View
      style={[{ position: "absolute", left: 0, right: 0 }, style]}
      className="gap-2"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      pointerEvents="none"
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      <Text
        accessibilityRole="header"
        className={cn("font-display text-foreground text-3xl font-bold leading-tight", TEXT_START)}
      >
        {panel.title}
      </Text>
      <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{panel.body}</Text>
    </Animated.View>
  );
}

function StorySegment({
  slot,
  width,
  translate,
  ink,
}: {
  slot: number;
  width: number;
  translate: SharedValue<number>;
  ink: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity:
      SEGMENT_OPACITY +
      (SEGMENT_ACTIVE_OPACITY - SEGMENT_OPACITY) * Math.max(0, 1 - Math.abs(translate.value / width + slot)),
  }));
  return (
    <Animated.View
      style={[
        {
          width: SEGMENT_ACTIVE_WIDTH,
          height: SEGMENT_HEIGHT,
          borderRadius: SEGMENT_HEIGHT * HALF,
          backgroundColor: ink,
        },
        style,
      ]}
    />
  );
}

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
    <Animated.View
      {...a11y}
      style={[
        { position: "absolute", top: 0, left: 0, width, height, backgroundColor: field, overflow: "hidden" },
        travel,
      ]}
    >
      <Animated.View style={[{ flex: 1 }, art]}>{children}</Animated.View>
    </Animated.View>
  );
}

function StoryShell({
  panels,
  index,
  onIndexChange,
  progressLabel,
  segmentLabel,
  canvasHint,
  onInteraction,
  rtl = false,
  topEnd,
  footer,
  canvasHeight,
  ink,
  className,
}: StoryShellProps) {
  const reduced = useReducedMotionLive();
  const [width, setWidth] = React.useState(0);
  const translate = useSharedValue(0);
  const start = useSharedValue(0);
  /** Whether a drag is under way, and whether it ended by release (pages) rather than being cancelled (settles back). */
  const dragging = useSharedValue(false);
  const released = useSharedValue(false);
  const target = useSharedValue(index);
  const published = React.useRef(index);
  const requested = React.useRef(index);
  const geometry = React.useRef({ width: 0, dir: rtl ? -1 : 1 });
  const previousReduced = React.useRef(reduced);
  const [copyHeight, setCopyHeight] = React.useState(0);
  const current = panels[index] ?? panels[0];
  const last = panels.length - 1;
  /** +1 per panel to the right in left-to-right reading, to the left in right-to-left. */
  const dir = rtl ? -1 : 1;

  const publish = React.useCallback(
    (next: number) => {
      published.current = next;
      requested.current = next;
      onIndexChange(next);
      onInteraction?.("end");
    },
    [onIndexChange, onInteraction],
  );

  // Only externally requested travel starts here. Gesture release starts immediately on the UI thread.
  React.useEffect(() => {
    if (width <= 0) return;
    const changedGeometry =
      geometry.current.width !== width || geometry.current.dir !== dir || (reduced && !previousReduced.current);
    geometry.current = { width, dir };
    previousReduced.current = reduced;
    if (changedGeometry) {
      cancelAnimation(translate);
      target.value = index;
      translate.value = -dir * index * width;
      published.current = index;
      requested.current = index;
      onInteraction?.("end");
      return;
    }
    if (published.current === index || requested.current === index) return;
    requested.current = index;
    target.value = index;
    translate.value = withTiming(
      -dir * index * width,
      { duration: reduced ? 0 : MOTION.storyPanelMs, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(publish, index);
      },
    );
  }, [index, width, reduced, translate, target, dir, publish]);

  const interaction = React.useCallback((phase: "start" | "end") => onInteraction?.(phase), [onInteraction]);

  // Built once per geometry, never per render: a new gesture object on every render reconfigures the detector,
  // which can hitch an active drag. Everything inside runs on the UI thread.
  const pan = React.useMemo(() => {
    const settle = (next: number, velocity: number) => {
      "worklet";
      target.value = next;
      const to = -dir * next * width;
      const done = (finished?: boolean) => {
        "worklet";
        if (finished) scheduleOnRN(publish, next);
      };
      // A release carries the finger's speed into the settle (a flick lands faster than a slow drag).
      translate.value = reduced
        ? withTiming(to, { duration: 0 }, done)
        : withSpring(to, { ...SPRING.layout, velocity, overshootClamping: true }, done);
    };
    return Gesture.Pan()
    .activeOffsetX([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .failOffsetY([-ACTIVE_OFFSET, ACTIVE_OFFSET])
    .onStart((event) => {
      // The finger takes over mid-travel: stop where the canvas is and follow from there. The activation distance
      // is already in translationX, so subtract it or the canvas would jump by it on grab.
      cancelAnimation(translate);
      start.value = translate.value - event.translationX;
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
      translate.value =
        raw > max ? max + (raw - max) * EDGE_RESISTANCE : raw < min ? min + (raw - min) * EDGE_RESISTANCE : raw;
    })
    .onEnd((event) => {
      released.value = true;
      // Forward is a swipe against the reading direction's flow: leftward in LTR, rightward in RTL.
      const travelled = event.translationX * dir;
      const velocity = event.velocityX * dir;
      const forward = travelled < -width * PAGE_THRESHOLD || velocity < -FLICK_VELOCITY;
      const backward = travelled > width * PAGE_THRESHOLD || velocity > FLICK_VELOCITY;
      const nearest = Math.round((-dir * start.value) / width);
      const next = Math.min(last, Math.max(0, nearest + (forward ? 1 : backward ? -1 : 0)));
      settle(next, event.velocityX);
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
      // A drag taken away (a system gesture, a sheet) settles on the current panel instead of stranding mid-way.
      if (!released.value) settle(Math.min(last, Math.max(0, target.value)), 0);
    });
  }, [width, dir, last, reduced, publish, interaction, translate, start, dragging, released, target]);

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
          <View
            pointerEvents="box-none"
            className="absolute inset-x-0 top-0 flex-row items-center justify-between px-5 pt-4"
          >
            <View className="flex-row items-center">
              {panels.map((panel, i) => (
                <Pressable
                  key={panel.key}
                  accessibilityRole="button"
                  accessibilityLabel={segmentLabel ? segmentLabel(i + 1) : progressLabel(i + 1, panels.length)}
                  accessibilityState={{ selected: i === index }}
                  onPress={() => onIndexChange(i)}
                  className="items-center justify-center"
                  style={{ height: SEGMENT_TARGET, minWidth: SEGMENT_ACTIVE_WIDTH + SEGMENT_GAP }}
                >
                  <StorySegment slot={dir * i} width={width || 1} translate={translate} ink={ink} />
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
          <View style={{ height: copyHeight }}>
            {panels.map((panel, i) => (
              <StoryCopy
                key={panel.key}
                panel={panel}
                slot={dir * i}
                width={width || 1}
                translate={translate}
                active={i === index}
                onHeight={(height) => setCopyHeight((previous) => Math.max(previous, height))}
              />
            ))}
          </View>
        </ScrollView>
        <View className="gap-3 pb-2">{footer}</View>
      </View>
    </View>
  );
}

export { StoryShell };
export type { StoryPanel, StoryShellProps };
