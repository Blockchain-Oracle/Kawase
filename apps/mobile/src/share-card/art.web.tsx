// The card's art on the web, drawn by the app's own components (the default avatar's koban, the Kawase mark, the hanko,
// every coin's real mark) and turned into images the canvas can draw: they render once out of sight, then each is
// copied element by element (a filled round View is a disc, an <svg> is serialized, an <img> is the logo itself). So a
// coin on the card is the same mark as in the wallet rows, never a stand-in. A logo the browser may not copy (no CORS)
// falls back to the coin's labelled disc, the same fallback TokenMark shows.
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import * as React from "react";
import { View } from "react-native";

import { L } from "./layout";
import type { ShareToken } from "./model";

export type CardImages = {
  avatar: CanvasImageSource | null;
  mark: CanvasImageSource | null;
  hanko: CanvasImageSource | null;
  tokens: ReadonlyMap<string, CanvasImageSource>;
};

export const tokenKey = (token: ShareToken) => `${token.chainId}:${token.address.toLowerCase()}`;

/** Art is drawn at twice the card's size for crisp edges in the 1080 px export. */
const SCALE = 2;
const SETTLE_MS = 250;

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    if (cors) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement | null> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(box.width));
  copy.setAttribute("height", String(box.height));
  const xml = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    return await loadImage(url, false);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

const transparent = (colour: string) => colour === "transparent" || colour === "rgba(0, 0, 0, 0)" || colour === "";

/** Copies a small rendered subtree (discs, SVGs, images, a line of text) onto a canvas of its size. */
async function snapshot(root: HTMLElement): Promise<HTMLCanvasElement | null> {
  const rootBox = root.getBoundingClientRect();
  if (rootBox.width === 0 || rootBox.height === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rootBox.width * SCALE);
  canvas.height = Math.round(rootBox.height * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  const at = (el: Element) => {
    const box = el.getBoundingClientRect();
    return { x: box.left - rootBox.left, y: box.top - rootBox.top, w: box.width, h: box.height };
  };
  const walk = async (el: Element): Promise<void> => {
    if (el instanceof SVGSVGElement) {
      const image = await svgImage(el);
      const box = at(el);
      if (image) ctx.drawImage(image, box.x, box.y, box.w, box.h);
      return;
    }
    if (!(el instanceof HTMLElement)) return;
    const style = getComputedStyle(el);
    if (style.opacity === "0" && el !== root) return;
    const box = at(el);
    const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, box.w / 2, box.h / 2);
    if (!transparent(style.backgroundColor)) {
      ctx.fillStyle = style.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, radius);
      ctx.fill();
    }
    const border = parseFloat(style.borderTopWidth) || 0;
    if (border > 0 && !transparent(style.borderTopColor)) {
      ctx.strokeStyle = style.borderTopColor;
      ctx.lineWidth = border;
      ctx.beginPath();
      ctx.roundRect(box.x + border / 2, box.y + border / 2, box.w - border, box.h - border, Math.max(0, radius - border / 2));
      ctx.stroke();
    }
    const background = /url\("?(.*?)"?\)/.exec(style.backgroundImage)?.[1];
    const src = el instanceof HTMLImageElement ? el.currentSrc || el.src : background;
    if (src) {
      const image = await loadImage(src, true);
      if (!image) throw new Error("logo not copyable");
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, radius);
      ctx.clip();
      ctx.drawImage(image, box.x, box.y, box.w, box.h);
      ctx.restore();
    }
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.textContent.trim(), box.x + box.w / 2, box.y + box.h / 2);
      }
    }
    // A rounded box that clips (a coin's disc, the avatar's circle) clips what is inside it here too.
    const clips = style.overflow === "hidden" && radius > 0;
    if (clips) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, radius);
      ctx.clip();
    }
    for (const child of el.children) await walk(child);
    if (clips) ctx.restore();
  };
  try {
    await walk(root);
  } catch {
    return null;
  }
  return canvas;
}

type Slot = { key: string; node: HTMLElement | null };

/** Renders the art out of sight and hands the images back once (again whenever the set of coins changes). */
export function CardArt({ seed, tokens, onReady }: { seed: string; tokens: readonly ShareToken[]; onReady: (images: CardImages) => void }) {
  const slots = React.useRef(new Map<string, Slot>());
  const signature = `${seed}|${tokens.map(tokenKey).join(",")}`;
  const ready = React.useRef(onReady);
  ready.current = onReady;
  const ref = (key: string) => (node: View | null) => {
    slots.current.set(key, { key, node: node as unknown as HTMLElement | null });
  };
  React.useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        const take = async (key: string) => {
          const node = slots.current.get(key)?.node;
          return node ? snapshot(node) : null;
        };
        const [avatar, mark, hanko] = await Promise.all([take("avatar"), take("mark"), take("hanko")]);
        const marks = new Map<string, CanvasImageSource>();
        for (const token of tokens) {
          const key = tokenKey(token);
          const image = (await take(`token:${key}`)) ?? (await take(`label:${key}`));
          if (image) marks.set(key, image);
        }
        if (live) ready.current({ avatar, mark, hanko, tokens: marks });
      })();
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The signature names everything drawn; the refs are filled by the render below.
  }, [signature]);

  const markSize = L.marker.r * 2;
  return (
    <View pointerEvents="none" aria-hidden style={{ position: "absolute", left: -4000, top: 0, opacity: 1 }}>
      <View ref={ref("avatar")} style={{ alignSelf: "flex-start" }}>
        <DefaultAvatar seed={seed} size={L.header.avatar.size} />
      </View>
      <View ref={ref("mark")} style={{ alignSelf: "flex-start" }}>
        <KawaseMark size={L.stub.mark.size} />
      </View>
      <View ref={ref("hanko")} style={{ alignSelf: "flex-start" }}>
        <Hanko size={L.hanko.size} id="share-card-hanko" />
      </View>
      {tokens.map((token) => (
        <React.Fragment key={tokenKey(token)}>
          <View ref={ref(`token:${tokenKey(token)}`)} style={{ alignSelf: "flex-start" }}>
            <TokenMark token={token} size={markSize} />
          </View>
          <View ref={ref(`label:${tokenKey(token)}`)} style={{ alignSelf: "flex-start" }}>
            <TokenMark token={{ ...token, logoUrl: null, address: `${token.address}-label` }} size={markSize} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}
