/**
 * Motion durations and geometry (milliseconds, points). Starting points adapted from the reference study's
 * clips (docs/design/reference-study-2026-09-30, M01–M18); see DESIGN.md §Motion. The apps read these so no
 * screen carries its own magic numbers.
 */
export const MOTION = {
  /** Presses and hovers. */
  pressMs: 150,
  /** Sheets and cards rising; nested panels changing height. */
  sheetMs: 250,
  /** A story panel change (M01): field + art travel, copy changes mid-travel. */
  storyPanelMs: 900,
  /** How long a story panel stays before the next one (auto-advance); swiping resets it. */
  storyDwellMs: 4_500,
  /** The blur behind an overlay reaching full strength (M06). */
  blurInMs: 180,
  blurOutMs: 140,
  /** The quick-action fan (M06): one circle's rise/scale, and the delay between circles. */
  fanItemMs: 260,
  fanStaggerMs: 28,
  /** The voice orb travelling from the dock to the centre of the overlay. */
  orbRiseMs: 320,
  /** Dotted QR assembling from particles (M04); the last dot lands by this time. */
  qrAssembleMs: 700,
  /** The completion flag's single wave (M18). */
  flagWaveMs: 1_400,
  /** Ambient float of an art object (M05): one full cycle. */
  ambientCycleMs: 6_000,
  /** The dock's active bubble sliding to a new tab (M09). */
  dockBubbleMs: 220,
  /** A word of caption fading in. */
  captionWordMs: 180,
  /** The paper plane's quick float while a send is moving, one full cycle. */
  sendingCycleMs: 1_600,
  /** The plane leaving when the send is confirmed, before the receipt settles in. */
  planeFlyMs: 650,
} as const;

/** Geometry of the quick-action fan (P19, settled state): circles in a vertical trailing column. */
export const FAN = {
  circlePt: 48,
  pitchPt: 72,
  /** How far past its resting spot a circle overshoots before settling. */
  overshootPt: 6,
  /** The fan's circles, in order of appearance from the plus button upward. */
  count: 4,
} as const;

/** The glass dock (F12): a floating capsule above the home indicator. */
export const DOCK = {
  heightPt: 64,
  bottomInsetPt: 12,
  sideInsetPt: 16,
  slotCount: 5,
  /** The layout switches to a rail at this width (Stage 13 desktop). */
  railBreakpointPt: 900,
} as const;

/** Blur strength for overlays (expo-blur intensity, 0–100). */
export const BLUR = {
  overlay: 80,
  dock: 60,
} as const;
