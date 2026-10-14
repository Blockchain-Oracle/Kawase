/**
 * The persistent mode control (Senryo's ModeCapsule, in Kawase's words: Mainnet and Testnet): a 34 pt borderless
 * capsule on neutral plates, because the mode is in the words and never a hue wash. The Arc mark, the mode named, and a
 * small two-position switch whose knob travels on a spring. One tap switches network, like dark and light; a hold opens
 * both networks with their totals. A testnet capsule is outlined with a dashed rim and a hollow switch, a mainnet one is
 * solid, so the difference reads by shape as well as by the word. It is a switch for assistive technology.
 */
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { fire } from "@/feedback/fire";

import { usePressScale } from "../kit/usePressScale";
import { BUTTON, CONTROL_FONT_SCALE, RADIUS, SIZE, SPACE, SPRING, TYPE, useTheme } from "../kit/theme";

const TRACK_W = 28;
const TRACK_H = 16;
const TRACK_BORDER = 1.5;
const KNOB = 9;
/** Inside the border: the knob sits a hair from the track's edge, and travels the rest. */
const KNOB_INSET = (TRACK_H - TRACK_BORDER * 2 - KNOB) / 2;
const TRAVEL = TRACK_W - TRACK_BORDER * 2 - KNOB - KNOB_INSET * 2;
/** The touch target reaches this far above and below the capsule (not sideways, where other pills sit close by). */
const HIT_SLOP = { top: (SIZE.touch - SIZE.modeCapsuleHeight) / 2, bottom: (SIZE.touch - SIZE.modeCapsuleHeight) / 2 } as const;

export function ModeCapsule({
  network,
  label,
  switchLabel,
  longPressLabel,
  busy = false,
  compact = false,
  onToggle,
  onLongPress,
}: {
  network: "mainnet" | "testnet";
  /** The mode in words: "Mainnet" / "Testnet". */
  label: string;
  /** What a tap does, for assistive technology ("Switch to Testnet"). */
  switchLabel: string;
  /** The named action a hold performs, for assistive technology. */
  longPressLabel?: string;
  busy?: boolean;
  /** Drops the mark, for a ticket header where the money word already sits beside the amount. */
  compact?: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const reduce = useReducedMotion();
  const testnet = network === "testnet";
  const knob = useSharedValue(testnet ? 0 : 1);
  useEffect(() => {
    knob.set(reduce ? (testnet ? 0 : 1) : withSpring(testnet ? 0 : 1, SPRING.railPill));
  }, [testnet, reduce, knob]);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() * TRAVEL }] }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(busy ? 0.6 : 1, { duration: 120 }) }));
  return (
    <Animated.View style={[styles.shrink, press.style, dim]}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick", { sound: "toggle" });
          onToggle();
        }}
        {...(onLongPress ? { onLongPress: () => { fire("snap"); onLongPress(); } } : {})}
        accessibilityRole="switch"
        accessibilityLabel={switchLabel}
        accessibilityState={{ checked: !testnet, busy }}
        {...(onLongPress && longPressLabel ? { accessibilityActions: [{ name: "longpress", label: longPressLabel }], onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => e.nativeEvent.actionName === "longpress" && onLongPress() } : {})}
        hitSlop={HIT_SLOP}
        style={[
          styles.capsule,
          { backgroundColor: color.networkSurface },
          testnet ? { borderWidth: 1, borderStyle: "dashed", borderColor: color.network } : { borderWidth: 1, borderColor: color.networkSurface },
        ]}
      >
        {compact ? null : <Mark entity={arcIdentity(network).chain} size={SIZE.iconSm} />}
        <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.modeLabel, { color: color.network }]} numberOfLines={1}>
          {label}
        </Text>
        <View
          style={[styles.track, { borderColor: color.network, backgroundColor: testnet ? color.transparent : color.network }]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Animated.View style={[styles.knob, { backgroundColor: testnet ? color.network : color.networkForeground }, knobStyle]} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 0 },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs + SPACE.xxs,
    height: SIZE.modeCapsuleHeight,
    borderRadius: BUTTON.radius.md,
    paddingLeft: SPACE.md,
    paddingRight: SPACE.sm,
  },
  track: { width: TRACK_W, height: TRACK_H, borderRadius: RADIUS.pill, borderWidth: TRACK_BORDER, justifyContent: "center" },
  knob: { width: KNOB, height: KNOB, borderRadius: RADIUS.pill, marginHorizontal: KNOB_INSET },
});
