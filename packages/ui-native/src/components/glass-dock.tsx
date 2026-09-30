// The floating glass dock (Fomo F12/M09/M10, in Kawase's material): five slots in a translucent capsule above the
// home indicator, a bubble that slides to the active slot, the orb in the centre, an optional count badge (the
// "needs you" queue). `orientation="rail"` stands it up for wide screens (Stage 13). Content scrolls behind it.
import { DOCK, MOTION } from "@kawase/config";
import { Glass } from "@kawase/ui-native/components/glass";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import type { LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

type DockItem = {
  key: string;
  /** Accessibility label and the label under the icon on the rail. */
  label: string;
  icon?: LucideIcon;
  /** A custom slot (the orb). */
  render?: (active: boolean) => React.ReactNode;
  badge?: number;
};

type GlassDockProps = {
  items: readonly DockItem[];
  activeKey: string;
  onPress: (key: string) => void;
  scheme: "light" | "dark";
  /** The `glass` token as hex. */
  tint: string;
  orientation?: "bar" | "rail";
  /** Extra bottom inset (the home indicator). */
  bottomInset?: number;
  className?: string;
};

const SLOT_SIZE = 48;
const BADGE_MAX = 99;
const SPRING = { damping: 18, stiffness: 220 };
const HALF = 0.5;
/** The capsule's inner padding so a slot sits centred in the dock height. */
const SLOT_PADDING = (DOCK.heightPt - SLOT_SIZE) * HALF;
const ICON_STROKE_ACTIVE = 2.4;
const ICON_STROKE = 2;

function GlassDock({ items, activeKey, onPress, scheme, tint, orientation = "bar", bottomInset = 0, className }: GlassDockProps) {
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const rail = orientation === "rail";

  // Slots have a fixed size and no gap, so the bubble's travel is the index times the slot.
  React.useEffect(() => {
    const target = activeIndex * SLOT_SIZE;
    offset.value = reduced ? withTiming(target, { duration: 0 }) : withSpring(target, SPRING);
  }, [activeIndex, offset, reduced]);

  const bubbleStyle = useAnimatedStyle(() =>
    rail ? { transform: [{ translateY: offset.value }] } : { transform: [{ translateX: offset.value }] },
  );

  return (
    <View
      pointerEvents="box-none"
      className={cn(rail ? "absolute inset-y-0 start-0 justify-center" : "absolute inset-x-0 bottom-0 items-center", className)}
      style={rail ? { paddingStart: DOCK.sideInsetPt } : { paddingBottom: bottomInset + DOCK.bottomInsetPt, paddingHorizontal: DOCK.sideInsetPt }}
    >
      <Glass
        scheme={scheme}
        tint={tint}
        radius={DOCK.heightPt * HALF}
        accessibilityRole="tablist"
        className={rail ? "flex-col" : "flex-row"}
        style={{ padding: SLOT_PADDING }}
      >
        <Animated.View
          pointerEvents="none"
          className="bg-secondary absolute rounded-full"
          style={[
            { width: SLOT_SIZE, height: SLOT_SIZE, top: SLOT_PADDING, start: SLOT_PADDING },
            bubbleStyle,
          ]}
        />
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => onPress(item.key)}
              className="items-center justify-center"
              style={{ width: SLOT_SIZE, height: SLOT_SIZE }}
            >
              {item.render ? (
                item.render(active)
              ) : item.icon ? (
                <Icon as={item.icon} className={cn("size-6", active ? "text-accent" : "text-muted-foreground")} strokeWidth={active ? ICON_STROKE_ACTIVE : ICON_STROKE} />
              ) : null}
              {item.badge ? (
                <View className="bg-accent absolute end-1 top-1 min-w-5 items-center rounded-full px-1">
                  <Text className="text-accent-foreground text-[10px] font-bold">{item.badge > BADGE_MAX ? `${BADGE_MAX}+` : item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

export { GlassDock };
export type { DockItem, GlassDockProps };
export const DOCK_BUBBLE_MS = MOTION.dockBubbleMs;
