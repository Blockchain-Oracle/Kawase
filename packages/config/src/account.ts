// Account and access (cards/access.md): devices, deletion, and the oldest app version the api still serves.

/** A deleted account's @handle cannot be taken by anyone for this long (X16). */
export const HANDLE_HOLD_DAYS = 30;
/** Device names as the app reports them ("Abu's iPhone"). */
export const DEVICE_NAME_MAX = 80;
/** When the api sets no minimum, every app version is served. */
export const MIN_APP_VERSION_DEFAULT = "0.0.0";

/** "1.4.10" vs "1.4.9": numeric, part by part; missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
