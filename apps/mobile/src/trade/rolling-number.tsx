// Rolling digits for a live figure (native twin of 21st.dev unlumen "Animate Digits", id 20071): only the digits that
// change move, in from below on a rise and from above on a fall, while the old digit leaves the other way; signs,
// separators and the currency stay still. Reanimated on the UI thread, so it runs the same on iOS, Android and the
// web. Reduced motion shows the new figure at once. Screen readers hear the whole figure once, not each digit.
// Small and self-contained on purpose: the Look lane's kit (RollingFigure) replaces it when it lands.
import * as React from "react";
import { View, type StyleProp, type TextStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn } from "@kawase/ui-native/lib/utils";

const LINE_HEIGHT_SHARE = 1.25;
const EXIT_MS = 180;
const SPRING = { damping: 16, stiffness: 190, mass: 0.7 };
const DIGIT = /[0-9]/;

type Props = {
  /** The figure as shown, already formatted in the person's locale ("$1,204.50", "+3.2%"). */
  text: string;
  /** The amount behind it: a rise rolls the changed digits up, a fall rolls them down. */
  value: number;
  /** Font size in points; the line box follows it. */
  size: number;
  className?: string;
  style?: StyleProp<TextStyle>;
};

function Cell({ char, rising, height, className, style, reduced }: { char: string; rising: boolean; height: number; className?: string; style?: StyleProp<TextStyle>; reduced: boolean }) {
  const previous = React.useRef(char);
  const [leaving, setLeaving] = React.useState<string | null>(null);
  const enter = useSharedValue(0);
  const exit = useSharedValue(0);
  const exitOpacity = useSharedValue(0);

  React.useEffect(() => {
    const was = previous.current;
    previous.current = char;
    if (was === char || reduced || !DIGIT.test(was)) return;
    const direction = rising ? 1 : -1;
    setLeaving(was);
    exit.value = 0;
    exitOpacity.value = 1;
    exit.value = withTiming(-direction * height, { duration: EXIT_MS });
    exitOpacity.value = withTiming(0, { duration: EXIT_MS });
    enter.value = direction * height;
    enter.value = withSpring(0, SPRING);
  }, [char, enter, exit, exitOpacity, height, reduced, rising]);

  const enterStyle = useAnimatedStyle(() => ({ transform: [{ translateY: enter.value }] }));
  const exitStyle = useAnimatedStyle(() => ({ opacity: exitOpacity.value, transform: [{ translateY: exit.value }] }));

  return (
    <View style={{ height, overflow: "hidden" }}>
      <Animated.View style={enterStyle}>
        <Text className={className} style={[{ lineHeight: height }, style]}>
          {char}
        </Text>
      </Animated.View>
      {leaving !== null ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", start: 0, top: 0 }, exitStyle]}>
          <Text className={className} style={[{ lineHeight: height }, style]}>
            {leaving}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function RollingNumber({ text, value, size, className, style }: Props) {
  const reduced = useReducedMotionLive();
  const last = React.useRef(value);
  const rising = value >= last.current;
  React.useEffect(() => {
    last.current = value;
  }, [value]);
  const height = Math.round(size * LINE_HEIGHT_SHARE);
  const textClass = cn("font-mono tabular-nums", className);
  const textStyle: StyleProp<TextStyle> = [{ fontSize: size }, style];
  // Cells are keyed from the right, so a figure that grows a digit keeps its ones, tens… in place.
  const chars = [...text];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={text} className="flex-row" style={{ direction: "ltr" }}>
      {chars.map((char, index) => (
        <Cell key={chars.length - index} char={char} rising={rising} height={height} className={textClass} style={textStyle} reduced={reduced} />
      ))}
    </View>
  );
}
