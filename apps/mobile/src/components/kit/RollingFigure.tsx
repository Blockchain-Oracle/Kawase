/**
 * A rolling figure from a React value (R5.3): the book re-renders a row at most 5 times a second; this hands its text
 * and direction to the Skia odometer (`LiveOdometer`), which rolls the digits on the UI thread.
 */
import type { SkFont } from "@shopify/react-native-skia";
import { useEffect, useRef } from "react";
import { useSharedValue } from "react-native-reanimated";
import { type LiveFigure, LiveOdometer } from "./LiveOdometer";

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
  font: SkFont | null;
  color: string;
  height: number;
  align?: "left" | "right";
  accessibilityLabel?: string;
  /** A balance or a result: masked while balances are hidden. */
  sensitive?: boolean;
}) {
  const source = useSharedValue<LiveFigure>({ text, trend: 0 });
  const previous = useRef(value);
  useEffect(() => {
    const was = previous.current;
    previous.current = value;
    source.value = { text, trend: was === value ? 0 : value > was ? 1 : -1 };
  }, [text, value, source]);
  return (
    <LiveOdometer
      source={source}
      font={font}
      color={color}
      height={height}
      align={align}
      sensitive={sensitive}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    />
  );
}
