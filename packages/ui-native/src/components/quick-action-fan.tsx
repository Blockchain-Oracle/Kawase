// The quick-action fan (Phantom P19 / M06, exact motion, Kawase's actions): the plus becomes ×, the page blurs,
// and four labelled circles rise from the plus with a short stagger and a small overshoot, settling in a vertical
// column at the trailing edge — not a radial arc. Closing reverses it. The blur is the app's BlurOverlay; this
// component draws the column and the plus/× button.
import { FAN, MOTION } from "@kawase/config";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Plus, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

type FanAction = { key: string; label: string; icon: LucideIcon };

type QuickActionFanProps = {
  open: boolean;
  actions: readonly FanAction[];
  onToggle: () => void;
  onAction: (key: string) => void;
  /** "Open actions" / "Close actions". */
  toggleLabel: string;
  /** Bottom offset of the plus button (above the dock). */
  bottom: number;
  end?: number;
  className?: string;
};

const PLUS_SIZE = 56;
const END_INSET = 20;
const LABEL_GAP = 12;
/** Room for the longest label in any of the ten languages; the text is aligned to the circle's side. */
const LABEL_WIDTH = 200;
const HALF = 0.5;
const CLOSED_SCALE = 0.4;
const ROTATE_CLOSED = 0;
const ROTATE_OPEN = 45;
const SPRING = { damping: 14, stiffness: 260, mass: 0.9 };

function FanItem({ action, index, open, onAction, reduced }: { action: FanAction; index: number; open: boolean; onAction: (key: string) => void; reduced: boolean }) {
  const progress = useSharedValue(open ? 1 : 0);
  React.useEffect(() => {
    if (reduced) {
      progress.value = withTiming(open ? 1 : 0, { duration: 0 });
      return;
    }
    // Rise with a stagger from the plus; the last one leaves first on close.
    const delay = (open ? index : FAN.count - 1 - index) * MOTION.fanStaggerMs;
    progress.value = withDelay(delay, open ? withSpring(1, SPRING) : withTiming(0, { duration: MOTION.fanItemMs, easing: Easing.in(Easing.quad) }));
  }, [open, index, progress, reduced]);

  const style = useAnimatedStyle(() => {
    // Each circle's resting spot is `pitch` above the previous; while rising it travels from the plus.
    const rest = -(index + 1) * FAN.pitchPt;
    const travel = (1 - progress.value) * -rest;
    return {
      opacity: progress.value,
      transform: [{ translateY: rest + travel }, { scale: CLOSED_SCALE + (1 - CLOSED_SCALE) * progress.value }],
    };
  });

  // The row is anchored on its circle, not on a content-sized row: each wrapper is exactly the circle's box,
  // centred on the plus, and the label hangs off its leading side. That keeps the circles in one straight column
  // whatever the label's length, and makes the rise scale around the circle instead of the row's middle.
  return (
    <Animated.View
      style={[style, { width: FAN.circlePt, height: FAN.circlePt, end: (PLUS_SIZE - FAN.circlePt) * HALF }]}
      className="absolute bottom-0"
      pointerEvents={open ? "auto" : "none"}
    >
      <Pressable
        accessible={false}
        onPress={() => onAction(action.key)}
        className="absolute inset-y-0 items-end justify-center"
        style={{ end: FAN.circlePt + LABEL_GAP, width: LABEL_WIDTH }}
      >
        <Text numberOfLines={1} className="text-foreground text-base font-semibold">
          {action.label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={() => onAction(action.key)}
        className="bg-primary items-center justify-center rounded-full"
        style={{ width: FAN.circlePt, height: FAN.circlePt }}
      >
        <Icon as={action.icon} className="text-primary-foreground size-5" strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}

function QuickActionFan({ open, actions, onToggle, onAction, toggleLabel, bottom, end = END_INSET, className }: QuickActionFanProps) {
  const reduced = useReducedMotion();
  const rotation = useSharedValue(open ? ROTATE_OPEN : ROTATE_CLOSED);
  React.useEffect(() => {
    rotation.value = withTiming(open ? ROTATE_OPEN : ROTATE_CLOSED, { duration: reduced ? 0 : MOTION.fanItemMs });
  }, [open, rotation, reduced]);
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View pointerEvents="box-none" className={cn("absolute", className)} style={{ bottom, end }}>
      <View pointerEvents="box-none" className="absolute bottom-0 end-0" style={{ width: PLUS_SIZE, height: PLUS_SIZE }}>
        {actions.slice(0, FAN.count).map((action, index) => (
          <FanItem key={action.key} action={action} index={index} open={open} onAction={onAction} reduced={reduced} />
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        className={cn("items-center justify-center rounded-full", open ? "bg-secondary" : "bg-primary")}
        style={{ width: PLUS_SIZE, height: PLUS_SIZE }}
      >
        <Animated.View style={plusStyle}>
          <Icon as={Plus} className={cn("size-7", open ? "text-foreground" : "text-primary-foreground")} strokeWidth={2.4} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

export { QuickActionFan };
export type { FanAction, QuickActionFanProps };
