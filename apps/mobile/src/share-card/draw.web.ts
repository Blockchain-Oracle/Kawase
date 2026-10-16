// One frame of the share card on a 2D canvas (the web's preview, PNG and every MP4 frame; Senryo's drawFilm made
// Kawase's): the paper slip on the ground, who and when, the money line drawing itself with each move's coin popping on
// as the head passes, the figure counting with the line, the facts, the hanko pressed last, and the stub with its QR.
// Geometry is layout.ts; words are words.ts. Every text goes through `fit` into its own box: shrink to its minimum,
// then "…" — nothing is drawn where it could meet another label.
import * as QRCode from "qrcode";

import type { Fx } from "@/portfolio/format";

import type { CardImages } from "./art.web";
import { tokenKey } from "./art.web";
import { easeOut, FACT_W, FILM, filmAt, HERO_FIGURE_MAX_W, L, overshoot, partialLine, pillTop, STUB_LINE_MAX_W, TICK_W, type ChartGeometry } from "./layout";
import type { CardData, MarkerKind } from "./model";
import { figureAt, pillAt, toneOf, type CardWords } from "./words";

export type CardColors = {
  ground: string;
  paper: string;
  ink: string;
  muted: string;
  hairline: string;
  up: string;
  down: string;
  onUp: string;
  onDown: string;
  accent: string;
  onAccent: string;
  chip: string;
  chipInk: string;
  qrPaper: string;
  qrInk: string;
  raised: string;
};

export type CardScene = {
  card: CardData;
  words: CardWords;
  geometry: ChartGeometry;
  colors: CardColors;
  images: CardImages;
  fx: Fx;
  locale: string;
  rtl: boolean;
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const SANS = `Inter, "Noto Sans Arabic", "Noto Nastaliq Urdu", "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans SC", system-ui, sans-serif`;
const DISPLAY = `"Roboto Condensed", ${SANS}`;
const WEIGHT = { regular: 400, semibold: 600, bold: 700, black: 900 } as const;
const ELLIPSIS = "…";
const SHRINK_STEP = 2;
const TAU = Math.PI * 2;

const font = (weight: number, size: number, display = false) => `${weight} ${size}px ${display ? DISPLAY : SANS}`;

function widthOf(c: Ctx, text: string, css: string, tracking = 0): number {
  c.font = css;
  c.letterSpacing = `${tracking}px`;
  return c.measureText(text).width;
}

/** The text and the size it fits `maxW` at: shrunk step by step to `min`, then cut with an ellipsis. */
function fit(c: Ctx, text: string, weight: number, size: number, min: number, maxW: number, display = false, tracking = 0): { text: string; css: string; size: number } {
  for (let s = size; s >= min; s -= SHRINK_STEP) {
    const css = font(weight, s, display);
    if (widthOf(c, text, css, tracking) <= maxW) return { text, css, size: s };
  }
  const css = font(weight, min, display);
  let cut = text;
  while (cut.length > 1 && widthOf(c, `${cut}${ELLIPSIS}`, css, tracking) > maxW) cut = cut.slice(0, -1);
  return { text: `${cut}${ELLIPSIS}`, css, size: min };
}

/** Arabic-script letters (Arabic, Urdu): a string with them reads right to left; money, handles and Latin never do. */
const RTL_LETTERS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

function text(c: Ctx, value: string, x: number, base: number, css: string, color: string, align: CanvasTextAlign = "left", alpha = 1, tracking = 0) {
  c.save();
  c.direction = RTL_LETTERS.test(value) ? "rtl" : "ltr";
  c.globalAlpha *= alpha;
  c.font = css;
  c.letterSpacing = `${tracking}px`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "alphabetic";
  c.fillText(value, x, base);
  c.restore();
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
  c.restore();
}

function disc(c: Ctx, x: number, y: number, r: number, fill: string, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}

function rule(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width: number, dash: number[] = [], alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.setLineDash(dash);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.restore();
}

function image(c: Ctx, img: CanvasImageSource | null | undefined, x: number, y: number, w: number, h: number) {
  if (img) c.drawImage(img, x, y, w, h);
}

/** ▲ or ▼, drawn (never a font glyph). */
function triangle(c: Ctx, x: number, y: number, size: number, up: boolean, color: string, alpha = 1) {
  const h = size / 2;
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, up ? y - h : y + h);
  c.lineTo(x + h, up ? y + h : y - h);
  c.lineTo(x - h, up ? y + h : y - h);
  c.closePath();
  c.fill();
  c.restore();
}

