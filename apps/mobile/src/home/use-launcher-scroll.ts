// Home's composer steps out of the way while you read down the page and comes back the moment you scroll up — near
// the top and at the end it always shows (Senryo's floating launcher, `useLauncherScroll`, R6.9). All on the UI thread,
// with a little hysteresis so a jittery thumb doesn't flicker it. `shown` is 1 shown, 0 tucked behind the dock.
import { type SharedValue, useAnimatedScrollHandler, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { EASE, TIMING } from "@/components/kit/theme";

/** Down this far in one go hides it; up this far shows it. */
const HIDE_AFTER = 24;
const SHOW_AFTER = 12;
/** Within this of the top or the end it always shows. */
const EDGE = 32;

export function useLauncherScroll(scrollY?: SharedValue<number>) {
  const shown = useSharedValue(1);
  const last = useSharedValue(0);
  const travel = useSharedValue(0);
  const target = useSharedValue(1);
  const reduce = useReducedMotion();
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      if (scrollY) scrollY.value = y;
      const dy = y - last.value;
      last.value = y;
      // A change of direction starts the count again.
      travel.value = Math.sign(dy) === Math.sign(travel.value) ? travel.value + dy : dy;
      const atTop = y < EDGE;
      const atEnd = event.contentSize.height - event.layoutMeasurement.height - y < EDGE;
      let next = target.value;
      if (atTop || atEnd || travel.value < -SHOW_AFTER) next = 1;
      else if (travel.value > HIDE_AFTER) next = 0;
      if (next !== target.value) {
        target.value = next;
        shown.value = withTiming(next, { duration: reduce ? 0 : TIMING.selection, easing: EASE });
      }
    },
  });
  return { shown, onScroll };
}
