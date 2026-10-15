// Where the desktop stage sits in the window (the content beside the sidebar), so a dialog centres on the content the
// person is looking at rather than on the whole window (Abu, 10-15: "the modal is not in the middle"). The app's desktop
// frame measures it; there is none on a phone or a page without the sidebar.
import * as React from "react";

export type StageFrame = { x: number; width: number };

let frame: StageFrame | null = null;
const listeners = new Set<() => void>();

export function setStageFrame(next: StageFrame | null) {
  if (frame?.x === next?.x && frame?.width === next?.width) return;
  frame = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStageFrame(): StageFrame | null {
  return React.useSyncExternalStore(subscribe, () => frame, () => null);
}
