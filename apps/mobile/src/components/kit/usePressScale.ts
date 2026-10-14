import { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { EASE, PRESS_SCALE, TIMING } from "./theme";

/**
 * Press feedback for anything tappable: the plate shrinks to 0.97 in 100 ms and returns in 160 ms, so the control
 * answers the finger before anything else moves. Transform only (no layout); Reduce Motion skips the travel.
 */
export function usePressScale(to: number = PRESS_SCALE) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const onPressIn = () => {
    scale.set(reduce ? 1 : withTiming(to, { duration: TIMING.press, easing: EASE }));
  };
  const onPressOut = () => {
    scale.set(reduce ? 1 : withTiming(1, { duration: TIMING.pressRelease, easing: EASE }));
  };
  return { style, onPressIn, onPressOut };
}
