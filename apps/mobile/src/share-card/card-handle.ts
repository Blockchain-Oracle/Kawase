// What a drawn card hands the share screen, on both platforms: the picture (and on the web the film) as a file.
export type CardFile = { kind: "blob"; blob: Blob; name: string } | { kind: "uri"; uri: string; name: string };

export type CardHandle = {
  /** Plays the film again from the start (the preview). */
  replay: () => void;
  /** The still: the film's last frame, 1080 × 1350 PNG. */
  image: () => Promise<CardFile>;
  /** The film as an MP4 (the web), or undefined where it cannot be made. */
  video?: ((onProgress: (share: number) => void, signal: AbortSignal) => Promise<CardFile>) | undefined;
};

/** "2026-10-16" from an ISO time. */
const DATE_CHARS = 10;
export const fileStem = (period: string) => `kawase-${period}-${new Date().toISOString().slice(0, DATE_CHARS)}`;
