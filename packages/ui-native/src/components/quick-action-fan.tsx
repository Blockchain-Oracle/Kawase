// The quick-action fan (Phantom P19 / M06, exact motion, Kawase's actions): the plus becomes ×, the page blurs,
// and four labelled circles rise from the plus with a short stagger and a small overshoot, settling in a vertical
// column at the trailing edge — not a radial arc. Closing reverses it. The blur is the app's BlurOverlay; this
// component draws the column and the plus/× button. An action that is not available yet says so before the tap
// (a quiet circle and a "Soon" chip, not focusable as a working button — review R12). Given `glass`, the closed
// plus is a quiet glass circle instead of a second lime action competing with the screen's own (review R09).
//
// One interaction, one lifetime (R16): the circles leave in reverse within `FAN_EXIT_MS`, the host stretches the
// blur's exit to the same span, and the circles unmount when it ends; a reopen during the exit reverses from where
// they are. To assistive tech (R13) the circles exist only while open: focus moves to the first action as the fan
// opens and back to the plus when it closes without an action; the escape gesture closes it; `covered` hides the
// whole fan while another overlay is over it.
import { FAN, MOTION } from "@kawase/config";
import { Glass } from "@kawase/ui-native/components/glass";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { focusElement, useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn } from "@kawase/ui-native/lib/utils";
import { Plus, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

type FanAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Set when the action is not available yet: the words of the chip ("Soon"). */
  soon?: string;
};

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
  /** The page's theme and the `glass` token: draws the closed plus as quiet glass. */
  glass?: { scheme: "light" | "dark"; tint: string };
  /** Another overlay is over the fan: hidden from assistive tech. */
  covered?: boolean;
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
/** Each circle's own exit: as quick as the blur's, so the whole close stays an ordinary 150–250 ms action. */
const EXIT_ITEM_MS = MOTION.blurOutMs;
/** The whole close, last circle included: the host gives the blur this exit too. */
const FAN_EXIT_MS = (FAN.count - 1) * MOTION.fanStaggerMs + EXIT_ITEM_MS;

type FanItemProps = {
  action: FanAction;
  index: number;
  open: boolean;
  onAction: (key: string) => void;
  reduced: boolean;
  circleRef?: React.Ref<View>;
};

function FanItem({ action, index, open, onAction, reduced, circleRef }: FanItemProps) {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    if (reduced) {
      progress.value = withTiming(open ? 1 : 0, { duration: 0 });
      return;
    }
    // Rise with a stagger from the plus; the last one leaves first on close.
    const delay = (open ? index : FAN.count - 1 - index) * MOTION.fanStaggerMs;
    progress.value = withDelay(delay, open ? withSpring(1, SPRING) : withTiming(0, { duration: EXIT_ITEM_MS, easing: Easing.in(Easing.quad) }));
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
        disabled={Boolean(action.soon)}
        onPress={() => onAction(action.key)}
        className="absolute inset-y-0 flex-row items-center justify-end gap-2"
        style={{ end: FAN.circlePt + LABEL_GAP, width: LABEL_WIDTH }}
      >
        {action.soon ? (
          <View className="bg-secondary rounded-full px-2 py-0.5">
            <Text className="text-muted-foreground text-xs font-semibold">{action.soon}</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} className={cn("text-base font-semibold", action.soon ? "text-muted-foreground" : "text-foreground")}>
          {action.label}
        </Text>
      </Pressable>
      <Pressable
        ref={circleRef}
        accessibilityRole="button"
        accessibilityLabel={action.soon ? `${action.label}, ${action.soon}` : action.label}
        accessibilityState={{ disabled: Boolean(action.soon) }}
        disabled={Boolean(action.soon)}
        onPress={() => onAction(action.key)}
        className={cn("items-center justify-center rounded-full", action.soon ? "bg-secondary" : "bg-primary")}
        style={{ width: FAN.circlePt, height: FAN.circlePt }}
      >
        <Icon as={action.icon} className={cn("size-5", action.soon ? "text-muted-foreground" : "text-primary-foreground")} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}

function QuickActionFan({ open, actions, onToggle, onAction, toggleLabel, bottom, end = END_INSET, glass, covered = false, className }: QuickActionFanProps) {
  const reduced = useReducedMotionLive();
  const rotation = useSharedValue(open ? ROTATE_OPEN : ROTATE_CLOSED);
  const [present, setPresent] = React.useState(open);
  const toggleRef = React.useRef<View>(null);
  const firstRef = React.useRef<View>(null);
  const wasOpen = React.useRef(open);
  const chose = React.useRef(false);

  React.useEffect(() => {
    rotation.value = withTiming(open ? ROTATE_OPEN : ROTATE_CLOSED, { duration: reduced ? 0 : open ? MOTION.fanItemMs : FAN_EXIT_MS });
    if (open) {
      wasOpen.current = true;
      chose.current = false;
      setPresent(true);
      const timer = setTimeout(() => focusElement(firstRef.current), reduced ? 0 : MOTION.blurInMs);
      return () => clearTimeout(timer);
    }
    // Back to the plus, unless an action has taken the person somewhere else.
    if (wasOpen.current && !chose.current) focusElement(toggleRef.current);
    wasOpen.current = false;
    const timer = setTimeout(() => setPresent(false), reduced ? 0 : FAN_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, rotation, reduced]);
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const choose = (key: string) => {
    chose.current = true;
    onAction(key);
  };

  return (
    <View pointerEvents="box-none" aria-hidden={covered} onAccessibilityEscape={open ? onToggle : undefined} className={cn("absolute", className)} style={{ bottom, end }}>
      {present ? (
        <View pointerEvents="box-none" aria-hidden={!open} className="absolute bottom-0 end-0" style={{ width: PLUS_SIZE, height: PLUS_SIZE }}>
          {actions.slice(0, FAN.count).map((action, index) => (
            <FanItem key={action.key} action={action} index={index} open={open} onAction={choose} reduced={reduced} circleRef={index === 0 ? firstRef : undefined} />
          ))}
        </View>
      ) : null}
      <Pressable
        ref={toggleRef}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        className={cn("items-center justify-center rounded-full", open ? "bg-secondary" : glass ? "" : "bg-primary")}
        style={{ width: PLUS_SIZE, height: PLUS_SIZE }}
      >
        {glass && !open ? <Glass pointerEvents="none" scheme={glass.scheme} tint={glass.tint} radius={PLUS_SIZE * HALF} className="absolute inset-0" /> : null}
        <Animated.View style={plusStyle}>
          <Icon as={Plus} className={cn("size-7", open || glass ? "text-foreground" : "text-primary-foreground")} strokeWidth={2.4} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

export { FAN_EXIT_MS, QuickActionFan };
export type { FanAction, QuickActionFanProps };