/** The badge's glyph for what a move did: in ↓, out ↑, swap ⇄, bridge →, earn +, trade ↗. */
function glyph(c: Ctx, kind: MarkerKind, x: number, y: number, s: number, color: string) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = s * 0.16;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  const h = s * 0.32;
  const head = s * 0.18;
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.moveTo(x2 - head * Math.cos(a - 0.7), y2 - head * Math.sin(a - 0.7));
    c.lineTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(a + 0.7), y2 - head * Math.sin(a + 0.7));
  };
  if (kind === "in") arrow(x, y - h, x, y + h);
  else if (kind === "out") arrow(x, y + h, x, y - h);
  else if (kind === "bridge") arrow(x - h, y, x + h, y);
  else if (kind === "trade") arrow(x - h, y + h, x + h, y - h);
  else if (kind === "swap") {
    arrow(x - h, y - h * 0.45, x + h, y - h * 0.45);
    arrow(x + h, y + h * 0.45, x - h, y + h * 0.45);
  } else {
    c.moveTo(x - h, y);
    c.lineTo(x + h, y);
    c.moveTo(x, y - h);
    c.lineTo(x, y + h);
  }
  c.stroke();
  c.restore();
}

function toneColors(s: CardScene, change: number) {
  const tone = toneOf(change);
  return tone === "up"
    ? { line: s.colors.up, on: s.colors.onUp }
    : tone === "down"
      ? { line: s.colors.down, on: s.colors.onDown }
      : { line: s.colors.ink, on: s.colors.paper };
}

function drawPaper(c: Ctx, s: CardScene) {
  const p = L.paper;
  c.fillStyle = s.colors.ground;
  c.fillRect(0, 0, 1080, 1350);
  roundRect(c, p.x, p.y, p.w, p.h, p.r, s.colors.paper);
  // The perforation: a dashed rule between two notches cut in the ground's colour.
  const y = L.perf.y;
  rule(c, p.x + L.perf.notch + 12, y, p.x + p.w - L.perf.notch - 12, y, s.colors.hairline, 2, [L.perf.dash, L.perf.gap]);
  disc(c, p.x, y, L.perf.notch, s.colors.ground);
  disc(c, p.x + p.w, y, L.perf.notch, s.colors.ground);
}

function drawHeader(c: Ctx, s: CardScene) {
  const h = L.header;
  const a = h.avatar;
  if (s.images.avatar) {
    c.save();
    c.beginPath();
    c.arc(a.x + a.size / 2, a.y + a.size / 2, a.size / 2, 0, TAU);
    c.clip();
    image(c, s.images.avatar, a.x, a.y, a.size, a.size);
    c.restore();
  }
  // Right column first (the chip and the network), each capped, so the left column knows its room.
  const chipText = s.words.chip.toLocaleUpperCase(s.locale);
  const chipFit = fit(c, chipText, WEIGHT.semibold, h.chip.size, h.chip.size - 6, h.rightMax - h.chip.padX * 2, false, h.chip.track);
  const chipW = widthOf(c, chipFit.text, chipFit.css, h.chip.track) + h.chip.padX * 2;
  roundRect(c, L.right - chipW, h.chip.top, chipW, h.chip.h, h.chip.h / 2, s.colors.chip);
  text(c, chipFit.text, L.right - chipW / 2, h.chip.top + h.chip.h / 2 + chipFit.size * 0.36, chipFit.css, s.colors.chipInk, "center", 1, h.chip.track);
  const net = fit(c, s.words.network, WEIGHT.regular, h.network.size, h.network.min, h.rightMax);
  const netW = widthOf(c, net.text, net.css);
  text(c, net.text, L.right, h.network.base, net.css, s.colors.muted, "right");
  const handle = fit(c, s.words.handle, WEIGHT.semibold, h.handle.size, h.handle.min, L.right - chipW - h.gap - h.textX);
  text(c, handle.text, h.textX, h.handle.base, handle.css, s.colors.ink);
  const dates = fit(c, s.words.dates, WEIGHT.regular, h.date.size, h.date.min, L.right - netW - h.gap - h.textX);
  text(c, dates.text, h.textX, h.date.base, dates.css, s.colors.muted);
}

