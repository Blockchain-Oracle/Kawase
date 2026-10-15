/**
 * The scroll edge under the status bar on pages whose content scrolls up to it (Settings, Activity; device pass 10-15
 * on Abu's iPhone): their large titles scroll away and the rows ran under the clock and the Dynamic Island. Pages with
 * a fixed header (Home, Markets, pushed pages) never need it. iOS's own answer is the scroll edge effect, a fade rather
 * than a bar: the page's colour at the very top, clear a little below the status bar, so the clock always reads and
 * nothing looks cut. Content layer, so no glass (HIG); never touchable; nothing on the web or where there is no inset.
 */
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "../kit/theme";

/** How far below the status bar the fade reaches. */
const FADE_PX = 20;
/** The fade holds the page colour across the status bar itself, then clears over the last stretch. */
const HOLD = 0.62;

export function StatusScrim() {
  const insets = useSafeAreaInsets();
  const { color } = useTheme();
  if (Platform.OS === "web" || insets.top === 0) return null;
  const height = insets.top + FADE_PX;
  return (
    <Svg pointerEvents="none" style={[styles.edge, { height }]} width="100%" height={height}>
      <Defs>
        <LinearGradient id="status-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.background} stopOpacity={1} />
          <Stop offset={HOLD} stopColor={color.background} stopOpacity={0.92} />
          <Stop offset="1" stopColor={color.background} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} fill="url(#status-scrim)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  edge: { position: "absolute", top: 0, left: 0, right: 0 },
});
