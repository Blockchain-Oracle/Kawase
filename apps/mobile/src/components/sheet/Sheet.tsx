import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BackHandler, type LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedKeyboard,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWide } from "@kawase/ui-native/lib/wide";
import { scheduleOnRN } from "react-native-worklets";
import { SurfaceLevel } from "@/components/kit/Surface";
import { SHEET_HOLD, useDock } from "@/components/shell/dock-context";
import { fire } from "@/feedback/fire";
import { EASE, EASE_SHEET, ELEVATION, HAIRLINE_PX, RADIUS, SHEET_SHAPE, SIZE, SPRING, TIMING, useTheme } from "@/components/kit/theme";
import { SHEET } from "./constants";
import { ExpandContext, SheetContext, useSheetClose, useSheetExpand } from "./context";
import { SheetDrawer } from "./SheetDrawer";
import { SheetPortal, useSheetDepth, useSheetInPlace } from "./SheetHost";
import type { SheetProps } from "./types";

export { useSheetClose, useSheetExpand };

const DrawerScroll = Animated.createAnimatedComponent(ScrollView);
/**
 * Edge-attached reference sheet: rounded top, dimmed parent and keyboard-aware scrolling. It renders in the root sheet
 * layer (above the tab shell, its dock and any header, D-321) and holds the dock hidden until it has slid away; in a
 * native modal (`SheetInPlace`) it renders in place. Reduced Motion fades instead of travelling.
 */
export function Sheet(props: SheetProps) {
  const id = useId();
  const inPlace = useSheetInPlace();
  const wide = useWide();
  const { hide, show } = useDock();
  useEffect(() => {
    const key = `${SHEET_HOLD}${id}`;
    hide(key);
    return () => show(key);
  }, [hide, show, id]);
  // On a desktop window a sheet is a right drawer (the web shell's one stage keeps its place); elsewhere it rises from the bottom.
  const panel = wide ? <SheetDrawer {...props} /> : <SheetPanel {...props} />;
  return inPlace ? panel : <SheetPortal id={id}>{panel}</SheetPortal>;
}