function drawMarkerFace(c: Ctx, s: CardScene, m: ChartGeometry["markers"][number], scale: number) {
  const r = L.marker.r * scale;
  if (r <= 0.5) return;
  // On a token's or a trade's card the moments are the person's own (FOMO's avatar dot): their avatar is the face.
  const front = m.token ? s.images.tokens.get(tokenKey(m.token)) : s.card.kind !== "period" ? s.images.avatar : null;
  const back = m.kind === "swap" && m.other ? s.images.tokens.get(tokenKey(m.other)) : null;
  if (back && front) {
    // A swap wears both coins, the one that went out behind and up, the one that came in over it (the feed's face).
    const cr = r * 0.78;
    const off = r * 0.34;
    disc(c, m.x - off, m.y - off, cr + L.marker.ring * scale, s.colors.paper);
    image(c, back, m.x - off - cr, m.y - off - cr, cr * 2, cr * 2);
    disc(c, m.x + off, m.y + off, cr + L.marker.ring * scale * 0.7, s.colors.paper);
    image(c, front, m.x + off - cr, m.y + off - cr, cr * 2, cr * 2);
  } else if (front) {
    disc(c, m.x, m.y, r + L.marker.ring * scale, s.colors.paper);
    image(c, front, m.x - r, m.y - r, r * 2, r * 2);
  } else {
    disc(c, m.x, m.y, r + L.marker.ring * scale, s.colors.paper);
    disc(c, m.x, m.y, r, s.colors.raised);
    glyph(c, m.kind, m.x, m.y, r * 1.3, s.colors.ink);
  }
  // What happened, in the badge at the trailing bottom.
  const badge = { in: [s.colors.up, s.colors.onUp], out: [s.colors.ink, s.colors.paper], swap: [s.colors.accent, s.colors.onAccent], bridge: [s.colors.ink, s.colors.paper], earn: [s.colors.up, s.colors.onUp], trade: [s.colors.accent, s.colors.onAccent] }[m.kind];
  const bx = m.x + r * 0.72;
  const by = m.y + r * 0.72;
  const br = L.marker.badge * scale;
  disc(c, bx, by, br + 3 * scale, s.colors.paper);
  disc(c, bx, by, br, badge[0]!);
  glyph(c, m.kind, bx, by, br * 1.25, badge[1]!);
  if (m.count > 1) {
    const label = `+${m.count - 1}`;
    const css = font(WEIGHT.bold, L.marker.count.size * scale);
    const w = widthOf(c, label, css) + L.marker.count.padX * 2 * scale;
    const ch = L.marker.count.h * scale;
    const cx = m.x + r * 0.5;
    const cy = m.y - r - ch * 0.15;
    roundRect(c, cx - 2 * scale, cy - 2 * scale, w + 4 * scale, ch + 4 * scale, (ch + 4 * scale) / 2, s.colors.paper);
    roundRect(c, cx, cy, w, ch, ch / 2, s.colors.ink);
    text(c, label, cx + w / 2, cy + ch / 2 + L.marker.count.size * scale * 0.36, css, s.colors.paper, "center");
  }
}

