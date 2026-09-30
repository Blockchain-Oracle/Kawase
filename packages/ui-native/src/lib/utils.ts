import { clsx, type ClassValue } from "clsx";
import { Platform } from "react-native";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Aligns text to the side where reading starts. React Native has no "start" alignment; it mirrors an explicit
 * "left" inside a right-to-left layout. The browser has `start`.
 */
export const TEXT_START = Platform.select({ web: "text-start", default: "text-left" });

/** The same for text fields, which React Native does not mirror. */
export const INPUT_TEXT_START = Platform.select({ web: "text-start", default: "text-left rtl:text-right" });
