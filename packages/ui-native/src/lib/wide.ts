// The desktop layout (Stage 13): a web window at least as wide as Tailwind's `lg` breakpoint — a laptop, or the Tauri
// app at 1280×820 — gets the sidebar, a centred content column, two-column pages and sheets as dialogs. Narrower
// windows and every phone keep the phone layout. Structure switches on this hook; spacing uses `lg:` classes.
import { Platform, useWindowDimensions } from "react-native";

/** Tailwind's `lg` breakpoint, in CSS pixels. */
export const WIDE_MIN_PX = 1024;

/** The content column's widths on desktop: a page that keeps its phone shape (the story), one column, and two. */
export const WIDE_NARROW_PX = 480;
export const WIDE_COLUMN_PX = 720;
export const WIDE_PAGE_PX = 1180;

export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= WIDE_MIN_PX;
}

/** Hover and keyboard focus for a pressable row or card on the web (mouse users; a visible focus ring). */
export const WEB_PRESSABLE = Platform.select({
  web: "cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
  default: "",
});

/** The same for a pressable that already has a surface: lift it a little on hover instead of tinting it. */
export const WEB_PRESSABLE_CARD = Platform.select({
  web: "cursor-pointer outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring",
  default: "",
});

/** Mouse hover for a round control on the web: one on `secondary` dims a little, one on `muted` lifts to `secondary`. */
export const WEB_HOVER_SECONDARY = Platform.select({ web: "cursor-pointer transition-colors hover:bg-secondary/80", default: "" });
export const WEB_HOVER_MUTED = Platform.select({ web: "cursor-pointer transition-colors hover:bg-secondary", default: "" });
