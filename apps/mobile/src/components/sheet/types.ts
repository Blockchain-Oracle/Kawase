import type { ReactNode } from "react";

export interface SheetProps {
  /** Called once the sheet has slid away (drag, scrim, back button or `useSheetClose`). */
  onClose: () => void;
  children: ReactNode;
  /** The scrim's accessible name ("Close add money"). */
  closeLabel: string;
  /** Tallest the panel grows before its content scrolls, as a fraction of the window (content-sized sheets). */
  maxHeight?: number;
  /**
   * Heights the sheet rests at, as fractions of the space under the top safe area, low to high (D-321): it opens at the
   * first, a drag moves between them, and its content scrolls only at the tallest. Without them it sizes to content.
   */
  detents?: readonly number[];
  /** False while something is in flight that the sheet must stay attached to: no drag, scrim, back or handle. */
  dismissible?: boolean;
}
