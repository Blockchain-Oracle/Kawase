"use client";
// The stepper: the device shows the chosen step's screen (its pins and lens over it), the rail lists every step.
// Wide: the steps sit beside the device, every body readable at once, the chosen one marked. Narrow: the device on
// top, the steps below as an accordion. Tap a step, use the arrows, swipe the device, or ← → on the keyboard.
import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import type { Device } from "@/lib/media";
import { DeviceFrame, Legend, Overlay, ScreenImage, type LensData, type PinData } from "./device";
import { VideoLayer } from "./video";

export interface WalkScreen {
  kind: "image" | "video";
  device: Device;
  ratio: number;
  light: string;
  dark: string;
  posterLight: string | undefined;
  posterDark: string | undefined;
  alt: string;
  pins: PinData[];
  lens: LensData | undefined;
}

interface Step {
  title: string;
  body: React.ReactNode;
  legend: { n: number; label: React.ReactNode }[];
  screen: WalkScreen;
}

const SWIPE = 40;

export function WalkthroughClient({
  steps,
  device,
  labels,
}: {
  steps: Step[];
  device: Device;
  labels: { previous: string; next: string; of: string; steps: string; pause?: string; play?: string };
}) {
  const [active, setActive] = React.useState(0);
  const id = React.useId();
  const start = React.useRef<number | null>(null);
  const count = steps.length;
  const go = React.useCallback((index: number) => setActive(Math.min(Math.max(index, 0), count - 1)), [count]);
  const rtl = () => typeof document !== "undefined" && document.documentElement.dir === "rtl";

  // The next screen is fetched before it is asked for.
  React.useEffect(() => {
    const next = steps[active + 1]?.screen;
    if (!next || next.kind !== "image") return;
    const dark = document.documentElement.classList.contains("dark");
    const image = new Image();
    image.src = dark ? next.dark : next.light;
  }, [active, steps]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const forward = (event.key === "ArrowRight") !== rtl();
    go(active + (forward ? 1 : -1));
    event.preventDefault();
  };

  return (
    <section className="kv-walk not-prose" data-device={device} aria-label={labels.steps} onKeyDown={onKeyDown}>
      <div className="kv-walk-inner">
      <div
        className="kv-walk-stage"
        onPointerDown={(event) => {
          start.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (start.current === null) return;
          const dx = event.clientX - start.current;
          start.current = null;
          if (Math.abs(dx) < SWIPE) return;
          const forward = dx < 0 !== rtl();
          go(active + (forward ? 1 : -1));
        }}
      >
        <DeviceFrame
          device={device}
          className={steps.some((step) => step.screen.lens) ? "kv-has-lens" : undefined}
          overlay={steps.map((step, index) => (
            <Overlay key={index} ratio={step.screen.ratio} pins={step.screen.pins} lens={step.screen.lens} hidden={index !== active} />
          ))}
        >
          {steps.map((step, index) =>
            step.screen.kind === "video" ? (
              <VideoLayer
                key={index}
                light={step.screen.light}
                dark={step.screen.dark}
                posterLight={step.screen.posterLight!}
                posterDark={step.screen.posterDark!}
                label={step.screen.alt}
                active={index === active}
                hidden={index !== active}
                {...(labels.pause ? { pauseLabel: labels.pause } : {})}
                {...(labels.play ? { playLabel: labels.play } : {})}
              />
            ) : (
              <ScreenImage key={index} light={step.screen.light} dark={step.screen.dark} alt={step.screen.alt} eager={index === 0} hidden={index !== active} />
            ),
          )}
        </DeviceFrame>
      </div>
      <div className="kv-walk-rail">
        <ol className="kv-walk-steps">
          {steps.map((step, index) => {
            const current = index === active;
            return (
              <li key={index} className="kv-walk-step" data-active={current || undefined} data-done={index < active || undefined}>
                <button
                  type="button"
                  className="kv-walk-head"
                  onClick={() => go(index)}
                  aria-current={current ? "step" : undefined}
                  aria-controls={`${id}-${index}`}
                  aria-expanded={current}
                >
                  <span className="kv-walk-n">{index + 1}</span>
                  <span className="kv-walk-title">{step.title}</span>
                </button>
                <div className="kv-walk-body" id={`${id}-${index}`}>
                  <div className="kv-walk-body-inner">
                    <div className="kv-walk-text">{step.body}</div>
                    {step.legend.length > 0 ? (
                      <div className="kv-walk-legend">
                        <Legend items={step.legend} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="kv-walk-nav">
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label={labels.previous} className="kv-walk-arrow">
            <ArrowLeft aria-hidden className="kv-flip size-4" />
          </button>
          <span className="kv-walk-count" aria-live="polite">
            {active + 1} {labels.of} {count}
          </span>
          <button type="button" onClick={() => go(active + 1)} disabled={active === count - 1} aria-label={labels.next} className="kv-walk-arrow kv-walk-next">
            <ArrowRight aria-hidden className="kv-flip size-4" />
          </button>
        </div>
      </div>
      </div>
    </section>
  );
}
