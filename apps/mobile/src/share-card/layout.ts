// The share card's one geometry (1080 × 1350, the 4:5 feed shape FOMO and Senryo export at), shared by the web's
// canvas (preview, PNG, MP4) and the phone's native drawing (preview, PNG), so both make the same picture. Every piece of
// text has its own box and every box is apart from the others by construction: a line that does not fit shrinks to
// its minimum size, then ends in "…" — it never runs into its neighbour (the overlaps Senryo's sheet had: "Cap" over
// "Entry", the footer's two lines colliding). The chart's labels are the price pill, alone in its own column, and three
// time ticks, each in its own third of the plot; markers closer than a face's width share one face with a count.
import type { ShareMarker } from "./model";

export const FRAME = { w: 1080, h: 1350 } as const;

export const L = {
  paper: { x: 36, y: 36, w: 1008, h: 1278, r: 56 },
  left: 100,
  right: 980,
  header: {
    avatar: { x: 100, y: 100, size: 96 },
    textX: 220,
    handle: { base: 144, size: 42, min: 30 },
    date: { base: 190, size: 27, min: 22 },
    chip: { top: 104, h: 50, size: 23, padX: 22, track: 1.6 },
    network: { base: 190, size: 25, min: 20 },
    /** Between the left column's text and the right column's. */
    gap: 24,
    /** The right column never takes more than this, so a long handle keeps room. */
    rightMax: 380,
  },
  plot: { x: 100, y: 252, w: 664, h: 336 },
  grid: { step: 48, dot: 1.6, alpha: 0.07 },
  line: { width: 6, fillAlpha: 0.18 },
  level: { width: 2, dash: 12, alpha: 0.32 },
  head: { r: 10, halo: 24, haloAlpha: 0.18 },
  pill: { right: 980, top: 252, bottom: 588, h: 58, r: 16, size: 30, min: 20, padX: 18, maxW: 196, gap: 20 },
  ticks: { base: 634, size: 25, min: 18 },
  marker: { r: 30, ring: 6, badge: 15, count: { h: 30, size: 20, padX: 9 } },
  hero: {
    // The display face's "$" and "+" rise above its cap height (about 0.86 of the size): the label sits clear of it.
    label: { base: 692, size: 25, track: 1.6, mark: 40, gap: 14 },
    figure: { base: 842, size: 140, min: 84 },
    pct: { base: 898, size: 36, min: 26, tri: 22, gap: 12 },
  },
  hanko: { x: 800, y: 652, size: 180, tilt: -10 },
  facts: { rule: 924, top: 940, bottom: 1040, label: { base: 974, size: 25, min: 19 }, value: { base: 1026, size: 40, min: 26 }, padX: 22 },
  perf: { y: 1088, notch: 24, dash: 10, gap: 10 },
  stub: {
    mark: { x: 100, y: 1150, size: 92 },
    word: { x: 214, base: 1202, size: 58 },
    line: { x: 214, base: 1248, size: 25, min: 19 },
    qr: { x: 812, y: 1120, size: 168, pad: 12, r: 20 },
  },
} as const;

export const HERO_FIGURE_MAX_W = L.hanko.x - L.left - 24;
export const STUB_LINE_MAX_W = L.stub.qr.x - L.stub.line.x - 32;
export const FACT_W = (L.right - L.left) / 3;
export const TICK_W = L.plot.w / 3 - 12;
/** Two moves closer than a face's width (plus a little air) share one marker. */
export const MARKER_GAP_SHARE = (L.marker.r * 2 + 8) / (L.plot.w - (L.marker.r + L.marker.ring + 2) * 2);

// ── The film: when each part appears (ms). The poster and the PNG are its last frame. ─────────────────────────────
export const FILM = {
  fps: 30,
  totalMs: 12_000,
  drawFrom: 500,
  drawTo: 7_500,
  settleMs: 600,
  pctAt: 7_700,
  factsFrom: 7_700,
  factsMs: 900,
  hankoAt: 8_700,
  hankoMs: 420,
  popMs: 320,
} as const;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** A pop past full size and back (markers, the hanko). */
export function overshoot(x: number): number {
  const p = clamp01(x);
  const c = 1.9;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
}

/** Where the film is at `ms`: the drawn share of the line (0–1), and how far each later part has got. */
export function filmAt(ms: number) {
  return {
    draw: clamp01((ms - FILM.drawFrom) / (FILM.drawTo - FILM.drawFrom)),
    pct: easeOut((ms - FILM.pctAt) / FILM.settleMs),
    facts: easeOut((ms - FILM.factsFrom) / FILM.factsMs),
    hanko: clamp01((ms - FILM.hankoAt) / FILM.hankoMs),
    ended: ms >= FILM.hankoAt,
  };
}
export const FINAL_MS = FILM.totalMs;

// ── The chart in frame coordinates ───────────────────────────────────────────────────────────────────────────────
export type Pt = { x: number; y: number };

export type ChartGeometry = {
  /** Every point of the line, in frame pixels. */
  points: Pt[];
  /** The level the line started at (the dashed rule). */
  levelY: number;
  xOf: (t: number) => number;
  yOf: (v: number) => number;
  /** The value of the line at a time (for the moving head and the counting figure). */
  valueAt: (t: number) => number;
  markers: (ShareMarker & Pt)[];
};

/** Room above and below the line inside the plot, as a share of the range, so the markers' faces stay inside. */
const Y_PAD = 0.2;

export function chartGeometry(series: { t: number; v: number }[], markers: ShareMarker[], from: number, to: number): ChartGeometry {
  const span = Math.max(1, to - from);
  const values = series.map((p) => p.v);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) {
    // A flat line sits in the middle.
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * Y_PAD;
  // A marker's face (and its ring) stays inside the plot at either end, so it never reaches the pill's column.
  const inset = L.marker.r + L.marker.ring + 2;
  const top = L.plot.y + inset;
  const bottom = L.plot.y + L.plot.h - inset;
  const xOf = (t: number) => L.plot.x + inset + ((t - from) / span) * (L.plot.w - inset * 2);
  const yOf = (v: number) => bottom - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (bottom - top);
  const valueAt = (t: number) => {
    if (t <= series[0]!.t) return series[0]!.v;
    for (let i = 1; i < series.length; i += 1) {
      const a = series[i - 1]!;
      const b = series[i]!;
      if (t <= b.t) return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    }
    return series.at(-1)!.v;
  };
  return {
    points: series.map((p) => ({ x: xOf(p.t), y: yOf(p.v) })),
    levelY: yOf(series[0]!.v),
    xOf,
    yOf,
    valueAt,
    markers: markers.map((m) => ({ ...m, x: xOf(m.t), y: yOf(m.v) })),
  };
}

/** The line drawn up to `share` of its time span, ending at the moving head. */
export function partialLine(g: ChartGeometry, from: number, to: number, share: number): { points: Pt[]; head: Pt; t: number } {
  const t = from + (to - from) * share;
  const x = g.xOf(t);
  const points = g.points.filter((p) => p.x <= x);
  const head = { x, y: g.yOf(g.valueAt(t)) };
  return { points: [...points, head], head, t };
}

/** The pill's top: centred on the head, kept inside the plot. */
export const pillTop = (headY: number) => Math.min(L.pill.bottom - L.pill.h, Math.max(L.pill.top, headY - L.pill.h / 2));
