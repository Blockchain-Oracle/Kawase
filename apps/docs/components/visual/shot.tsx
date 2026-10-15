// A capture of the real app in its frame, with numbered pins and a lens on the control that matters, and the stepper
// that walks a flow screen by screen. Everything a reader reads (alt text, pin labels, step titles and bodies) is
// written in the page's MDX, so each language translates it; the positions are numbers on the capture.
//
//   <Shot src="send/review" alt="…" zoom="74 90 7">
//     <Pin at="50 22">The recipient, checked</Pin>
//     <Pin box="6 86 88 8">Slide to send</Pin>
//   </Shot>
//
//   <Walkthrough>
//     <WalkStep title="Who" src="send/to">Body… <Pin at="…">…</Pin></WalkStep>
//     <WalkStep title="Watch the race" clip="swap/race">…</WalkStep>
//   </Walkthrough>
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

import { media, type Device } from "@/lib/media";
import { getMessages } from "@/lib/messages";
import { DeviceFrame, Legend, Overlay, ScreenImage, cx, type PinData } from "./device";
import { lensFor, numbers } from "./geometry";
import { VideoLayer } from "./video";
import { WalkthroughClient, type WalkScreen } from "./walkthrough-client";

interface PinProps {
  /** A dot: "x y" in percent of the capture. */
  at?: string;
  /** An outline around a control: "x y w h" in percent of the capture. */
  box?: string;
  children?: ReactNode;
}

/** A numbered marker on the capture; its text goes in the key. Only read by Shot and WalkStep. */
export function Pin(_props: PinProps): null {
  return null;
}

interface ScreenProps {
  /** A capture: public/media/<src>.<theme>.webp. */
  src?: string;
  /** A clip instead: public/media/<clip>.<theme>.mp4. */
  clip?: string;
  alt?: string;
  /** A lens on "x y r" (percent; r of the width), optionally placed with lens="x y". */
  zoom?: string;
  lens?: string;
  /** Show the light take in both themes (to match neighbouring screens that exist only in light). */
  light?: boolean;
}

function screenFrom(props: ScreenProps, pins: PinData[], fallbackAlt: string): WalkScreen {
  const id = props.clip ?? props.src;
  if (!id) throw new Error("A Shot or WalkStep needs src (a capture) or clip (a video)");
  const item = media(id);
  const zoom = numbers(props.zoom);
  const at = numbers(props.lens);
  const lens =
    zoom.length === 3 && item.kind === "image"
      ? lensFor(
          { x: zoom[0]!, y: zoom[1]!, r: zoom[2]!, ...(at.length === 2 ? { at: [at[0]!, at[1]!] as [number, number] } : {}) },
          item.ratio,
          item.device,
          item.src("light"),
          item.src(props.light ? "light" : "dark"),
        )
      : undefined;
  return {
    kind: item.kind,
    device: item.device,
    ratio: item.ratio,
    light: item.src("light"),
    dark: item.src(props.light ? "light" : "dark"),
    posterLight: item.kind === "video" ? item.poster("light") : undefined,
    posterDark: item.kind === "video" ? item.poster(props.light ? "light" : "dark") : undefined,
    alt: props.alt ?? fallbackAlt,
    pins,
    lens,
  };
}

/** Splits MDX children into the pins (numbered in order) and everything else. */
function splitPins(children: ReactNode) {
  const pins: PinData[] = [];
  const legend: { n: number; label: ReactNode }[] = [];
  const rest: ReactNode[] = [];
  Children.toArray(children).forEach((child) => {
    if (isValidElement(child) && child.type === Pin) {
      const props = (child as ReactElement<PinProps>).props;
      const n = pins.length + 1;
      const box = numbers(props.box);
      const at = numbers(props.at);
      if (box.length === 4) {
        pins.push({ n, x: box[0]!, y: box[1]!, box: [box[0]!, box[1]!, box[2]!, box[3]!] });
      } else if (at.length === 2) {
        pins.push({ n, x: at[0]!, y: at[1]! });
      } else {
        throw new Error(`<Pin> ${n} needs at="x y" or box="x y w h"`);
      }
      legend.push({ n, label: props.children });
    } else {
      rest.push(child);
    }
  });
  return { pins, legend, rest };
}

/** The plain text of MDX content, for alt text. */
const textOf = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
};

export function Shot({ lang, caption, children, ...props }: ScreenProps & { lang: string; caption?: string; children?: ReactNode }) {
  const t = getMessages(lang).visual;
  const { pins, legend } = splitPins(children);
  const screen = screenFrom(props, pins, caption ?? "");
  const content =
    screen.kind === "video" ? (
      <VideoLayer
        light={screen.light}
        dark={screen.dark}
        posterLight={screen.posterLight!}
        posterDark={screen.posterDark!}
        label={screen.alt}
        pauseLabel={t.pause}
        playLabel={t.play}
      />
    ) : (
      <ScreenImage light={screen.light} dark={screen.dark} alt={screen.alt} />
    );
  return (
    <figure className={cx("kv-shot not-prose", legend.length === 0 && "kv-shot-bare")} data-device={screen.device}>
      <div className="kv-shot-inner">
      <div className="kv-shot-stage">
        <DeviceFrame
          device={screen.device}
          overlay={<Overlay ratio={screen.ratio} pins={screen.pins} lens={screen.lens} />}
          className={screen.lens ? "kv-has-lens" : undefined}
        >
          {content}
        </DeviceFrame>
      </div>
      {legend.length > 0 || caption ? (
        <div className="kv-shot-key">
          <Legend items={legend} />
          {caption ? <figcaption className="kv-caption">{caption}</figcaption> : null}
        </div>
      ) : null}
      </div>
    </figure>
  );
}

/** A clip of a flow that moves, in its frame: muted, looping, paused for reduced motion, with a pause button. */
export function Clip({ src, ...props }: { lang: string; src: string; alt?: string; caption?: string; children?: ReactNode }) {
  return <Shot clip={src} {...props} />;
}

interface WalkStepProps extends ScreenProps {
  title: string;
  children?: ReactNode;
}

/** One step of a Walkthrough. Only read by Walkthrough. */
export function WalkStep(_props: WalkStepProps): null {
  return null;
}

export function Walkthrough({ lang, light, children }: { lang: string; light?: boolean; children?: ReactNode }) {
  const t = getMessages(lang).visual;
  const steps = Children.toArray(children)
    .filter((child): child is ReactElement<WalkStepProps> => isValidElement(child) && child.type === WalkStep)
    .map((child) => {
      const { title, children: body, ...screenProps } = child.props;
      const { pins, legend, rest } = splitPins(body);
      return { title, body: rest, legend, screen: screenFrom({ light, ...screenProps }, pins, `${title}. ${textOf(rest)}`.trim()) };
    });
  if (steps.length === 0) return null;
  const device: Device = steps[0]!.screen.device;
  return <WalkthroughClient steps={steps} device={device} labels={{ previous: t.previous, next: t.next, of: t.of, steps: t.steps, pause: t.pause, play: t.play }} />;
}
