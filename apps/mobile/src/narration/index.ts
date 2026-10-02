// Onboarding narration (plan §1.5): the story screen asks for a panel's clip in the person's language, on their
// platform (panel 2's wording differs on the web and Android, like its text). Wiring it into the story screen (the
// speaker button next to the language pill, auto-advance waiting for the clip) is the story screen's job.
import { Platform } from "react-native";

import { DEFAULT_LOCALE, isSupportedLocale } from "@kawase/config";

import { NARRATION_CLIPS } from "./clips";

/** How many story panels have narration. */
export const NARRATION_PANEL_COUNT = NARRATION_CLIPS[DEFAULT_LOCALE].length;

/** The asset for a story panel (0-based index), or undefined when there is none. */
export function narrationClip(locale: string, panelIndex: number): number | undefined {
  const panels = NARRATION_CLIPS[isSupportedLocale(locale) ? locale : DEFAULT_LOCALE];
  const panel = panels[panelIndex];
  if (!panel) return undefined;
  if (Platform.OS === "web" && panel.web) return panel.web;
  if (Platform.OS === "android" && panel.android) return panel.android;
  return panel.clip;
}
