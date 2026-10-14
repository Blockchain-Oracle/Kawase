// Onboarding narration (plan §1.5): the story screen asks for a scene's clip in the person's language. The clips are
// ElevenLabs recordings of the story's own copy (scripts/narration.mts); the story's speaker button turns them on.
import { DEFAULT_LOCALE, isSupportedLocale } from "@kawase/config";

import { NARRATION_CLIPS } from "./clips";

/** How many story scenes have narration. */
export const NARRATION_PANEL_COUNT = NARRATION_CLIPS[DEFAULT_LOCALE].length;

/** The asset for a story scene (0-based index), or undefined when there is none. */
export function narrationClip(locale: string, panelIndex: number): number | undefined {
  return NARRATION_CLIPS[isSupportedLocale(locale) ? locale : DEFAULT_LOCALE][panelIndex]?.clip;
}
