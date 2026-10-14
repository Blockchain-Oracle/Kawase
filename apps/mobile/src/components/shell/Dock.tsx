/**
 * The phone dock (Senryo's): an icon-only glass capsule floating above the home indicator, a bubble that slides to the
 * active slot on a spring, an optional centre action, a count badge. No labels on screen (assistive technology reads
 * them). It hides under every sheet and while the keyboard is up: it slides down 120 pt and fades, restoring when the
 * last holder lets go (`useDock`). The destinations are the tabs; an `action` slot does something instead of going
 * somewhere (a button, never selected), and may also answer a hold (the centre: tap for the + fan, hold for voice).
 *
 * Reading direction: the slots are measured in physical pixels, the row is measured too, and the bubble is placed from
 * the reading edge (`start`), so it lands on the right slot in Arabic and Urdu on the phone and on the web alike.
 */
import { type ReactNode, type Ref, useEffect, useState } from "react";
import { Keyboard, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";

import { GlassPlate } from "../kit/GlassPlate";
import { Icon, type SymbolIcon } from "../kit/icons";
import { DOCK, dockBottom, EASE, SIZE, SPACE, SPRING, TIMING, TYPE, useTheme } from "../kit/theme";
import { usePressScale } from "../kit/usePressScale";
import { useDock } from "./dock-context";

const DOCK_HIDDEN_OFFSET = 120;
const SLOT = SIZE.touch + SPACE.sm;
const BADGE_MAX = 99;
const BADGE = 16;
const HALF = 2;
const ICON = 24;
const ACTIVE_STROKE = 2.4;
const BAR_RADIUS = 40;
/** A hold opens the centre's second action (voice) a little sooner than the system's 500 ms. */
const HOLD_MS = 350;

export type DockItem = {
  key: string;
  /** Accessibility label (no text is drawn). */
  label: string;
  icon?: SymbolIcon;
  /** A custom slot (the centre button). */
  render?: (active: boolean) => ReactNode;
  badge?: number;
  /** Does something rather than going somewhere: a button, never the selected tab. */
  action?: boolean;
  /** What a hold does (the centre's voice), and its name for assistive technology. */
  hold?: { label: string; run: () => void };
  /** Whether the action's surface is open (the fan), read out as expanded. */
  expanded?: boolean;
  /** The slot's own view, for an overlay that rises from it and gives focus back to it. */
  slotRef?: Ref<View>;
};

type Slot = { x: number; w: number };

export function Dock({
  items,
  activeKey,
  onPress,
  forceShown = false,
}: {
  items: readonly DockItem[];
  activeKey: string;
  onPress: (key: string) => void;
  /** Stay up even while something holds the dock away (the fan's own scrim covers the page, not the dock). */
  forceShown?: boolean;
}) {
  const { hidden } = useDock();
  const { rtl } = useLocale();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [typing, setTyping] = useState(false);
  const shown = forceShown || (!hidden && !typing);
  const offset = useSharedValue(shown ? 0 : DOCK_HIDDEN_OFFSET);
  const [slots, setSlots] = useState<Readonly<Record<string, Slot>>>({});
  const [rowWidth, setRowWidth] = useState(0);
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
    offset.set(
      withTiming(shown ? 0 : DOCK_HIDDEN_OFFSET, {
        duration: reduce ? TIMING.reducedMotion : TIMING.selection,
        easing: EASE,
      }),
    );
  }, [shown, reduce, offset]);

  const active = slots[activeKey];
  const activeSelectable = items.some((item) => item.key === activeKey && !item.action);
  // Distance of the active slot from the reading edge: from the left in a left-to-right language, from the right in
  // Arabic and Urdu (the layout's x is always physical).
  const fromStart = active && rowWidth > 0 ? (rtl ? rowWidth - active.x - active.w : active.x) : undefined;
  useEffect(() => {
    if (!active || fromStart === undefined) return;
    if (reduce || bubbleW.get() === 0) {
      bubbleX.set(fromStart);
      bubbleW.set(active.w);
      return;
    }
    bubbleX.set(withSpring(fromStart, SPRING.dockBubble));
    bubbleW.set(withSpring(active.w, SPRING.dockBubble));
  }, [active, fromStart, reduce, bubbleX, bubbleW]);

  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const sign = rtl ? -1 : 1;
  const bubble = useAnimatedStyle(() => ({
    width: bubbleW.get(),
    transform: [{ translateX: bubbleX.get() * sign }],
  }));
  const { color } = useTheme();

  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "auto" : "no-hide-descendants"}
      style={[styles.position, { bottom: dockBottom(insets.bottom), opacity: shown ? 1 : 0 }, motion]}
    >
      <GlassPlate style={styles.bar}>
        <View
          style={styles.row}
          accessibilityRole="tablist"
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        >
          {activeSelectable && active && fromStart !== undefined ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.bubble, { backgroundColor: color.glassBubble, borderColor: color.glassBubbleRim }, bubble]}
            />
          ) : null}
          {items.map((item) => (
            <DockSlot
              key={item.key}
              item={item}
              selected={!item.action && item.key === activeKey}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setSlots((prev) =>
                  prev[item.key]?.x === x && prev[item.key]?.w === width
                    ? prev
                    : { ...prev, [item.key]: { x, w: width } },
                );
              }}
              onPress={() => {
                // Navigation and the fan's opening are ticks: a haptic, never a sound.
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

function DockSlot({
  item,
  selected,
  onPress,
  onLayout,
}: {
  item: DockItem;
  selected: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const hold = item.hold;
  return (
    <Pressable
      ref={item.slotRef}
      onLayout={onLayout}
      onPress={onPress}
      {...(hold
        ? {
            delayLongPress: HOLD_MS,
            onLongPress: () => {
              fire("press");
              hold.run();
            },
            accessibilityActions: [{ name: "longpress", label: hold.label }],
            onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
              if (e.nativeEvent.actionName === "longpress") hold.run();
            },
          }
        : {})}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole={item.action ? "button" : "tab"}
      accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
      accessibilityState={
        item.action ? (item.expanded === undefined ? {} : { expanded: item.expanded }) : { selected }
      }
      style={styles.slot}
    >
      <Animated.View style={press.style}>
        {item.render ? (
          item.render(selected)
        ) : item.icon ? (
          <Icon
            icon={item.icon}
            size={ICON}
            tint={selected ? color.ink : color.text3}
            strokeWidth={selected ? ACTIVE_STROKE : undefined}
          />
        ) : null}
      </Animated.View>
      {item.badge ? (
        <View style={[styles.badge, { backgroundColor: color.accent }]} pointerEvents="none">
          <Text style={[TYPE.tabLabel, { color: color.accentForeground }]}>
            {item.badge > BADGE_MAX ? `${BADGE_MAX}+` : item.badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  position: { position: "absolute", alignSelf: "center" },
  bar: {
    borderRadius: BAR_RADIUS,
    minHeight: DOCK.height - SPACE.sm,
    paddingHorizontal: SPACE.sm,
    justifyContent: "center",
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  bubble: { position: "absolute", top: 4, bottom: 4, start: 0, borderRadius: BAR_RADIUS, borderWidth: 1 },
  slot: { width: SLOT, minHeight: SIZE.touch, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 2,
    end: 4,
    minWidth: BADGE,
    height: BADGE,
    borderRadius: BADGE / HALF,
    paddingHorizontal: SPACE.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
