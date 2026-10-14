// Skia draws its own text, so the rolling digits load the display face (Roboto Condensed Black) and Inter straight from
// the font files in @expo-google-fonts, the same files the expo-font plugin embeds for React Native text. `useFont`
// returns null until the file is read, and the odometer draws nothing until then. Native only: the web twins
// (`fonts.web.ts`) return null because the web draws numbers with NumberFlow and CSS.
import { type SkFont, useFont } from "@shopify/react-native-skia";

/* eslint-disable @typescript-eslint/no-require-imports */
const DISPLAY = require("@expo-google-fonts/roboto-condensed/900Black/RobotoCondensed_900Black.ttf") as number;
const SANS = require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf") as number;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Roboto Condensed Black at `size`, for money. */
export function useDisplayFont(size: number): SkFont | null {
  return useFont(DISPLAY, size);
}

/** Inter Regular at `size`, for chart axis figures. */
export function useSansFont(size: number): SkFont | null {
  return useFont(SANS, size);
}
