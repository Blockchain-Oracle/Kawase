import { tokens } from "@kawase/ui-tokens";

const SHEET_TOKENS = tokens.scale.sheet;

/** Sheet drag physics (values from tokens.json `scale.sheet`; the springs are the theme's motion families). */
export const SHEET = {
  /** Past a quarter of its height (120 pt at most), or flicked faster than 900 pt/s, a drag closes the sheet. */
  closeFraction: SHEET_TOKENS.closeAt,
  closeDistance: 120,
  closeVelocity: SHEET_TOKENS.flickVelocity,
  /** Upward drag is resisted by this factor. */
  upwardResistance: SHEET_TOKENS.upwardResist,
  activeOffsetY: 8,
  failOffsetX: 24,
  scrollThrottle: 16,
  maxHeight: 0.9,
  /** A sheet with detents stops this far under the top safe area at its tallest. */
  topGap: 8,
  /** A flick past this speed (pt/s) moves a sheet with detents one stop. */
  detentVelocity: 500,
} as const;

/** A long list's rests (a picker, the portfolio sheet): it opens at 62 % and drags to 88 % and full. */
export const LIST_DETENTS = SHEET_TOKENS.detents;
