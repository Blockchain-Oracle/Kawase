// The one geometry the Skia sparkline (native) and the SVG sparkline (web) both draw: a 24-hour price series as an SVG
// path string, its closed area, the dashed baseline (the price at the start of the window) and the direction tone.
// Gaps in the series (null) stay gaps. Pure, so a worklet-free test can pin it.

export type SparkTone = "up" | "down" | "flat";
export type SparkGeometry = { d: string; area: string; baseY: number; tone: SparkTone; last: { x: number; y: number } };

const FLAT_EPSILON = 1e-12;
/** The narrowest window a sparkline draws, as a share of the price. */
const MIN_RELATIVE_SPAN = 0.01;
const DECIMALS = 2;
const MIN_POINTS = 2;
const BOTH_SIDES = 2;
const fmt = (n: number) => n.toFixed(DECIMALS);

export function sparkGeometry(
  points: readonly (number | null)[],
  width: number,
  height: number,
  pad: number,
  baseline?: number,
): SparkGeometry | null {
  const known = points.filter((p): p is number => p !== null && Number.isFinite(p));
  if (known.length < MIN_POINTS) return null;
  const base = baseline ?? (known[0] as number);
  const low = Math.min(...known, base);
  const high = Math.max(...known, base);
  // A stablecoin's 0.1 % jitter is not a swing: the window is never narrower than 1 % of the price, centred on the
  // move, so a calm series reads calm and a real move still fills the height.
  const floor = Math.abs(base) * MIN_RELATIVE_SPAN;
  const span = Math.max(high - low, floor) < FLAT_EPSILON ? 1 : Math.max(high - low, floor);
  const lo = (low + high) / BOTH_SIDES - span / BOTH_SIDES;
  const innerW = width - pad * BOTH_SIDES;
  const innerH = height - pad * BOTH_SIDES;
  const x = (i: number) => pad + (points.length === 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad + innerH - ((v - lo) / span) * innerH;
  let d = "";
  let area = "";
  let runStart = -1;
  let lastPoint = { x: 0, y: 0 };
  const closeRun = (end: number) => {
    if (runStart < 0) return;
    area += `L${fmt(x(end))} ${fmt(height - pad)} L${fmt(x(runStart))} ${fmt(height - pad)} Z `;
    runStart = -1;
  };
  points.forEach((value, i) => {
    if (value === null || !Number.isFinite(value)) {
      closeRun(i - 1);
      return;
    }
    const px = x(i);
    const py = y(value);
    if (runStart < 0) {
      runStart = i;
      d += `M${fmt(px)} ${fmt(py)} `;
      area += `M${fmt(px)} ${fmt(py)} `;
    } else {
      d += `L${fmt(px)} ${fmt(py)} `;
      area += `L${fmt(px)} ${fmt(py)} `;
    }
    lastPoint = { x: px, y: py };
  });
  closeRun(points.length - 1);
  const end = known[known.length - 1] as number;
  const tone: SparkTone = Math.abs(end - base) < FLAT_EPSILON ? "flat" : end > base ? "up" : "down";
  return { d: d.trim(), area: area.trim(), baseY: y(base), tone, last: lastPoint };
}
