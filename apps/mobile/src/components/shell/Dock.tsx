/**
 * The phone dock (Senryo's, in Kawase's tab set): an icon-only glass capsule floating above the home indicator, a bubble
 * that slides to the active slot on a spring, an optional centre action (the voice orb), a count badge for the "needs
 * you" queue. No labels on screen (assistive technology reads them). It hides under every sheet and while the keyboard is
 * up: it slides down 120 pt and fades, restoring when the last holder lets go (`useDock`). The slots are measured, so
 * the bubble follows the reading direction (Arabic and Urdu mirror the bar) without a per-language rule.
 * The destinations are the tabs; an `action` slot does something instead of going somewhere (a button, never selected).
 * The tab set itself is the caller's: Stage 3 changes it without touching this.
 */
import { type ReactNode, type Ref, useEffect, useState } from "react";
import { Keyboard, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fire } from "@/feedback/fire";

import { GlassPlate } from "../kit/GlassPlate";
import { Icon, type SymbolIcon } from "../kit/icons";
import { dockBottom, EASE, SIZE, SPACE, SPRING, TIMING, TYPE, useTheme } from "../kit/theme";
import { usePressScale } from "../kit/usePressScale";
import { useDock } from "./dock-context";

const DOCK_HIDDEN_OFFSET = 120;
const SLOT = SIZE.touch + SPACE.sm;
const BADGE_MAX = 99;
const BADGE = 16;
const ICON = 24;
const ACTIVE_STROKE = 2.4;
const BAR_RADIUS = 40;

export type DockItem = {
  key: string;
  /** Accessibility label (no text is drawn). */
  label: string;
  icon?: SymbolIcon;
  /** A custom slot (the orb). */
  render?: (active: boolean) => ReactNode;
  badge?: number;
  /** Does something rather than going somewhere: a button, never the selected tab. */
  action?: boolean;
  /** The slot's own view, for an overlay that rises from it and gives focus back to it. */
  slotRef?: Ref<View>;
};

export function Dock({ items, activeKey, onPress }: { items: readonly DockItem[]; activeKey: string; onPress: (key: string) => void }) {
  const { hidden } = useDock();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [typing, setTyping] = useState(false);
  const shown = !hidden && !typing;
  const offset = useSharedValue(shown ? 0 : DOCK_HIDDEN_OFFSET);
  const [slots, setSlots] = useState<Readonly<Record<string, { x: number; w: number }>>>({});
  const bubbleX = useSharedValue(0);
  const bubbleW = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setTyping(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    offset.set(withTiming(shown ? 0 : DOCK_HIDDEN_OFFSET, { duration: reduce ? TIMING.reducedMotion : TIMING.selection, easing: EASE }));
  }, [shown, reduce, offset]);

  const active = slots[activeKey];
  const activeSelectable = items.some((item) => item.key === activeKey && !item.action);
  useEffect(() => {
    if (!active) return;
    if (reduce || bubbleW.get() === 0) {
      bubbleX.set(active.x);
      bubbleW.set(active.w);
      return;
    }
    bubbleX.set(withSpring(active.x, SPRING.dockBubble));
    bubbleW.set(withSpring(active.w, SPRING.dockBubble));
  }, [active, reduce, bubbleX, bubbleW]);

  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const bubble = useAnimatedStyle(() => ({ width: bubbleW.get(), transform: [{ translateX: bubbleX.get() }] }));
  const { color } = useTheme();

  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      style={[styles.position, { bottom: dockBottom(insets.bottom), opacity: shown ? 1 : 0 }, motion]}
    >
      <GlassPlate style={styles.bar}>
        <View style={styles.row} accessibilityRole="tablist">
          {activeSelectable && active ? (
            <Animated.View pointerEvents="none" style={[styles.bubble, { backgroundColor: color.glassBubble, borderColor: color.glassBubbleRim }, bubble]} />
          ) : null}
          {items.map((item) => (
            <DockSlot
              key={item.key}
              item={item}
              selected={!item.action && item.key === activeKey}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setSlots((prev) => (prev[item.key]?.x === x && prev[item.key]?.w === width ? prev : { ...prev, [item.key]: { x, w: width } }));
              }}
              onPress={() => {
                if (item.action || item.key !== activeKey) fire("tick");
                onPress(item.key);
              }}
            />
          ))}
        </View>
      </GlassPlate>
    </Animated.View>
  );
}

function DockSlot({ item, selected, onPress, onLayout }: { item: DockItem; selected: boolean; onPress: () => void; onLayout: (e: LayoutChangeEvent) => void }) {
  const { color } = useTheme();
  const press = usePressScale();
  return (
    <Pressable
      ref={item.slotRef}
      onLayout={onLayout}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole={item.action ? "button" : "tab"}
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
      accessibilityState={item.action ? {} : { selected }}
      style={styles.slot}
    >
      <Animated.View style={press.style}>
        {item.render ? item.render(selected) : item.icon ? <Icon icon={item.icon} size={ICON} tint={selected ? color.ink : color.text3} strokeWidth={selected ? ACTIVE_STROKE : undefined} /> : null}
      </Animated.View>
      {item.badge ? (
        <View style={[styles.badge, { backgroundColor: color.accent }]} pointerEvents="none">
          <Text style={[TYPE.tabLabel, { color: color.accentForeground }]}>{item.badge > BADGE_MAX ? `${BADGE_MAX}+` : item.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  position: { position: "absolute", alignSelf: "center" },
  bar: { borderRadius: BAR_RADIUS, minHeight: 60, paddingHorizontal: SPACE.sm, justifyContent: "center", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  bubble: { position: "absolute", top: 4, bottom: 4, left: 0, borderRadius: BAR_RADIUS, borderWidth: 1 },
  slot: { width: SLOT, minHeight: SIZE.touch, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 2,
    end: 4,
    minWidth: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    paddingHorizontal: SPACE.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
