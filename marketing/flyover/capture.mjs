// Step 1 of the film: capture the landing as flat pictures the film page flies over.
//
//   node capture.mjs [url]            # default https://getkawase.xyz → capture/
//
// Headless Chrome at 1440 px wide, device scale 2, light theme, reduced motion (the hero's devices flat and still, the
// tapes still, every reveal already in place). Before anything is measured the page is set still for a camera that sees
// it all at once: the corner QR card hidden, the sticky header in its place, and the pinned tour laid out as the page
// reads at rest (every step at full strength, the steps' scroll room taken out, the phone beside them). The live app is
// not changed: all of this is CSS and DOM set on the captured copy.
//
// Output: page-N.png (the page in 2048 px tiles, the lifting pieces hidden), pieces/<id>.png (each piece alone on a
// transparent background with 28 px padding) and manifest.json (every tile's and piece's place on the page, in CSS px,
// plus the section anchors the camera is timed against).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "capture");
const URL = process.argv[2] ?? "https://getkawase.xyz";
const WIDTH = 1440;
const DPR = 2;
const PAD = 28;
const TILE = 2048;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "pieces"), { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: DPR, colorScheme: "light", reducedMotion: "reduce" });
const page = await context.newPage();
await page.goto(URL, { waitUntil: "networkidle" });

// Walk the page once so every lazy image loads, then come back to the top.
const height0 = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < height0; y += 500) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(90);
}
await page.evaluate(() => window.scrollTo(0, 0));

await page.addStyleTag({
  content: `
    html { scroll-behavior: auto !important; }
    /* Reveal's server-rendered start state survives hydration under reduced motion (the client renders a plain div,
       React keeps the server's inline style), so those blocks would stay invisible: put them in place. */
    [style*="translateY(28px)"] { opacity: 1 !important; transform: none !important; }
    aside[aria-label="Get Kawase on your phone"] { display: none !important; }
    header.sticky { position: relative !important; top: 0 !important; }
    .lp-tape { scrollbar-width: none !important; }
    .lp-tape::-webkit-scrollbar { display: none !important; }
    #tour li[data-step] { min-height: 0 !important; padding: 34px 0 !important; }
    #tour li[data-step] > div { opacity: 1 !important; }
    /* Pieces are pictured alone: their own CSS shadows go (the film draws every shadow), and so does the phone's
       square paper backing that only hides on paper. */
    [data-layer] { box-shadow: none !important; filter: none !important; }
    .phone { background: transparent !important; }
    body.fly-page [data-layer], body.fly-page [data-layer] * { visibility: hidden !important; }
    body.fly-piece * { visibility: hidden !important; }
    body.fly-piece [data-layer-on], body.fly-piece [data-layer-on] * { visibility: visible !important; }
    body.fly-piece [data-layer-on] [data-layer]:not([data-layer-on]), body.fly-piece [data-layer-on] [data-layer]:not([data-layer-on]) * { visibility: hidden !important; }
    body.fly-piece, html:has(body.fly-piece) { background: transparent !important; }
  `,
});

// The tour at rest: the phone column centred beside the steps instead of pinned.
await page.evaluate(() => {
  const sticky = document.querySelector("#tour .sticky");
  if (sticky) {
    sticky.style.position = "relative";
    sticky.style.top = "0";
    sticky.style.height = "720px";
    const column = sticky.parentElement;
    column.style.display = "flex";
    column.style.alignItems = "center";
    column.style.justifyContent = "center";
    sticky.style.width = "100%";
  }
});

// Mark the pieces that lift. Each gets an id and a kind the film reads its motion by.
const pieces = await page.evaluate(() => {
  const list = [];
  const mark = (el, id, kind, extra = {}) => {
    if (!el) return;
    el.setAttribute("data-layer", id);
    list.push({ id, kind, ...extra });
  };
  const hero = document.querySelector("main section");
  mark(hero.querySelector("a.lp-chip"), "hero-live", "chip");
  const buttons = hero.querySelectorAll(".mt-9.flex a");
  mark(buttons[0], "hero-open", "button");
  mark(buttons[1], "hero-phone", "button");
  hero.querySelectorAll('ul[aria-label="Built with"] li').forEach((li, i) => mark(li, `hero-chip-${i}`, "chip"));
  mark(hero.querySelector(".window")?.parentElement, "hero-window", "device");
  const phones = hero.querySelectorAll(".phone");
  mark(phones[0], "hero-phone-a", "device");
  mark(phones[1], "hero-phone-b", "device");

  const tape = document.querySelector('section[aria-label="Trending on Arc"]');
  tape?.querySelectorAll(".lp-tape-track > div:first-child > a").forEach((a, i) => {
    const r = a.getBoundingClientRect();
    if (r.right > 40 && r.left < 1400) mark(a, `tape-${i}`, "token");
  });

  const inside = document.getElementById("inside");
  inside.querySelectorAll(".lp-tape-track ul:first-child li").forEach((li, i) => {
    const r = li.getBoundingClientRect();
    if (r.right > 0 && r.left < 1440) mark(li, `venue-${i}`, "venue");
  });
  mark(inside.querySelector(".pointer-events-none.absolute .rounded-\\[26px\\]"), "kawase-mark", "hero-mark");
  inside.querySelectorAll("a.lp-tile").forEach((a, i) => mark(a, `area-${i}`, "card"));

  const tour = document.getElementById("tour");
  mark(tour.querySelector(".hidden.lg\\:block .phone"), "tour-phone", "device");

  const safety = document.getElementById("safety");
  safety.querySelectorAll("ul a > span:first-child").forEach((s, i) => mark(s, `safety-icon-${i}`, "icon"));
  mark(safety.querySelector(".lp-tile"), "budget", "testimonial");

  const proof = document.getElementById("proof");
  proof.querySelectorAll("ul > li > .lp-tile, ul > li > div.lp-tile, ul .lp-tile").forEach((c, i) => mark(c, `proof-${i}`, "card"));

  const get = document.getElementById("get");
  get.querySelectorAll('[role="group"][aria-label="Get Kawase"] > *').forEach((b, i) => mark(b, `badge-${i}`, "chip"));
  mark(get.querySelector(".lp-qr"), "get-qr", "card");
  const getPhones = get.querySelectorAll(".phone");
  mark(getPhones[0], "get-phone-a", "device");
  mark(getPhones[1], "get-phone-b", "device");
  return list;
});

