// The overlays over the live page: the voice overlay (the orb rises from the dock, the page blurs) and the
// quick-action fan (the plus becomes ×, four actions rise). They are not routes: the host renders them as a
// layer above the tab pages and the dock inside the (tabs) layout, so `BlurView` sees the page on iOS, Android
// and web. Any screen in the group can call `open("voice")`; only one overlay is open at a time.
import * as React from "react";

type OverlayKind = "voice" | "fan";

type OverlayState = {
  current: OverlayKind | null;
  open: (kind: OverlayKind) => void;
  close: () => void;
  toggle: (kind: OverlayKind) => void;
};

const OverlayContext = React.createContext<OverlayState | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<OverlayKind | null>(null);
  const value = React.useMemo<OverlayState>(
    () => ({
      current,
      open: setCurrent,
      close: () => setCurrent(null),
      toggle: (kind) => setCurrent((open) => (open === kind ? null : kind)),
    }),
    [current],
  );
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayState {
  const state = React.useContext(OverlayContext);
  if (!state) throw new Error("useOverlay must be used inside OverlayProvider");
  return state;
}

export type { OverlayKind };
