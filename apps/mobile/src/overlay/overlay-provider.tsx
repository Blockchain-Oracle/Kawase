// The overlays over the live page: the voice overlay (the orb rises from the dock, the page blurs) and the
// quick-action fan (the plus becomes ×, four actions rise). They are not routes: the host renders them as a
// layer above the tab pages and the dock inside the (tabs) layout, so `BlurView` sees the page on iOS, Android
// and web. Any screen in the group can call `open("voice")`; only one overlay is open at a time.
//
// An open overlay is the only surface (Codex review R13): `OverlayUnderlay` hides the pages and the dock from
// assistive tech, Android's hardware Back and the web's Escape close the overlay before anything navigates, and the
// dock's orb slot is shared as `voiceTrigger` so the voice overlay can rise from its real place and give focus back
// to it. `shown` stays set through an overlay's exit (until it reports `exited`), so the dock's orb is not drawn
// twice while the overlay's orb travels home (R16).
import * as React from "react";
import { BackHandler, Platform, View, type ViewProps } from "react-native";

type OverlayKind = "voice" | "fan";

type OverlayState = {
  /** The open overlay. */
  current: OverlayKind | null;
  /** The overlay on screen: the open one, or the one still leaving. */
  shown: OverlayKind | null;
  open: (kind: OverlayKind) => void;
  close: () => void;
  toggle: (kind: OverlayKind) => void;
  /** An overlay reports that its exit has finished. */
  exited: (kind: OverlayKind) => void;
  /** The dock's orb slot: where the voice overlay's orb rises from and where focus returns. */
  voiceTrigger: React.RefObject<View | null>;
};

const OverlayContext = React.createContext<OverlayState | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<OverlayKind | null>(null);
  const [leaving, setLeaving] = React.useState<OverlayKind | null>(null);
  const voiceTrigger = React.useRef<View>(null);

  const value = React.useMemo<OverlayState>(() => {
    const close = () => {
      if (!current) return;
      setLeaving(current);
      setCurrent(null);
    };
    return {
      current,
      shown: current ?? leaving,
      open: setCurrent,
      close,
      toggle: (kind) => (current === kind ? close() : setCurrent(kind)),
      exited: (kind) => setLeaving((was) => (was === kind ? null : was)),
      voiceTrigger,
    };
  }, [current, leaving]);

  // Back (Android) and Escape (web) close the open overlay first.
  React.useEffect(() => {
    if (!current) return undefined;
    if (Platform.OS === "web") {
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") value.close();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      value.close();
      return true;
    });
    return () => subscription.remove();
  }, [current, value]);

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayState {
  const state = React.useContext(OverlayContext);
  if (!state) throw new Error("useOverlay must be used inside OverlayProvider");
  return state;
}

/** The pages and the dock: out of assistive tech's reach while an overlay is open. */
export function OverlayUnderlay(props: ViewProps) {
  const { current } = useOverlay();
  return <View aria-hidden={current !== null} {...props} />;
}

export type { OverlayKind };
