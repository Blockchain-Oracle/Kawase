"use client";
// A clip on a device screen: muted and looping, playing only while it is on screen (and, in a stepper, while its step
// is the one shown). Reduced motion starts it paused on its poster. The page's theme picks the light or dark take.
import * as React from "react";
import { Pause, Play } from "lucide-react";

export function useDocTheme(): "light" | "dark" {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark ? "dark" : "light";
}

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function VideoLayer({
  light,
  dark,
  posterLight,
  posterDark,
  label,
  active = true,
  hidden,
  pauseLabel = "Pause",
  playLabel = "Play",
}: {
  light: string;
  dark: string;
  posterLight: string;
  posterDark: string;
  label: string;
  active?: boolean;
  hidden?: boolean;
  pauseLabel?: string;
  playLabel?: string;
}) {
  const theme = useDocTheme();
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLVideoElement>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  // null = follow the reader's motion setting; a tap decides from then on.
  const [choice, setChoice] = React.useState<"play" | "pause" | null>(null);
  const playing = active && inView && (choice ? choice === "play" : !reduced);
  const src = theme === "dark" ? dark : light;
  const poster = theme === "dark" ? posterDark : posterLight;

  React.useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) void video.play().catch(() => setChoice("pause"));
    else video.pause();
  }, [playing, src]);

  // A step shown again starts its clip from the top.
  React.useEffect(() => {
    if (active && ref.current) ref.current.currentTime = 0;
  }, [active]);

  return (
    <div ref={box} className="kv-video" data-hidden={hidden || undefined}>
      <video
        ref={ref}
        key={src}
        className="kv-screen-img"
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload={active ? "metadata" : "none"}
        aria-label={label}
      />
      <button
        type="button"
        className="kv-video-toggle"
        onClick={() => setChoice(playing ? "pause" : "play")}
        aria-label={playing ? pauseLabel : playLabel}
        tabIndex={hidden ? -1 : 0}
      >
        {playing ? <Pause aria-hidden className="size-3.5" fill="currentColor" /> : <Play aria-hidden className="size-3.5" fill="currentColor" />}
      </button>
    </div>
  );
}