function SheetPanel({
  onClose,
  children,
  closeLabel,
  maxHeight = SHEET.maxHeight,
  detents,
  dismissible = true,
}: SheetProps) {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduce = useReducedMotion();
  const keyboard = useAnimatedKeyboard();
  const host = useSheetDepth();
  // Detents: the panel is the tallest detent's height, lowered to show the current one.
  const stops = detents && detents.length > 0 ? [...detents].sort((a, b) => a - b) : null;
  const avail = windowHeight - insets.top - SHEET.topGap;
  const tallest = stops ? avail * (stops[stops.length - 1] as number) : 0;
  const offsets = stops ? stops.map((f) => tallest - avail * f) : [0];
  const top = offsets.length - 1;
  const height = useSharedValue(stops ? tallest : windowHeight);
  const drag = useSharedValue(windowHeight);
  const start = useSharedValue(0);
  const at = useSharedValue(0);
  const scrim = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // The page under the sheet steps back with the scrim (0.96 at full), unless another sheet is already holding it there.
  useAnimatedReaction(
    () => scrim.get(),
    (value) => {
      if (host && host.count.get() <= 1) host.depth.set(value);
    },
  );
  const [atTop, setAtTop] = useState(!stops || stops.length === 1);
  const opened = useRef(false);
  const closing = useRef(false);

  const finish = useCallback(
    (after?: () => void) => {
      onClose();
      after?.();
    },
    [onClose],
  );

  const close = useCallback(
    (after?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      const out = { duration: reduce ? TIMING.reducedMotion : TIMING.sheetExit, easing: EASE };
      scrim.set(withTiming(0, out));
      drag.set(withTiming(reduce ? drag.get() : height.get() + SHEET_SHAPE.inset, out, (done) => {
        if (done) scheduleOnRN(finish, after);
      }));
    },
    [drag, finish, height, reduce, scrim],
  );

  const settle = useCallback(
    (i: number) => {
      at.set(i);
      setAtTop(i === top);
      drag.set(withSpring(offsets[i] ?? 0, SPRING.sheetRelease));
      fire("tick");
    },
    [at, drag, offsets, top],
  );
  const expand = useCallback(() => {
    if (stops && at.get() !== top) settle(top);
  }, [at, settle, stops, top]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dismissible) close();
      return true;
    });
    return () => sub.remove();
  }, [close, dismissible]);

  const onLayout = (e: LayoutChangeEvent) => {
    height.set(e.nativeEvent.layout.height);
    if (opened.current) return;
    opened.current = true;
    fire("snap");
    scrim.set(withTiming(1, { duration: reduce ? TIMING.reducedMotion : TIMING.selection, easing: EASE }));
    const rest = offsets[0] ?? 0;
    if (reduce) drag.set(rest);
    else {
      drag.set(e.nativeEvent.layout.height + SHEET_SHAPE.inset);
      drag.set(withTiming(rest, { duration: TIMING.sheetEnter, easing: EASE_SHEET }));
    }
  };

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const native = Gesture.Native();
  // A lone positive offset activates on downward drags only; below the tallest detent an upward drag raises the sheet.
  const pan = Gesture.Pan()
    .enabled(dismissible)
    .activeOffsetY(atTop ? SHEET.activeOffsetY : [-SHEET.activeOffsetY, SHEET.activeOffsetY])
    .failOffsetX([-SHEET.failOffsetX, SHEET.failOffsetX])
    .simultaneousWithExternalGesture(native)
    .onStart(() => {
      start.set(drag.get());
    })
    .onUpdate((e) => {
      // The list owns the drag while it's scrolled (only possible at the tallest detent).
      if (scrollY.get() > 0 && at.get() === top) return;
      const ceiling = offsets[top] ?? 0;
      const next = start.get() + e.translationY;
      drag.set(next >= ceiling ? next : ceiling + (next - ceiling) / SHEET.upwardResistance);
    })
    .onEnd((e) => {
      if (scrollY.get() > 0 && at.get() === top && drag.get() <= (offsets[top] ?? 0)) return;
      if (!stops) {
        const past = drag.get() > Math.min(SHEET.closeDistance, height.get() * SHEET.closeFraction);
        if (past || e.velocityY > SHEET.closeVelocity) scheduleOnRN(close);
        else drag.set(withSpring(0, { ...SPRING.sheetRelease, velocity: e.velocityY }));
        return;
      }
      // Detents: a flick moves one stop; otherwise the nearest; below the lowest by enough, it closes.
      const i = at.get();
      const lowest = offsets[0] ?? 0;
      if (drag.get() > lowest + Math.min(SHEET.closeDistance, (tallest - lowest) * SHEET.closeFraction)) {
        scheduleOnRN(close);
        return;
      }
      let target = i;
      if (e.velocityY < -SHEET.detentVelocity) target = Math.min(top, i + 1);
      else if (e.velocityY > SHEET.detentVelocity) {
        if (i === 0) {
          scheduleOnRN(close);
          return;
        }
        target = i - 1;
      } else {
        let best = Number.POSITIVE_INFINITY;
        offsets.forEach((o, k) => {
          const d = Math.abs(drag.get() - o);
          if (d < best) {
            best = d;
            target = k;
          }
        });
      }
      if (target === i) drag.set(withSpring(offsets[i] ?? 0, { ...SPRING.sheetRelease, velocity: e.velocityY }));
      else scheduleOnRN(settle, target);
    });

  const panelStyle = useAnimatedStyle(() =>
    stops
      ? { height: tallest, opacity: reduce ? scrim.get() : 1, transform: [{ translateY: drag.get() }] }
      : {
          maxHeight: Math.max(0, Math.min(windowHeight * maxHeight, windowHeight - insets.top - keyboard.height.get())),
          opacity: reduce ? scrim.get() : 1,
          transform: [{ translateY: drag.get() - keyboard.height.get() }],
        },
  );
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  // The panel reaches into the home-indicator band; its content stops above it (and above the keyboard's top edge).
  const keyboardPad = useAnimatedStyle(() => ({
    paddingBottom:
      Math.max(SHEET_SHAPE.padding, insets.bottom - SHEET_SHAPE.inset - keyboard.height.get()) +
      (stops ? keyboard.height.get() : 0),
  }));

  return (
    <View style={styles.root}>
      <SheetContext.Provider value={close}>
        <ExpandContext.Provider value={expand}>
          <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]}
              disabled={!dismissible}
              onPress={() => close()}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
            />
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={onLayout}
              accessibilityViewIsModal
              onAccessibilityEscape={() => {
                if (dismissible) close();
              }}
              style={[styles.panel, ELEVATION.sheet, { backgroundColor: color.popover }, panelStyle]}
            >
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  styles.edge,
                  { boxShadow: `inset 0px ${HAIRLINE_PX}px 0px 0px ${color.surfaceRim}` },
                ]}
              />
              <View
                style={styles.handleZone}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View
                  style={[styles.handle, { backgroundColor: dismissible ? color.sheetHandle : color.transparent }]}
                />
              </View>
              <GestureDetector gesture={native}>
                <DrawerScroll
                  onScroll={onScroll}
                  scrollEnabled={atTop}
                  scrollEventThrottle={SHEET.scrollThrottle}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <SurfaceLevel.Provider value={1}>
                    <Animated.View style={[styles.content, keyboardPad]}>{children}</Animated.View>
                  </SurfaceLevel.Provider>
                </DrawerScroll>
              </GestureDetector>
            </Animated.View>
          </GestureDetector>
        </ExpandContext.Provider>
      </SheetContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  panel: {
    marginHorizontal: SHEET_SHAPE.inset,
    marginBottom: SHEET_SHAPE.inset,
    borderTopLeftRadius: SHEET_SHAPE.radius,
    borderTopRightRadius: SHEET_SHAPE.radius,
    overflow: "hidden",
  },
  edge: { borderTopLeftRadius: SHEET_SHAPE.radius, borderTopRightRadius: SHEET_SHAPE.radius },
  handleZone: { alignItems: "center", paddingTop: SHEET_SHAPE.handleTop, paddingBottom: SHEET_SHAPE.handleBottom },
  handle: { width: SIZE.handleWidth, height: SIZE.handleHeight, borderRadius: RADIUS.pill },
  content: { paddingHorizontal: SHEET_SHAPE.padding, gap: SHEET_SHAPE.padding },
});