function drawChart(c: Ctx, s: CardScene, ms: number) {
  const { card, geometry: g } = s;
  const film = filmAt(ms);
  const p = L.plot;
  for (let x = p.x; x <= p.x + p.w; x += L.grid.step) {
    for (let y = p.y; y <= p.y + p.h; y += L.grid.step) disc(c, x, y, L.grid.dot, s.colors.ink, L.grid.alpha);
  }
  rule(c, p.x, g.levelY, p.x + p.w, g.levelY, s.colors.muted, L.level.width, [L.level.dash, L.level.dash], L.level.alpha);
  const { points, head, t } = partialLine(g, card.from, card.to, film.draw);
  const value = g.valueAt(t);
  const tone = toneColors(s, card.kind === "period" ? value - card.start : card.change);
  if (points.length > 1 && film.draw > 0) {
    const first = points[0]!;
    c.save();
    c.beginPath();
    c.moveTo(first.x, first.y);
    for (const q of points.slice(1)) c.lineTo(q.x, q.y);
    c.lineTo(head.x, p.y + p.h);
    c.lineTo(first.x, p.y + p.h);
    c.closePath();
    const fill = c.createLinearGradient(0, p.y, 0, p.y + p.h);
    fill.addColorStop(0, tone.line);
    fill.addColorStop(1, s.colors.paper);
    c.globalAlpha = L.line.fillAlpha;
    c.fillStyle = fill;
    c.fill();
    c.restore();
    c.save();
    c.beginPath();
    c.moveTo(first.x, first.y);
    for (const q of points.slice(1)) c.lineTo(q.x, q.y);
    c.strokeStyle = tone.line;
    c.lineWidth = L.line.width;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke();
    c.restore();
  }
  // Each move's coin pops on as the head passes it.
  const span = Math.max(1, card.to - card.from);
  let headCovered = false;
  for (const m of g.markers) {
    const passedAt = FILM.drawFrom + ((m.t - card.from) / span) * (FILM.drawTo - FILM.drawFrom);
    if (ms < passedAt) continue;
    drawMarkerFace(c, s, m, overshoot((ms - passedAt) / FILM.popMs));
    if (Math.hypot(m.x - head.x, m.y - head.y) < L.marker.r) headCovered = true;
  }
  if (film.draw > 0) {
    const top = pillTop(head.y);
    const pill = fit(c, pillAt(value, card.unit, s.fx, s.locale), WEIGHT.bold, L.pill.size, L.pill.min, L.pill.maxW - L.pill.padX * 2);
    const pillW = widthOf(c, pill.text, pill.css) + L.pill.padX * 2;
    const pillX = L.pill.right - pillW;
    rule(c, head.x + L.head.r, head.y, pillX - 6, top + L.pill.h / 2, tone.line, L.level.width, [L.level.dash / 2, L.level.dash / 2], 0.55);
    if (!headCovered) {
      disc(c, head.x, head.y, L.head.halo, tone.line, L.head.haloAlpha);
      disc(c, head.x, head.y, L.head.r, tone.line);
    }
    roundRect(c, pillX, top, pillW, L.pill.h, L.pill.r, tone.line);
    text(c, pill.text, pillX + pillW / 2, top + L.pill.h / 2 + pill.size * 0.36, pill.css, tone.on, "center");
  }
  const [a, b, z] = s.words.ticks;
  const tick = (value: string, x: number, align: CanvasTextAlign) => {
    const f = fit(c, value, WEIGHT.regular, L.ticks.size, L.ticks.min, TICK_W);
    text(c, f.text, x, L.ticks.base, f.css, s.colors.muted, align);
  };
  tick(a, p.x, "left");
  tick(b, p.x + p.w / 2, "center");
  tick(z, p.x + p.w, "right");
}

