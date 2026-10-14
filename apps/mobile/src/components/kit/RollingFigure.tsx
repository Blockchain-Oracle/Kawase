/**
 * A rolling figure from a React value: a balance, a price or a run total re-renders with its new text, and this hands
 * the text and its direction to the Skia odometer (`LiveOdometer`), which rolls the digits on the UI thread. Without a
 * `font` it draws in the money face (Roboto Condensed Black) sized to the line, so a lane only passes text, value,
 * colour and height. The web twin (`RollingFigure.web.tsx`) takes the same props and rolls with NumberFlow.
 */
import type { SkFont } from "@shopify/react-native-skia";
import { useEffect, useRef } from "react";
import { useSharedValue } from "react-native-reanimated";

import { useDisplayFont } from "./fonts";
import { type LiveFigure, LiveOdometer } from "./LiveOdometer";
import { TYPE } from "./theme";

/** The money face fills its line the way the balance role does (52 on 56). */
const FONT_SHARE = (TYPE.displayBalance.fontSize ?? 1) / (TYPE.displayBalance.lineHeight ?? 1);

export function RollingFigure({
  text,
  value,
  font,
  color,
  height,
  align = "right",
  accessibilityLabel,
  sensitive = false,
}: {
  text: string;
  /** The amount behind the text: a rise rolls forward, a fall back. */
  value: bigint;
  /** A Skia font of your own; the money face sized to `height` when omitted. */
  font?: SkFont | null;
  color: string;
  height: number;
  align?: "left" | "right";
  accessibilityLabel?: string;
  /** A balance or a result: masked while balances are hidden. */
  sensitive?: boolean;
}) {
  const fallback = useDisplayFont(Math.round(height * FONT_SHARE));
  const source = useSharedValue<LiveFigure>({ text, trend: 0 });
  const previous = useRef(value);
  useEffect(() => {
    const was = previous.current;
    previous.current = value;
    source.set({ text, trend: was === value ? 0 : value > was ? 1 : -1 });
  }, [text, value, source]);
  return (
    <LiveOdometer
      source={source}
      font={font ?? fallback}
      color={color}
      height={height}
      align={align}
      sensitive={sensitive}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    />
  );
}
