// The docs' captures and clips (public/media/<page>/<name>.<theme>.webp|mp4), listed in media-manifest.json by the
// capture run that made them (see public/media/provenance.json). A page naming media that isn't there fails the build
// instead of shipping a broken frame.
import manifest from "./media-manifest.json";

export type Theme = "light" | "dark";
export type Device = "phone" | "desktop";

interface Entry {
  kind: "image" | "video";
  device: Device;
  /** Pixel size of the file (phone captures are 390 × 844 pt at 3×, desktop 1440 × 900 pt at 2×). */
  w: number;
  h: number;
  themes: Theme[];
}

export interface Media extends Entry {
  id: string;
  /** Height over width: the overlay's coordinate system follows it. */
  ratio: number;
  src: (theme: Theme) => string;
  poster: (theme: Theme) => string;
}

const ENTRIES = manifest as Record<string, Entry>;

export function media(id: string): Media {
  const entry = ENTRIES[id];
  if (!entry) throw new Error(`docs media "${id}" is not in lib/media-manifest.json`);
  // A capture made in one theme only is shown in both.
  const pick = (theme: Theme) => (entry.themes.includes(theme) ? theme : entry.themes[0]!);
  const ext = entry.kind === "video" ? "mp4" : "webp";
  return {
    ...entry,
    id,
    ratio: entry.h / entry.w,
    src: (theme) => `/media/${id}.${pick(theme)}.${ext}`,
    poster: (theme) => `/media/${id}.${pick(theme)}.poster.webp`,
  };
}
