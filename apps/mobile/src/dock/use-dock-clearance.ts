// How much room a tab page leaves at the bottom so its last row clears the floating dock, the plus button and
// the home indicator. Pages add it to their scroll padding; the fan sits just above the dock.
import { DOCK } from "@kawase/config";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The plus button's height plus its gap above the dock. */
const PLUS_CLEARANCE = 72;
const SCROLL_END_GAP = 24;

export function useDockClearance() {
  const insets = useSafeAreaInsets();
  const dock = DOCK.heightPt + DOCK.bottomInsetPt + insets.bottom;
  return {
    /** From the screen's bottom edge to the dock's top edge. */
    dock,
    /** Bottom padding for a scrolling page whose content should end above the plus button. */
    scroll: dock + PLUS_CLEARANCE + SCROLL_END_GAP,
    /** Bottom padding for a page whose content is centred (no plus to clear). */
    page: dock + SCROLL_END_GAP,
  };
}
