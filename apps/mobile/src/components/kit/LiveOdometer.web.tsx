// Web twin of LiveOdometer: the same shared-value source (`{ text, trend }`), read on the JS side and drawn by NumberFlow
// (21st.dev barvian/number-flow, id 1444). Metro picks this file on web, so Skia and CanvasKit never load there.
import { useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { useCallback, useEffect, useRef, useState } from "react";
import { scheduleOnRN } from "react-native-worklets";

import { RollingFigure } from "./RollingFigure.web";

/** A figure's text and which way it just moved (-1, 0, 1). */
export interface LiveFigure {
  text: string;
  trend: number;
}

/** The shortest gap between two rolls (a little over the live roll's 400 ms). */
const ROLL_GAP_MS = 450;

export function LiveOdometer({
  source,
  color,
  height,
  align = "left",
  accessibilityLabel,
  sensitive = false,
}: {
  source: SharedValue<LiveFigure>;
  font?: unknown;
  color: string;
  height: number;
  align?: "left" | "right" | "center";
  accessibilityLabel?: string;
  sensitive?: boolean;
}) {
  const [text, setText] = useState(() => source.get().text);
  // The newest text, shown at most every ROLL_GAP_MS (trailing): a price can tick four times a second, and each roll
  // should finish before the next starts.
  const latest = useRef(text);
  const shownAt = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((next: string) => {
    latest.current = next;
    if (pending.current) return;
    const wait = Math.max(0, shownAt.current + ROLL_GAP_MS - Date.now());
    pending.current = setTimeout(() => {
      pending.current = undefined;
      shownAt.current = Date.now();
      setText(latest.current);
    }, wait);
  }, []);
  useEffect(() => () => clearTimeout(pending.current), []);
  useAnimatedReaction(
    () => source.get().text,
    (next, previous) => {
      if (next !== previous) scheduleOnRN(show, next);
    },
  );
  return (
    <RollingFigure
      live
      text={text}
      color={color}
      height={height}
      align={align}
      sensitive={sensitive}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    />
  );
}
