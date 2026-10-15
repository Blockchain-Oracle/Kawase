// The overlays over the live page: the voice overlay (the orb rises from the dock, the page blurs) and the
// + fan (the dock's centre turns to ×, five actions rise). They are not routes: the host renders them as a
// layer above the tab pages and the dock inside the (tabs) layout (on a desktop window, above the sidebar and every
// page), so `BlurView` sees the page on iOS, Android and web. The provider wraps the whole signed-in area; any screen
// in it can call `open("voice")`; only one overlay is open at a time.
//
// An open overlay is the only surface (Codex review R13): `OverlayUnderlay` hides the pages and the dock from
// assistive tech, Android's hardware Back and the web's Escape close the overlay before anything navigates, and the
// dock's orb slot is shared as `voiceTrigger` so the voice overlay can rise from its real place and give focus back
// to it. `shown` stays set through an overlay's exit (until it reports `exited`), so the dock's orb is not drawn
// twice while the overlay's orb travels home (R16).
import * as React from "react";
import { BackHandler, Platform, View, type ViewProps } from "react-native";

import { BlurTarget, BlurTargetProvider } from "@kawase/ui-native/components/blur-target";

import { useSession } from "@/session/session-provider";
import { prefetchVoice } from "@/voice/prefetch";

/** How long after the app settles (or a conversation ends) the next voice session is made ready. */
const VOICE_HEAD_START_MS = 2_500;

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
  /** The pages, as Android's blur target for the overlays. */
  blurTarget: React.RefObject<View | null>;
  /** Home's composer is open (typing): the + steps aside for it. */
  composing: boolean;
  setComposing: (composing: boolean) => void;
};

const OverlayContext = React.createContext<OverlayState | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<OverlayKind | null>(null);
  const [leaving, setLeaving] = React.useState<OverlayKind | null>(null);
  const [composing, setComposing] = React.useState(false);
  const voiceTrigger = React.useRef<View>(null);
  const blurTarget = React.useRef<View>(null);

  const value = React.useMemo<OverlayState>(() => {
    const close = () => {
      if (!current) return;
      setLeaving(current);
      setCurrent(null);
    };
    return {
      current,
      shown: current ?? leaving,
      // Opening the fan commits to nothing: the dock's tick is its only feedback (no sound for navigation).
      open: (kind) => setCurrent(kind),
      close,
      toggle: (kind) => {
        if (current === kind) return close();
        setCurrent(kind);
      },
      exited: (kind) => setLeaving((was) => (was === kind ? null : was)),
      voiceTrigger,
      blurTarget,
      composing,
      setComposing,
    };
  }, [current, leaving, composing]);

  // Talk to Kawase starts sooner: once the signed-in app has settled, the voice code loads and a session waits; after
  // each conversation the next one is made ready the same way (voice/prefetch.ts).
  const { status, user } = useSession();
  const network = user?.activeNetwork;
  const talking = current === "voice";
  React.useEffect(() => {
    if (status !== "account" || !network || talking) return undefined;
    const timer = setTimeout(() => prefetchVoice(network), VOICE_HEAD_START_MS);
    return () => clearTimeout(timer);
  }, [status, network, talking]);

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

  return (
    <OverlayContext.Provider value={value}>
      <BlurTargetProvider target={blurTarget}>{children}</BlurTargetProvider>
    </OverlayContext.Provider>
  );
}

export function useOverlay(): OverlayState {
  const state = React.useContext(OverlayContext);
  if (!state) throw new Error("useOverlay must be used inside OverlayProvider");
  return state;
}

/** The pages and the dock: out of assistive tech's reach while an overlay is open. */
/** The pages and the dock: hidden from assistive tech under an open overlay, and what the overlay blurs on Android. */
export function OverlayUnderlay(props: ViewProps) {
  const { current, blurTarget } = useOverlay();
  return <BlurTarget target={blurTarget} aria-hidden={current !== null} {...props} />;
}

export type { OverlayKind };
