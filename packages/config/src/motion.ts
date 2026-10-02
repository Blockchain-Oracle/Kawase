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
  storyPanelMs: 650,
  /** A finger-released page settles without waiting for React. */
  storySettleMs: 260,
  composerMs: 180,
  /** The composer's focus glow fading in/out (21st.dev "prompt input dynamic grow"). */
  composerGlowMs: 220,
  /** The ripple spreading from where the finger touched the composer. */
  composerRippleMs: 520,
  /** A sent message rising from the composer into the thread. */
  messageRiseMs: 320,
  /** Chat suggestion tiles arriving one after another. */
  tileStaggerMs: 56,
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
  /** A live number (the balance hero, a price) counting to its new value (21st.dev 21513 Number Ticker). */
  tickerMs: 600,
} as const;

/** Springs shared by layout changes that follow a finger or a focus (composer growing, chips arriving). */
export const SPRING = {
  layout: { damping: 20, stiffness: 240, mass: 0.9 },
} as const;

/** The composer ("orb capsule"): compact at rest beside the voice button, full width while typing. */
export const COMPOSER = {
  /** Share of the row the capsule takes at rest; the voice button takes the rest. */
  restWidthPct: 72,
  minHeightPt: 48,
  /** About five lines of text before the field scrolls. */
  maxHeightPt: 140,
  voiceButtonPt: 48,
  rippleSizePt: 56,
  rippleScale: 6,
  /** Peak opacity of the focus glow. */
  glowOpacity: 0.45,
  glowRadiusPt: 14,
} as const;

/** Geometry of the quick-action fan (P19, settled state): circles in a vertical trailing column. */
export const FAN = {
  circlePt: 48,
  pitchPt: 72,
  /** How far past its resting spot a circle overshoots before settling. */
  overshootPt: 6,
  /** The fan's circles, in order of appearance from the plus button upward (Send, Receive, Swap, Request, Fund). */
  count: 5,
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

/** A spring as Reanimated takes it. */
type SpringConfig = { mass: number; stiffness: number; damping: number };
/** The ruler's snap and the slide's spring-back (Senryo's ruler spring, 1/500/40). */
const SNAP_SPRING: SpringConfig = { mass: 1, stiffness: 500, damping: 40 };

/**
 * Slide to confirm (plan §C: 21st 29304 Slide Action Button · starc007, with Senryo's behaviour): a 56pt rail, a
 * 48pt thumb inset 4pt, committing only past 90% of the travel; short of it the thumb springs back.
 */
export const SLIDE = {
  railPt: 56,
  thumbPt: 48,
  insetPt: 4,
  commitAt: 0.9,
  /** The label fades out over this share of the travel. */
  labelFadeAt: 0.6,
  spring: SNAP_SPRING,
  /** The completed face fading in. */
  completeMs: 150,
  /** Uncontrolled only: how long the committed face stays before the thumb returns (the source's resetDelay). */
  uncontrolledResetMs: 1_200,
  /** Reduce Motion: moves take this long instead of springing. */
  reducedMotionMs: 100,
} as const;

/** The leverage ruler (Senryo's LeverageRuler): one multiple per step, ticks on both rails, fading toward the edges. */
export const RULER = {
  stepPt: 44,
  tickPt: 6,
  fadeSteps: 2.5,
  minOpacity: 0.12,
  /** How far a fling carries past the release point, in seconds of its velocity. */
  flingSec: 0.12,
  /** The finger must move this far sideways before the ruler takes the gesture, and not this far vertically. */
  activatePt: 6,
  failVerticalPt: 24,
  snap: SNAP_SPRING,
  reducedMotionMs: 100,
} as const;

/** The borrow health gauge: the needle easing to a new health as the amount changes, and its scale. */
export const HEALTH_GAUGE = {
  moveMs: 320,
  trackPt: 8,
  needlePt: 16,
  /** Health shown at the right end of the track; anything higher (or no debt) sits there. */
  scaleMax: 3,
  /** Health at the left end: 1 is where liquidation starts. */
  scaleMin: 1,
} as const;