function drawHero(c: Ctx, s: CardScene, ms: number) {
  const { card, geometry: g, words } = s;
  const film = filmAt(ms);
  const hero = L.hero;
  const label = words.label.toLocaleUpperCase(s.locale);
  const lf = fit(c, label, WEIGHT.semibold, hero.label.size, hero.label.size - 6, HERO_FIGURE_MAX_W, false, hero.label.track);
  text(c, lf.text, L.left, hero.label.base, lf.css, s.colors.muted, "left", 1, hero.label.track);
  // The figure counts with the line, then lands exactly on the card's own figure.
  const t = card.from + (card.to - card.from) * film.draw;
  // A balance counts with its line; a trade's result rises to its figure as the price line draws.
  const moving = film.draw >= 1 ? card.change : card.kind === "period" ? g.valueAt(t) - card.start : card.change * easeOut(film.draw);
  const shown = film.draw >= 1 ? words.figure : figureAt(moving, s.fx, s.locale);
  const tone = toneColors(s, moving);
  const ff = fit(c, shown, WEIGHT.black, hero.figure.size, hero.figure.min, HERO_FIGURE_MAX_W, true);
  // The final figure's size holds through the film, so the number never jumps size as it counts.
  const finalFit = fit(c, words.figure, WEIGHT.black, hero.figure.size, hero.figure.min, HERO_FIGURE_MAX_W, true);
  const css = ff.size < finalFit.size ? ff.css : finalFit.css;
  text(c, ff.text, L.left, hero.figure.base, css, tone.line);
  if (film.pct > 0) {
    let x = L.left;
    const alpha = film.pct;
    if (words.pct && words.pctUp !== null) {
      const color = words.pctUp ? s.colors.up : s.colors.down;
      triangle(c, x + hero.pct.tri / 2, hero.pct.base - hero.pct.size * 0.34, hero.pct.tri, words.pctUp, color, alpha);
      x += hero.pct.tri + hero.pct.gap;
      const pf = fit(c, words.pct, WEIGHT.semibold, hero.pct.size, hero.pct.min, HERO_FIGURE_MAX_W / 2);
      text(c, pf.text, x, hero.pct.base, pf.css, color, "left", alpha);
      x += widthOf(c, pf.text, pf.css) + hero.pct.gap * 2;
    }
    if (words.fromStart) {
      const rest = HERO_FIGURE_MAX_W - (x - L.left);
      if (rest > 80) {
        const sf = fit(c, words.fromStart, WEIGHT.regular, hero.pct.size - 4, hero.pct.min, rest);
        text(c, sf.text, x, hero.pct.base, sf.css, s.colors.muted, "left", alpha);
      }
    }
  }
  if (film.hanko > 0 && s.images.hanko) {
    const k = L.hanko;
    const scale = film.hanko >= 1 ? 1 : 1.35 - 0.35 * overshoot(film.hanko);
    c.save();
    c.globalAlpha = Math.min(1, film.hanko * 2.2);
    c.translate(k.x + k.size / 2, k.y + k.size / 2);
    c.rotate((k.tilt * Math.PI) / 180);
    c.scale(scale, scale);
    image(c, s.images.hanko, -k.size / 2, -k.size / 2, k.size, k.size);
    c.restore();
  }
}

function drawFacts(c: Ctx, s: CardScene, ms: number) {
  const f = L.facts;
  const film = filmAt(ms);
  rule(c, L.left, f.rule, L.right, f.rule, s.colors.hairline, 2);
  s.words.facts.forEach((fact, i) => {
    const x0 = L.left + i * FACT_W;
    if (i > 0) rule(c, x0, f.top + 6, x0, f.bottom - 6, s.colors.hairline, 2);
    const inner = x0 + (i > 0 ? f.padX : 0);
    const maxW = FACT_W - f.padX * (i > 0 ? 2 : 1);
    const lf = fit(c, fact.label, WEIGHT.regular, f.label.size, f.label.min, maxW);
    text(c, lf.text, inner, f.label.base, lf.css, s.colors.muted);
    // Values fade up in place once the line has landed (they are totals, not running sums).
    const vf = fit(c, fact.value, WEIGHT.semibold, f.value.size, f.value.min, maxW);
    c.save();
    c.globalAlpha = film.facts;
    c.translate(0, (1 - film.facts) * 14);
    text(c, vf.text, inner, f.value.base, vf.css, s.colors.ink);
    c.restore();
  });
}

let qrCache: { value: string; modules: boolean[][] } | null = null;
function qrModules(value: string): boolean[][] {
  if (qrCache?.value === value) return qrCache.modules;
  const code = QRCode.create(value, { errorCorrectionLevel: "H" });
  const n = code.modules.size;
  const modules: boolean[][] = [];
  for (let y = 0; y < n; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x += 1) row.push(Boolean(code.modules.get(y, x)));
    modules.push(row);
  }
  qrCache = { value, modules };
  return modules;
}

