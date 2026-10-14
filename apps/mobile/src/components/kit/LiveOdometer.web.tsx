// Web twin of LiveOdometer: the same shared-value source (`{ text, trend }`), read on the JS side and drawn by NumberFlow
// (21st.dev barvian/number-flow, id 1444). Metro picks this file on web, so Skia and CanvasKit never load there.
import { useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { scheduleOnRN } from "react-native-worklets";

import { RollingFigure } from "./RollingFigure.web";

/** A figure's text and which way it just moved (-1, 0, 1). */
export interface LiveFigure {
  text: string;
  trend: number;
}

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
  align?: "left" | "right";
  accessibilityLabel?: string;
  sensitive?: boolean;
}) {
  const [text, setText] = useState(() => source.get().text);
  useAnimatedReaction(
    () => source.get().text,
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setText, next);
    },
  );
  return (
    <RollingFigure
      text={text}
      color={color}
      height={height}
      align={align}
      sensitive={sensitive}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    />
  );
}
