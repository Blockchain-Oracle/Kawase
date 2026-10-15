/**
 * The persistent mode control (Senryo's ModeCapsule, in Kawase's words: Mainnet and Testnet): a 34 pt borderless
 * capsule on neutral plates, because the mode is in the words and never a hue wash. The Arc mark, the mode named, and a
 * small two-position switch whose knob travels on a spring. One tap switches network, like dark and light; a hold opens
 * both networks with their totals. Both are solid plates (the dashed testnet rim read as an overlay on a phone, Abu's
 * review 10-14); the switch carries the difference by shape — hollow on testnet, filled on mainnet — as well as the
 * word. It is a switch for assistive technology.
 */
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";

import { usePressScale } from "../kit/usePressScale";
import { BUTTON, CONTROL_FONT_SCALE, RADIUS, SIZE, SPACE, SPRING, TYPE, useTheme } from "../kit/theme";

const HALF = 2;
const BUSY_OPACITY = 0.6;
const BUSY_MS = 120;
const TRACK_W = 28;
const TRACK_H = 16;
const TRACK_BORDER = 1.5;
const KNOB = 9;
/** Inside the border: the knob sits a hair from the track's edge, and travels the rest. */
const KNOB_INSET = (TRACK_H - TRACK_BORDER * HALF - KNOB) / HALF;
const TRAVEL = TRACK_W - TRACK_BORDER * HALF - KNOB - KNOB_INSET * HALF;
/** The touch target reaches this far above and below the capsule (not sideways, where other pills sit close by). */
const HIT_SLOP = {
  top: (SIZE.touch - SIZE.modeCapsuleHeight) / HALF,
  bottom: (SIZE.touch - SIZE.modeCapsuleHeight) / HALF,
} as const;

export function ModeCapsule({
  network,
  label,
  switchLabel,
  longPressLabel,
  busy = false,
  compact = false,
  bare = false,
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
  /** The mark and the switch without the word, for the compact rail (the word stays for assistive technology). */
  bare?: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
}) {
  const { color } = useTheme();
  const press = usePressScale();
  const reduce = useReducedMotion();
  const testnet = network === "testnet";
  // The knob travels toward the reading end for "on" (mainnet), so the switch mirrors in Arabic and Urdu.
  const { rtl } = useLocale();
  const side = rtl ? -1 : 1;
  const knob = useSharedValue(testnet ? 0 : 1);
  useEffect(() => {
    knob.set(reduce ? (testnet ? 0 : 1) : withSpring(testnet ? 0 : 1, SPRING.railPill));
  }, [testnet, reduce, knob]);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() * TRAVEL * side }] }));
  const dim = useAnimatedStyle(() => ({ opacity: withTiming(busy ? BUSY_OPACITY : 1, { duration: BUSY_MS }) }));
  return (
    <Animated.View style={[styles.shrink, press.style, dim]}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={() => {
          fire("tick");
          onToggle();
        }}
        {...(onLongPress
          ? {
              onLongPress: () => {
                fire("snap");
                onLongPress();
              },
            }
          : {})}
        accessibilityRole="switch"
        accessibilityLabel={bare ? `${label}. ${switchLabel}` : switchLabel}
        accessibilityState={{ checked: !testnet, busy }}
        {...(onLongPress && longPressLabel
          ? {
              accessibilityActions: [{ name: "longpress", label: longPressLabel }],
              onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) =>
                e.nativeEvent.actionName === "longpress" && onLongPress(),
            }
          : {})}
        hitSlop={HIT_SLOP}
        style={[styles.capsule, { backgroundColor: color.networkSurface }]}
      >
        {compact ? null : <Mark entity={arcIdentity(network).chain} size={SIZE.iconSm} />}
        {bare ? null : (
          <Text
            maxFontSizeMultiplier={CONTROL_FONT_SCALE}
            style={[TYPE.modeLabel, { color: color.network }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
        <View
          style={[
            styles.track,
            { borderColor: color.network, backgroundColor: testnet ? color.transparent : color.network },
          ]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Animated.View
            style={[styles.knob, { backgroundColor: testnet ? color.network : color.networkForeground }, knobStyle]}
          />
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
    paddingStart: SPACE.md,
    paddingEnd: SPACE.sm,
  },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: RADIUS.pill,
    borderWidth: TRACK_BORDER,
    justifyContent: "center",
  },
  knob: { width: KNOB, height: KNOB, borderRadius: RADIUS.pill, marginHorizontal: KNOB_INSET },
});
