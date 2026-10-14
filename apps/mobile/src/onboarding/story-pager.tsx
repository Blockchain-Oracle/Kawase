// The story's pager (Senryo's Story.tsx, in Kawase's kit): the scenes sit side by side and the whole row follows the
// finger on the UI thread — `position` is the scene index as a float, so a drag never re-renders React. The art travels
// with the page and its copy a little slower, fading as it leaves, so a swipe reads as depth, not a flat slide. A
// release settles on a spring that carries the finger's speed (a flick moves one scene whatever the distance); a tap on
// the reading end goes forward, on the other end back; the segments jump; assistive technology adjusts the story.
// Reading direction mirrors the swipe and the travel. Reduce Motion: nothing travels, the scenes crossfade.
import * as React from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { CONTROL_FONT_SCALE, EASE, RADIUS, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit/theme";

export type StoryScene = {
  key: string;
  title: string;
  body: string;
  art: (state: { playing: boolean; still: boolean }) => React.ReactNode;
};

/** Horizontal travel before a touch becomes a swipe, so a tap stays a tap. */
const PAN_ACTIVATE = 12;
/** A swipe faster than this (pt/s) moves one scene regardless of distance. */
const FLICK_VELOCITY = 500;
/** A tap on this share of the stage, at the start edge, goes back. */
const BACK_ZONE = 0.33;
/** The copy travels this share of the art's distance. */
const COPY_DEPTH = 0.35;
/** The copy is gone this far (in scenes) from the centre. */
const COPY_FADE = 0.6;
const SETTLE = { damping: 30, stiffness: 250, mass: 0.8, overshootClamping: true } as const;
const SEGMENT_W = 28;
const SEGMENT_H = 4;
/** Half a touch target tall; the hit slop makes up the rest. */
const HALF = 2;
const SEGMENT_TAP_H = SIZE.touch / HALF;

export function StoryPager({
  scenes,
  index,
  onSettle,
  onLanded,
  onInteraction,
  rtl,
  reduce,
  animate,
  progressLabel,
  segmentLabel,
  hint,
}: {
  scenes: readonly StoryScene[];
  /** The scene the story is on; changing it from outside (auto-advance, a segment) moves the pager. */
  index: number;
  /** The pager came to rest on a scene (after a drag, a tap or a move from outside). */
  onSettle: (index: number) => void;
  /** The pager stopped moving on a new scene (its sound plays here, never mid-travel). */
  onLanded: (index: number) => void;
  /** A drag started or ended (narration stops on the start; the dwell restarts on the end). */
  onInteraction: (phase: "start" | "end") => void;
  rtl: boolean;
  reduce: boolean;
  /** The scene on screen may play its event (false while covered or in the background). */
  animate: boolean;
  progressLabel: (n: number, total: number) => string;
  segmentLabel: (n: number) => string;
  /** How to move through the story, for assistive technology. */
  hint: string;
}) {
  const last = scenes.length - 1;
  const position = useSharedValue(index);
  const width = useSharedValue(1);
  const start = useSharedValue(0);
  const ended = useSharedValue(false);
  const [measured, setMeasured] = React.useState(0);
  const sign = rtl ? -1 : 1;
  const settledAt = React.useRef(index);

  const settled = React.useCallback(
    (to: number) => {
      if (settledAt.current === to) return;
      settledAt.current = to;
      onSettle(to);
      onLanded(to);
    },
    [onSettle, onLanded],
  );

  // A move from outside (auto-advance, a segment, assistive technology): travel there; it has landed when it stops.
  React.useEffect(() => {
    if (settledAt.current === index && Math.round(position.get()) === index) return;
    settledAt.current = index;
    const duration = reduce ? TIMING.reducedMotion : TIMING.onboardingScene;
    position.set(
      withTiming(index, { duration, easing: EASE }, (finished) => {
        if (finished) scheduleOnRN(onLanded, index);
      }),
    );
  }, [index, reduce, position, onLanded]);

  const step = React.useCallback(
    (by: number) => {
      const to = Math.max(0, Math.min(last, settledAt.current + by));
      if (to !== settledAt.current) onSettle(to);
    },
    [last, onSettle],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-PAN_ACTIVATE, PAN_ACTIVATE])
    .failOffsetY([-PAN_ACTIVATE, PAN_ACTIVATE])
    .onStart(() => {
      ended.set(false);
      cancelAnimation(position);
      start.set(position.get());
      scheduleOnRN(onInteraction, "start");
    })
    .onUpdate((e) => {
      if (reduce) return;
      position.set(Math.max(0, Math.min(last, start.get() - (sign * e.translationX) / width.get())));
    })
    .onEnd((e) => {
      ended.set(true);
      const velocity = sign * e.velocityX;
      const flick = Math.abs(velocity) > FLICK_VELOCITY ? -Math.sign(velocity) : 0;
      const dragged = Math.round(start.get() - (sign * e.translationX) / width.get());
      const to = Math.max(0, Math.min(last, flick === 0 ? dragged : Math.round(start.get()) + flick));
      scheduleOnRN(onInteraction, "end");
      if (reduce) {
        position.set(to);
        scheduleOnRN(settled, to);
        return;
      }
      position.set(
        withSpring(to, { ...SETTLE, velocity: -velocity / width.get() }, (finished) => {
          if (finished) scheduleOnRN(settled, to);
        }),
      );
    })
    .onFinalize(() => {
      if (ended.get()) return;
      const to = Math.round(position.get());
      position.set(withSpring(to, SETTLE));
      scheduleOnRN(settled, to);
    });
  const tap = Gesture.Tap().onEnd((e) => {
    const fromStart = rtl ? width.get() - e.x : e.x;
    scheduleOnRN(step, fromStart < width.get() * BACK_ZONE ? -1 : 1);
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(1, e.nativeEvent.layout.width);
    width.set(w);
    setMeasured(w);
  };

  const scene = scenes[index] ?? scenes[0]!;
  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View
          style={styles.stage}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityHint={hint}
          accessibilityLabel={`${scene.title} ${scene.body}`}
          accessibilityValue={{ text: progressLabel(index + 1, scenes.length) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        >
          {measured > 0
            ? scenes.map((item, at) => (
                <SceneArt key={item.key} at={at} position={position} width={measured} sign={sign} reduce={reduce}>
                  {item.art({ playing: animate && at === index, still: reduce })}
                </SceneArt>
              ))
            : null}
        </View>
      </GestureDetector>
      <View style={styles.copyArea} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CopySizer scenes={scenes} />
        {measured > 0
          ? scenes.map((item, at) => (
              <SceneCopy key={item.key} scene={item} at={at} position={position} width={measured} sign={sign} reduce={reduce} />
            ))
          : null}
      </View>
      <Segments count={scenes.length} index={index} onPick={onSettle} label={segmentLabel} />
    </View>
  );
}

function SceneArt({
  at,
  position,
  width,
  sign,
  reduce,
  children,
}: {
  at: number;
  position: SharedValue<number>;
  width: number;
  sign: number;
  reduce: boolean;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const offset = at - position.get();
    const away = Math.min(1, Math.abs(offset));
    if (reduce) return { opacity: 1 - away, transform: [{ translateX: 0 }] };
    return { opacity: 1, transform: [{ translateX: offset * width * sign }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sceneArt, style]}>
      {children}
    </Animated.View>
  );
}

function SceneCopy({
  scene,
  at,
  position,
  width,
  sign,
  reduce,
}: {
  scene: StoryScene;
  at: number;
  position: SharedValue<number>;
  width: number;
  sign: number;
  reduce: boolean;
}) {
  const { color } = useTheme();
  const style = useAnimatedStyle(() => {
    const offset = at - position.get();
    const opacity = Math.max(0, 1 - Math.abs(offset) / COPY_FADE);
    return { opacity, transform: [{ translateX: reduce ? 0 : offset * width * COPY_DEPTH * sign }] };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.copy, style]}>
      <CopyText title={scene.title} body={scene.body} ink={color.ink} soft={color.text2} />
    </Animated.View>
  );
}

function CopyText({ title, body, ink, soft }: { title: string; body: string; ink: string; soft: string }) {
  return (
    <>
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.stepTitle, styles.centre, { color: ink }]}>
        {title}
      </Text>
      <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.body, styles.centre, { color: soft }]}>
        {body}
      </Text>
    </>
  );
}

