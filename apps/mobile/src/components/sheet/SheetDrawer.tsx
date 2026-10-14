/**
 * A sheet on a desktop window is a right drawer (Senryo/Mitoshi web shell: right drawers 384 wide, 16 px off the
 * window's edge, the one stage keeping its place beneath a scrim). It rides the same drawer curve as the phone's sheets,
 * in over `drawerInMs` and out faster; Escape, the scrim and `useSheetClose` leave it; Reduced Motion fades. The same
 * `Sheet` API, so a screen never knows which one it is: detents and `maxHeight` do not apply, the content scrolls.
 */
import { useCallback, useEffect, useRef } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { SurfaceLevel } from "@/components/kit/Surface";
import { EASE, EASE_SHEET, ELEVATION, LAYOUT, SHEET_SHAPE, TIMING, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";

import { ExpandContext, SheetContext } from "./context";
import type { SheetProps } from "./types";

const NOOP = () => undefined;
const BOTH_SIDES = 2;

export function SheetDrawer({ onClose, children, closeLabel, dismissible = true }: SheetProps) {
  const { color } = useTheme();
  const { rtl } = useLocale();
  // The drawer sits at the reading end of the window (the right, or the left in Arabic and Urdu) and slides in from it.
  const side = rtl ? -1 : 1;
  const reduce = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const slide = useSharedValue(LAYOUT.drawer + LAYOUT.inset);
  const scrim = useSharedValue(0);
  const closing = useRef(false);

  useEffect(() => {
    fire("snap");
    scrim.set(withTiming(1, { duration: reduce ? TIMING.reducedMotion : LAYOUT.drawerInMs, easing: EASE }));
    slide.set(reduce ? 0 : withTiming(0, { duration: LAYOUT.drawerInMs, easing: EASE_SHEET }));
  }, [reduce, scrim, slide]);

  const close = useCallback(
    (after?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      const out = { duration: reduce ? TIMING.reducedMotion : LAYOUT.drawerOutMs, easing: EASE };
      scrim.set(withTiming(0, out));
      slide.set(
        withTiming(reduce ? 0 : LAYOUT.drawer + LAYOUT.inset, out, (done) => {
          if (done)
            scheduleOnRN(() => {
              onClose();
              after?.();
            });
        }),
      );
    },
    [onClose, reduce, scrim, slide],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, dismissible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: reduce ? scrim.get() : 1, transform: [{ translateX: slide.get() * side }] }));

  return (
    <View style={styles.root}>
      <SheetContext.Provider value={close}>
        <ExpandContext.Provider value={NOOP}>
          <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]}
              disabled={!dismissible}
              onPress={() => close()}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              ELEVATION.sheet,
              { backgroundColor: color.popover, height: windowHeight - LAYOUT.inset * BOTH_SIDES },
              panelStyle,
            ]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <SurfaceLevel.Provider value={1}>
                <View style={styles.content}>{children}</View>
              </SurfaceLevel.Provider>
            </ScrollView>
          </Animated.View>
        </ExpandContext.Provider>
      </SheetContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  panel: {
    width: LAYOUT.drawer,
    marginEnd: LAYOUT.inset,
    borderRadius: LAYOUT.stageRadius,
    overflow: "hidden",
  },
  content: { padding: SHEET_SHAPE.padding, paddingTop: SHEET_SHAPE.handleTop + SHEET_SHAPE.padding, gap: SHEET_SHAPE.padding },
});
