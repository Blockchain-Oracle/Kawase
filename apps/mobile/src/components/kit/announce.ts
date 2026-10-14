// One polite announcement for a transition worth hearing ("confirmed", "prices paused"): the screen reader speaks it,
// and a sighted person sees the same change on the surface. Native uses the platform announcer; on the web a visually
// hidden live region would be needed, which the web shell mounts once (`LiveRegionHost` in shell/); here it is a no-op.
import { AccessibilityInfo, Platform } from "react-native";

type WebSink = (text: string) => void;
let webSink: WebSink | undefined;

/** The web shell registers its live region here; returns the cleanup. */
export function registerWebAnnouncer(sink: WebSink): () => void {
  webSink = sink;
  return () => {
    if (webSink === sink) webSink = undefined;
  };
}

export function announce(text: string): void {
  if (Platform.OS === "web") {
    webSink?.(text);
    return;
  }
  AccessibilityInfo.announceForAccessibility(text);
}