/** Holds the copy area at its longest scene's height, so nothing below it jumps between scenes. */
function CopySizer({ scenes }: { scenes: readonly StoryScene[] }) {
  const longest = scenes.reduce(
    (best, item) => (item.title.length + item.body.length > best.title.length + best.body.length ? item : best),
    scenes[0]!,
  );
  return (
    <View style={[styles.copy, styles.sizer]} pointerEvents="none">
      <CopyText title={longest.title} body={longest.body} ink="transparent" soft="transparent" />
    </View>
  );
}

function Segments({
  count,
  index,
  onPick,
  label,
}: {
  count: number;
  index: number;
  onPick: (index: number) => void;
  label: (n: number) => string;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.segments}>
      {Array.from({ length: count }, (_, at) => (
        <Pressable
          key={at}
          onPress={() => onPick(at)}
          hitSlop={{ top: SPACE.md, bottom: SPACE.md }}
          accessibilityRole="button"
          accessibilityLabel={label(at + 1)}
          accessibilityState={{ selected: at === index }}
          style={styles.segmentTap}
        >
          <View style={[styles.segment, { backgroundColor: at <= index ? color.ink : color.rowPressed }]} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: SPACE.lg, overflow: "hidden" },
  stage: { flex: 1, overflow: "hidden" },
  sceneArt: { justifyContent: "center", paddingHorizontal: SPACE.inset },
  copyArea: { position: "relative", overflow: "hidden" },
  copy: { gap: SPACE.sm, paddingHorizontal: SPACE.xl },
  sizer: { opacity: 0 },
  centre: { textAlign: "center" },
  segments: { flexDirection: "row", gap: SPACE.xs, alignSelf: "center" },
  segmentTap: { width: SEGMENT_W, minHeight: SEGMENT_TAP_H, justifyContent: "center" },
  segment: { height: SEGMENT_H, borderRadius: RADIUS.pill },
});
