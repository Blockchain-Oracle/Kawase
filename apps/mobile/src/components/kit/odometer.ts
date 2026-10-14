/**
 * Worklets capture what they call when they are defined: a helper must come before the worklet that calls it.
 *
 * Rolling digits on the UI thread (Tradash's `CanvasOdometer` as Owarine re-implements it; 21st.dev #20071 Animate
 * Digits' "only changed digits move, up on a rise, down on a fall"): every digit position, counted from the right, is a
 * slot rolling to its new digit while `$ , . + −` stay still. One implementation for the chart's pill and every live
 * money figure (cash-out value, balance) — worklets, so a tick never renders React.
 */
import { ClipOp, type SkCanvas, type SkFont, Skia, type SkPaint } from "@shopify/react-native-skia";

/** Per-sample approach of a rolling digit (0.22 at 60 Hz), and its snap threshold. */
export const DIGIT_EASE = 0.22;
export const DIGIT_SNAP = 0.002;
const MS_PER_SECOND = 1000;
const SAMPLE_HZ = 60;
const SAMPLE_MS = MS_PER_SECOND / SAMPLE_HZ;
const DIGITS = 10;
const FRAC_EPS = 1e-3;
const HALF = 2;
const CLIP_PAD = 5;

export interface Odometer {
  text: string;
  value: number;
  /** Per character counted from the right: current and target roll positions (digits only). */
  cur: number[];
  target: number[];
}

export function emptyOdometer(): Odometer {
  "worklet";
  return { text: "", value: Number.NaN, cur: [], target: [] };
}

const isDigit = (c: string | undefined): boolean => {
  "worklet";
  return c !== undefined && c >= "0" && c <= "9";
};

/** A slot's new target: the mod-10 distance, forward on a rise, backward on a fall, the short way when flat. */
export function rollTarget(cur: number, digitNow: number, digitNext: number, direction: number): number {
  "worklet";
  const fwd = (digitNext - digitNow + DIGITS) % DIGITS;
  const back = fwd === 0 ? 0 : fwd - DIGITS;
  const delta = direction > 0 ? fwd : direction < 0 ? back : Math.abs(back) < fwd ? back : fwd;
  return cur + delta;
}

/** The odometer's text with its roll direction given outright (money figures compare as bigints on the JS thread). */
export function setOdometerTrend(o: Odometer, text: string, direction: number): void {
  "worklet";
  if (text === o.text) return;
  const cur: number[] = [];
  const target: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[text.length - 1 - i];
    const prev = o.text[o.text.length - 1 - i];
    if (!isDigit(c)) {
      cur.push(0);
      target.push(0);
      continue;
    }
    const d = Number(c);
    const had = o.target[i];
    if (had === undefined || !isDigit(prev)) {
      cur.push(d);
      target.push(d);
    } else {
      cur.push(o.cur[i] ?? d);
      target.push(rollTarget(had, Number(prev), d, direction));
    }
  }
  o.text = text;
  o.cur = cur;
  o.target = target;
}

/** The odometer's text; `value` gives the roll direction (a rise rolls up). */
export function setOdometer(o: Odometer, text: string, value: number): void {
  "worklet";
  if (text === o.text) return;
  const direction = Number.isFinite(o.value) && Number.isFinite(value) ? Math.sign(value - o.value) : 0;
  setOdometerTrend(o, text, direction);
  o.value = value;
}

/** Advances every slot by one frame of `dtMs`; true while anything is still rolling. */
export function stepOdometer(o: Odometer, dtMs: number): boolean {
  "worklet";
  const k = 1 - (1 - DIGIT_EASE) ** (Math.max(0, dtMs) / SAMPLE_MS);
  let moving = false;
  for (let i = 0; i < o.cur.length; i += 1) {
    const t = o.target[i] ?? 0;
    const c = o.cur[i] ?? 0;
    const next = Math.abs(t - c) < DIGIT_SNAP ? t : c + (t - c) * k;
    if (next !== t) moving = true;
    o.cur[i] = next;
  }
  return moving;
}

/**
 * Draws right-aligned at `right`, centred on `midY`, clipped to [top, bottom] so rolling digits vanish at the edge.
 * Digits advance by `digitAdvance` (tabular), other characters by their own width; `pitch` is the roll distance.
 */
export function drawOdometer(
  c: SkCanvas,
  o: Odometer,
  font: SkFont,
  paint: SkPaint,
  right: number,
  midY: number,
  pitch: number,
  top: number,
  bottom: number,
): void {
  "worklet";
  const text = o.text;
  const m = font.getMetrics();
  const base = midY - (m.ascent + m.descent) / HALF;
  const digitAdvance = font.getTextWidth("0");
  let width = 0;
  for (let i = 0; i < text.length; i += 1) width += isDigit(text[i]) ? digitAdvance : font.getTextWidth(text[i] ?? "");
  c.save();
  c.clipRect(
    Skia.XYWHRect(right - width - CLIP_PAD, top, width + CLIP_PAD * HALF, bottom - top),
    ClipOp.Intersect,
    true,
  );
  let x = right;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[text.length - 1 - i] ?? "";
    if (!isDigit(ch)) {
      x -= font.getTextWidth(ch);
      c.drawText(ch, x, base, paint, font);
      continue;
    }
    x -= digitAdvance;
    const cur = o.cur[i] ?? Number(ch);
    const lo = Math.floor(cur);
    const frac = cur - lo;
    const digit = ((lo % DIGITS) + DIGITS) % DIGITS;
    const dx = (digitAdvance - font.getTextWidth(String(digit))) / HALF;
    if (frac < FRAC_EPS) c.drawText(String(digit), x + dx, base, paint, font);
    else {
      const next = (digit + 1) % DIGITS;
      c.drawText(String(digit), x + dx, base - frac * pitch, paint, font);
      c.drawText(
        String(next),
        x + (digitAdvance - font.getTextWidth(String(next))) / HALF,
        base + (1 - frac) * pitch,
        paint,
        font,
      );
    }
  }
  c.restore();
}

/** The drawn width of `o`'s text (tabular digits). */
export function odometerWidth(o: Odometer, font: SkFont): number {
  "worklet";
  const digitAdvance = font.getTextWidth("0");
  let width = 0;
  for (let i = 0; i < o.text.length; i += 1)
    width += isDigit(o.text[i]) ? digitAdvance : font.getTextWidth(o.text[i] ?? "");
  return width;
}