/** The stub's QR, the same dotted code as the receipt's (round finders, dots that just touch, the mark in the middle). */
function drawQr(c: Ctx, s: CardScene, value: string) {
  const q = L.stub.qr;
  roundRect(c, q.x, q.y, q.size, q.size, q.r, s.colors.qrPaper);
  const inner = q.size - q.pad * 2;
  const modules = qrModules(value);
  const n = modules.length;
  const cell = inner / n;
  const x0 = q.x + q.pad;
  const y0 = q.y + q.pad;
  const finder = 7;
  const centerSpan = Math.ceil(n * 0.22);
  const centerStart = Math.floor((n - centerSpan) / 2);
  const inFinder = (x: number, y: number) => (x < finder && y < finder) || (x >= n - finder && y < finder) || (x < finder && y >= n - finder);
  const inCenter = (x: number, y: number) => x >= centerStart && x < centerStart + centerSpan && y >= centerStart && y < centerStart + centerSpan;
  c.fillStyle = s.colors.qrInk;
  modules.forEach((row, y) =>
    row.forEach((on, x) => {
      if (!on || inFinder(x, y) || inCenter(x, y)) return;
      c.beginPath();
      c.arc(x0 + x * cell + cell / 2, y0 + y * cell + cell / 2, cell / 2, 0, TAU);
      c.fill();
    }),
  );
  for (const [fx, fy] of [
    [0, 0],
    [n - finder, 0],
    [0, n - finder],
  ] as const) {
    const fxp = x0 + fx * cell;
    const fyp = y0 + fy * cell;
    const size = finder * cell;
    c.save();
    c.strokeStyle = s.colors.qrInk;
    c.lineWidth = cell;
    c.beginPath();
    c.roundRect(fxp + cell / 2, fyp + cell / 2, size - cell, size - cell, size * 0.3);
    c.stroke();
    c.restore();
    roundRect(c, fxp + cell * 2, fyp + cell * 2, size - cell * 4, size - cell * 4, size * 0.15, s.colors.qrInk);
  }
  const mark = centerSpan * cell * 0.9;
  image(c, s.images.mark, q.x + q.size / 2 - mark / 2, q.y + q.size / 2 - mark / 2, mark, mark);
}

function drawStub(c: Ctx, s: CardScene, qrValue: string) {
  const st = L.stub;
  image(c, s.images.mark, st.mark.x, st.mark.y, st.mark.size, st.mark.size);
  text(c, s.words.word, st.word.x, st.word.base, font(WEIGHT.black, st.word.size, true), s.colors.ink);
  const lf = fit(c, s.words.stubLine, WEIGHT.regular, st.line.size, st.line.min, STUB_LINE_MAX_W);
  text(c, lf.text, st.line.x, st.line.base, lf.css, s.colors.muted);
  drawQr(c, s, qrValue);
}

/** Draws the card at `ms` into the film (FINAL_MS for the still). */
export function drawCard(c: Ctx, s: CardScene, ms: number, qrValue: string) {
  c.save();
  drawPaper(c, s);
  drawHeader(c, s);
  drawChart(c, s, ms);
  drawHero(c, s, ms);
  drawFacts(c, s, ms);
  drawStub(c, s, qrValue);
  c.restore();
}

/** Every face the card writes in, loaded before the first frame (web fonts load per weight and script on demand). */
export async function loadCardFonts(words: CardWords): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = [words.handle, words.dates, words.chip, words.network, words.label, words.figure, words.stubLine, ...words.facts.flatMap((f) => [f.label, f.value]), ...words.ticks].join(" ");
  await Promise.all([
    document.fonts.load(font(WEIGHT.regular, 30), sample),
    document.fonts.load(font(WEIGHT.semibold, 30), sample),
    document.fonts.load(font(WEIGHT.bold, 30), sample),
    document.fonts.load(font(WEIGHT.black, 60, true), `${words.figure} Kawase`),
  ]).catch(() => undefined);
}