await page.evaluate(async () => {
  await document.fonts.ready;
  // Only the images on screen at 1440 px (the narrow layout's phones never load), each given 8 s at most.
  const shown = [...document.images].filter((img) => img.getClientRects().length > 0);
  const settle = (img) => (img.complete ? img.decode().catch(() => {}) : new Promise((r) => img.addEventListener("load", r, { once: true })));
  await Promise.all(shown.map((img) => Promise.race([settle(img), new Promise((r) => setTimeout(r, 8000))])));
});
await page.waitForTimeout(600);

// Measure: every piece's box (and its corner radius), the section anchors, the page.
const layout = await page.evaluate(({ PAD }) => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  };
  const pieces = [...document.querySelectorAll("[data-layer]")].map((el) => {
    const b = box(el);
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return { id: el.getAttribute("data-layer"), inner: b, radius, rect: { x: b.x - PAD, y: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD } };
  });
  const anchor = (sel) => {
    const el = document.querySelector(sel);
    return el ? box(el) : null;
  };
  return {
    height: document.documentElement.scrollHeight,
    pieces,
    anchors: {
      hero: anchor("main section"),
      heroTitle: anchor("#hero-title"),
      tape: anchor('section[aria-label="Trending on Arc"]'),
      inside: anchor("#inside"),
      insideTitle: anchor("#inside-title"),
      tour: anchor("#tour"),
      tourTitle: anchor("#tour-title"),
      safety: anchor("#safety"),
      safetyTitle: anchor("#safety-title"),
      proof: anchor("#proof"),
      proofTitle: anchor("#proof-title"),
      get: anchor("#get"),
      getTitle: anchor("#get-title"),
      footer: anchor("footer"),
    },
  };
}, { PAD });

// The page, pieces hidden, in tiles.
await page.evaluate(() => document.body.classList.add("fly-page"));
const tiles = [];
for (let y = 0, i = 0; y < layout.height; y += TILE, i++) {
  const h = Math.min(TILE, layout.height - y);
  const file = `page-${i}.png`;
  await page.screenshot({ path: join(OUT, file), clip: { x: 0, y, width: WIDTH, height: h }, fullPage: true });
  tiles.push({ file, y, h });
}
await page.evaluate(() => document.body.classList.remove("fly-page"));

// Each piece alone.
await page.evaluate(() => document.body.classList.add("fly-piece"));
for (const piece of layout.pieces) {
  await page.evaluate((id) => document.querySelector(`[data-layer="${id}"]`).setAttribute("data-layer-on", ""), piece.id);
  const { x, y, w, h } = piece.rect;
  piece.file = `pieces/${piece.id}.png`;
  await page.screenshot({ path: join(OUT, piece.file), clip: { x, y, width: w, height: h }, fullPage: true, omitBackground: true });
  await page.evaluate((id) => document.querySelector(`[data-layer="${id}"]`).removeAttribute("data-layer-on"), piece.id);
}

const kinds = Object.fromEntries(pieces.map((p) => [p.id, p.kind]));
const manifest = {
  url: URL,
  captured: new Date().toISOString(),
  width: WIDTH,
  height: layout.height,
  dpr: DPR,
  pad: PAD,
  tiles,
  anchors: layout.anchors,
  pieces: layout.pieces.map((p) => ({ ...p, kind: kinds[p.id] })),
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`page ${WIDTH}×${layout.height}, ${tiles.length} tiles, ${manifest.pieces.length} pieces`);
for (const [k, v] of Object.entries(layout.anchors)) console.log(k.padEnd(12), v ? `${Math.round(v.y)}…${Math.round(v.y + v.h)}` : "missing");
await browser.close();
