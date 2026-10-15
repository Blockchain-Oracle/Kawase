// Where a lens goes and what it shows, worked out once on the server so the markup is plain percentages.
// Units: x and y of the spot are percent of the capture's width and height; r and the lens size are percent of its
// width. The overlay's viewBox is 100 wide and 100 × ratio tall, so circles stay round at any size.
import type { Device } from "@/lib/media";
import type { LensData } from "./device";

/** The lens's diameter, in percent of the screen's width. */
const LENS_SIZE: Record<Device, number> = { phone: 46, desktop: 22 };
const GAP = 3;

export interface ZoomSpec {
  x: number;
  y: number;
  /** Radius of the magnified spot, percent of the capture's width (smaller = closer). */
  r: number;
  /** Where the lens sits, percent of width and height; by default beside the spot, past the frame's edge. */
  at?: [number, number];
}

export function lensFor(zoom: ZoomSpec, ratio: number, device: Device, light: string, dark: string): LensData {
  const size = LENS_SIZE[device];
  const L = size / 2;
  const H = 100 * ratio;
  const X = zoom.x;
  const Y = (zoom.y / 100) * H;
  const R = zoom.r;

  let cx: number;
  let cy: number;
  if (zoom.at) {
    cx = zoom.at[0];
    cy = (zoom.at[1] / 100) * H;
  } else {
    // Bulge past the side nearer the spot; sit above it when there is room, else below.
    cx = device === "phone" ? (X >= 50 ? 100 - 0.42 * L : 0.42 * L) : X >= 50 ? 100 - L - GAP : L + GAP;
    const above = Y - R - L - GAP;
    cy = above - L >= 1 ? above : Y + R + L + GAP;
    cy = Math.min(Math.max(cy, L + 1), H - L - 1);
  }

  // The image is k times the lens; background-position percentages place the spot's centre at the lens's centre.
  const k = size / (2 * R);
  const bgX = ((0.5 - (X / 100) * k) / (1 - k)) * 100;
  const bgY = ((0.5 - (zoom.y / 100) * k * ratio) / (1 - k * ratio)) * 100;

  const dx = cx - X;
  const dy = cy - Y;
  const distance = Math.hypot(dx, dy);
  const leader: LensData["leader"] =
    distance > R + L + 1
      ? [X + (dx / distance) * R, Y + (dy / distance) * R, cx - (dx / distance) * L, cy - (dy / distance) * L]
      : undefined;

  return {
    left: cx,
    top: (cy / H) * 100,
    size,
    bgSize: k * 100,
    bgX,
    bgY,
    ring: { x: X, y: Y, r: R },
    leader,
    light,
    dark,
  };
}

/** "12 40" or "12 40 30 8" → numbers; MDX attributes arrive as strings. */
export function numbers(value: string | number[] | undefined): number[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}
