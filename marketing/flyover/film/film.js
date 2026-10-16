// The Kawase fly-over: one WebGL2 camera over the captured landing (../capture). Every frame is computed from time in
// seek(t): no timers, no CSS transitions. The page is a textured quad on the floor and each lifted piece its own quad at
// its height, drawn lowest first with no depth buffer; the scene goes to a colour + depth target, a per-pixel depth of
// field pass gathers 40 golden-angle taps from a mip level matched to the blur, and 16 subframes across 0.7 of a frame
// are averaged for motion blur. The end card's words are DOM, set from t.
//
// URL: ?w=1440&h=1152&fps=60&sub=16  (&t=5 renders one frame on load, for looking)
const Q = new URLSearchParams(location.search);
const W = Number(Q.get("w") ?? 1440);
const H = Number(Q.get("h") ?? 1152);
const FPS = Number(Q.get("fps") ?? 60);
const SUB = Number(Q.get("sub") ?? 16);
const SHUTTER = 0.7;
const DUR = 14.5;

// The master frame is 1440 × 1152 at a focal length of 1880 px; other frames contain it (same camera, reframed).
const SCALE = Math.min(W / 1440, H / 1152);
const FOCAL = 1880 * SCALE;
const PAGE_W = 1440;
const HERO_BOTTOM = 898;
const DEG = Math.PI / 180;

// ── Small maths ────────────────────────────────────────────────────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => ((k = clamp(k)), k * k * (3 - 2 * k));
const smoother = (k) => ((k = clamp(k)), k * k * k * (k * (k * 6 - 15) + 10));
const win = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - (1 - clamp(k)) ** 2;
const easeInOutQuad = (k) => ((k = clamp(k)), k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2);
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Monotone-ish cubic through keyed values (Catmull-Rom tangents, clamped at the ends): smooth paths without stops.
function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0].slice(1);
    const n = keys.length;
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 0;
    while (keys[i + 1][0] < t) i++;
    const [t0, ...p0] = keys[i];
    const [t1, ...p1] = keys[i + 1];
    const prev = keys[i - 1] ?? keys[i];
    const next = keys[i + 2] ?? keys[i + 1];
    const h = t1 - t0;
    const k = (t - t0) / h;
    const k2 = k * k;
    const k3 = k2 * k;
    return p0.map((a, j) => {
      const b = p1[j];
      const m0 = prev === keys[i] ? 0 : ((b - prev[j + 1]) / (t1 - prev[0])) * h;
      const m1 = next === keys[i + 1] ? 0 : ((next[j + 1] - a) / (next[0] - t0)) * h;
      return (2 * k3 - 3 * k2 + 1) * a + (k3 - 2 * k2 + k) * m0 + (-2 * k3 + 3 * k2) * b + (k3 - k2) * m1;
    });
  };
}

// ── The capture ────────────────────────────────────────────────────────────────────────────────────────────────────
const manifest = await (await fetch("../capture/manifest.json")).json();
const PAGE_H = manifest.height;
const anchor = (name) => manifest.anchors[name].y + manifest.anchors[name].h / 2;

// ── Speed down the page, as a share of cruise, integrated into the page position ────────────────────────────────────
function share(t) {
  if (t < 0.6) return 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * (t / 0.6)));
  if (t < 1.25) return 0.5;
  if (t < 1.6) return 0.5 + 0.5 * smooth(win(t, 1.25, 1.6));
  if (t < 7.3) return 1;
  return lerp(1, 0.12, smooth(win(t, 7.3, 8.3)));
}
// The rise's zoom speed: a smooth trapezoid (up 7.75–8.35, even to 8.95, down to a stop at 9.25).
const riseSpeed = (t) => smooth(win(t, 7.75, 8.35)) * (1 - smooth(win(t, 8.95, 9.25)));

const DT = 1 / 3000;
const STEPS = Math.ceil(DUR / DT) + 2;
const S_TAB = new Float64Array(STEPS);
const R_TAB = new Float64Array(STEPS);
for (let i = 1; i < STEPS; i++) {
  const tm = (i - 0.5) * DT;
  S_TAB[i] = S_TAB[i - 1] + share(tm) * DT;
  R_TAB[i] = R_TAB[i - 1] + riseSpeed(tm) * DT;
}
const table = (tab, t) => {
  const x = clamp(t, 0, DUR) / DT;
  const i = Math.min(STEPS - 2, Math.floor(x));
  return lerp(tab[i], tab[i + 1], x - i);
};
const S = (t) => table(S_TAB, t);
const R_END = table(R_TAB, 9.25);
const rise = (t) => table(R_TAB, t) / R_END;

// Calibrated to this page: the opening centred just above the hero's buttons (Kawase's hero is two columns, 1200 px
// wide, so the camera starts a little higher and farther than the reference's 1360 to hold the copy and the devices),
// and "Kawase, in your pocket." crossing the centre at 8.0 s.
const Y0 = 600;
const CRUISE = (anchor("getTitle") - Y0) / S(8.0);
const glideY = (t) => Y0 + CRUISE * S(t);
function tCross(y) {
  let a = 0;
  let b = 8.3;
  if (glideY(b) < y) return b;
  for (let i = 0; i < 50; i++) {
    const m = (a + b) / 2;
    if (glideY(m) < y) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

// ── The camera: look-at point (lx, ly on the page), distance, tilt off straight-down ───────────────────────────────
const LX_FLIGHT = 690; // a little left of centre, so the headline's first letter is in frame; centred during the rise
const D_STRIP = (PAGE_H * FOCAL) / (H - 2 * 42 * SCALE);
const BOTTOM_LINE = H - 42 * SCALE;

// The end card's frame, per format: card width and top, and the type above it.
const LAYOUT = (() => {
  if (W === 1080 && H === 1350) return { cardW: 929, badgeTop: 271, text: 0.95 };
  if (W === 1920 && H === 1080) return { cardW: 954, badgeTop: 41, text: 0.9375 };
  return { cardW: 1018 * SCALE, badgeTop: 44 * SCALE, text: SCALE };
})();
LAYOUT.cardTop = LAYOUT.badgeTop + 239 * LAYOUT.text;
LAYOUT.cardH = (LAYOUT.cardW * HERO_BOTTOM) / PAGE_W;
const D_CARD = (FOCAL * PAGE_W) / LAYOUT.cardW;

const dFlight = (t) => 1600 + 300 * easeOut(t / 8.2);
const tilt = (t) => 56 * DEG * (1 - smoother(win(t, 8.15, 8.95)));

function lnDistance(t) {
  if (t < 9.25) return Math.log(dFlight(t)) + rise(t) * Math.log(D_STRIP / dFlight(9.25));
  const creep = Math.log(1 / 0.965) * smooth(win(t, 9.25, 9.47));
  if (t < 9.97) return Math.log(D_STRIP) - creep - Math.log((D_STRIP * 0.965) / D_CARD) * easeInOutQuad(win(t, 9.47, 9.97));
  // The card holds, creeping 2 % closer: starts from rest, then an even creep to the end.
  const k = win(t, 9.97, DUR);
  const a = 0.12;
  const c = k < a ? (k * k) / (2 * a) : k - a / 2;
  return Math.log(D_CARD) - Math.log(1.02) * (c / (1 - a / 2));
}

// The look-at y that holds the page's bottom edge on the 42 px line (at this tilt and distance).
function lyBottom(th, d) {
  const k = BOTTOM_LINE - H / 2;
  const delta = (k * d) / (FOCAL * Math.cos(th) + k * Math.sin(th));
  return PAGE_H - delta;
}
// The page's top edge on screen during the dive: pinned where the strip left it, then dropping to the card's top.
const TOP_PINNED = H / 2 - ((PAGE_H / 2) * FOCAL) / (D_STRIP * 0.965);
const topEdge = (t) => lerp(TOP_PINNED, LAYOUT.cardTop, smoother(win(t, 9.72, 9.96)));

function camera(t) {
  const d = Math.exp(lnDistance(t));
  const th = tilt(t);
  const hand = smoother(win(t, 8.3, 8.65));
  const lx = lerp(LX_FLIGHT, PAGE_W / 2, hand);
  let ly;
  if (t < 9.25) ly = lerp(glideY(t), lyBottom(th, d), hand);
  else if (t < 9.47) ly = PAGE_H / 2;
  else if (t < 9.97) ly = lerp(PAGE_H / 2, ((H / 2 - topEdge(t)) * d) / FOCAL, smoother(win(t, 9.47, 9.6)));
  else ly = HERO_BOTTOM / 2 - (LAYOUT.cardTop + LAYOUT.cardH / 2 - H / 2) * (d / FOCAL);
  // Basis: forward looks up the page and down; screen-up points up the page; screen-right is +x. No yaw, no roll.
  const s = Math.sin(th);
  const c = Math.cos(th);
  const X = lx - PAGE_W / 2;
  return { d, th, lx, ly, pos: [X, ly + d * s, d * c], f: [0, -s, -c], u: [0, -c, s] };
}

function project(cam, p) {
  const v = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const zc = v[1] * cam.f[1] + v[2] * cam.f[2];
  const yc = v[1] * cam.u[1] + v[2] * cam.u[2];
  return { x: W / 2 + (FOCAL * v[0]) / zc, y: H / 2 - (FOCAL * yc) / zc, z: zc };
}
// A world point at a screen position and depth, for the camera at time t.
function unproject(cam, sx, sy, depth) {
  const xs = ((sx - W / 2) * depth) / FOCAL;
  const ys = ((H / 2 - sy) * depth) / FOCAL;
  return [cam.pos[0] + xs, cam.pos[1] + ys * cam.u[1] + depth * cam.f[1], cam.pos[2] + ys * cam.u[2] + depth * cam.f[2]];
}

// ── The pieces' motion ─────────────────────────────────────────────────────────────────────────────────────────────
// Heights are of the piece's middle line; `stand` turns it about that line, top edge rising toward the lens.
const FLY_UP = new Set(["venue-1", "venue-16"]); // the two chips that fly up to ~200 px and pass the frame's edges
function motionFor(piece, index) {
  const cy = piece.inner.y + piece.inner.h / 2;
  const tc = tCross(cy);
  const id = piece.id;
  const r = hash(index + 1);
  const m = (z0, z1, stand, a, b, stand0 = 0) => ({ z0, z1, stand0, stand: stand * DEG, a, b });
  if (id === "hero-live") return m(4, 50, 26, 0.1, 1.2);
  if (id.startsWith("hero-chip-")) {
    const i = Number(id.slice(-1));
    return m(4, 36 + 3 * i, 26, 0.1 + 0.06 * i, 1.35);
  }
  if (id === "hero-open") return m(4, 38, 16, 0.12, 1.3);
  if (id === "hero-phone") return m(4, 30, 14, 0.18, 1.3);
  if (id === "hero-window") return m(16, 30, 6, 0.1, 1.35);
  if (id === "hero-phone-a") return m(40, 66, 12, 0.1, 1.35, 4);
  if (id === "hero-phone-b") return m(64, 100, 16, 0.1, 1.35, 6);
  if (id.startsWith("tape-")) return m(3, 22, 22, tc - 0.9, tc - 0.1);
  if (FLY_UP.has(id)) return m(4, 205, 54, tc - 1.0, tc + 0.25);
  if (id.startsWith("venue-")) return m(4, 22 + 26 * r, 30, tc - 1.0, tc - 0.15);
  if (id === "kawase-mark") return m(6, 74, 40, tc - 1.1, tc + 0.1);
  if (piece.kind === "card" && id.startsWith("area-")) return m(12, 18, 0, tc - 0.8, tc);
  if (id === "tour-phone") return m(30, 118, 40, tc - 1.0, tc + 0.15);
  if (id.startsWith("safety-icon-")) return m(4, 26, 24, tc - 0.9, tc - 0.1);
  if (id === "budget") return m(22, 112, 30, tc - 0.75, tc + 0.1);
  if (id.startsWith("proof-")) return m(12, 18, 0, tc - 0.8, tc);
  if (id.startsWith("badge-")) return m(4, 40 + 8 * r, 30, tc - 0.9, tc);
  if (id === "get-qr") return m(10, 44, 26, tc - 0.9, tc);
  if (id === "get-phone-a") return m(30, 110, 36, tc - 1.0, tc + 0.2);
  if (id === "get-phone-b") return m(30, 140, 36, tc - 1.0, tc + 0.2);
  return m(6, 6, 0, 0, 1);
}

// Everything below the hero fades into the floor during the dive, then is cut.
const belowFade = (t) => smooth(win(t, 9.47, 9.74));
const maskBottom = (t) => lerp(PAGE_H, HERO_BOTTOM, smoother(win(t, 9.47, 9.86)));
const maskRadius = (t) => lerp(24, (38 / 1018) * PAGE_W, smoother(win(t, 9.47, 9.86)));

// ── WebGL ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const canvas = document.getElementById("film");
canvas.width = W;
canvas.height = H;
document.getElementById("stage").style.cssText = `width:${W}px;height:${H}px`;
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
if (!gl) throw new Error("WebGL2 unavailable");
if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float unavailable");
const ANISO = gl.getExtension("EXT_texture_filter_anisotropic");
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
window.filmGpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

const COMMON = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform vec2 uRes;
vec3 floorColour(vec2 fc) {
  vec2 p = (fc / uRes - 0.5) * 2.0;
  float r = clamp(length(p) / 1.41421, 0.0, 1.0);
  return mix(vec3(0.9765, 0.9843, 0.9843), vec3(0.9490, 0.9529, 0.9647), smoothstep(0.05, 1.0, r));
}
float sdRound(vec2 p, vec2 b0, vec2 b1, float r) {
  vec2 c = (b0 + b1) * 0.5;
  vec2 h = (b1 - b0) * 0.5;
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

const VS_WORLD = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aUV; in vec2 aAux;
uniform vec3 uCam; uniform vec3 uU; uniform vec3 uF; uniform float uFocal; uniform vec2 uRes; uniform vec2 uJitter;
out vec2 vUV; out vec2 vAux; out float vDepth;
void main() {
  vec3 v = aPos - uCam;
  float xc = v.x;
  float yc = dot(v, uU);
  float zc = dot(v, uF);
  vUV = aUV; vAux = aAux; vDepth = zc;
  const float n = 1.0, f = 1.0e6;
  gl_Position = vec4(xc * uFocal / (uRes.x * 0.5) + uJitter.x * 2.0 / uRes.x * zc,
                     yc * uFocal / (uRes.y * 0.5) + uJitter.y * 2.0 / uRes.y * zc,
                     zc * (f + n) / (f - n) - 2.0 * f * n / (f - n), zc);
}`;

const VS_SCREEN = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const OUT2 = `layout(location = 0) out vec4 oColour; layout(location = 1) out vec4 oDepth;`;

const FS_FLOOR = `${COMMON}${OUT2}
uniform vec3 uCam; uniform vec3 uU; uniform vec3 uF; uniform float uFocal;
void main() {
  vec2 s = gl_FragCoord.xy - uRes * 0.5;
  vec3 dir = vec3(s.x, 0.0, 0.0) + s.y * uU + uFocal * uF;
  float depth = dir.z < -1e-4 ? (-uCam.z / dir.z) * uFocal : 1.0e5;
  oColour = vec4(floorColour(gl_FragCoord.xy), 1.0);
  oDepth = vec4(depth, 0.0, 0.0, 1.0);
}`;

// The page's soft wide shadow on the floor, from the (morphing) page rectangle.
const FS_PAGE_SHADOW = `${COMMON}${OUT2}
in vec2 vAux; in float vDepth;
uniform vec4 uMask; uniform float uRadius; uniform float uSigma; uniform float uOpacity;
void main() {
  float sd = sdRound(vAux - vec2(0.0, uSigma * 0.45), uMask.xy, uMask.zw, uRadius);
  float a = uOpacity * (1.0 - smoothstep(-uSigma * 0.5, uSigma * 2.4, sd));
  float contact = 0.10 * uOpacity / 0.11 * (1.0 - smoothstep(-1.0, uSigma * 0.18, sdRound(vAux, uMask.xy, uMask.zw, uRadius)));
  a = max(a, contact);
  oColour = vec4(vec3(0.102, 0.129, 0.2) * a, a);
  oDepth = vec4(vDepth * a, 0.0, 0.0, a);
}`;

const FS_PAGE = `${COMMON}${OUT2}
in vec2 vUV; in vec2 vAux; in float vDepth;
uniform sampler2D uTex; uniform vec4 uMask; uniform float uRadius; uniform float uFade; uniform float uFadeY;
void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float sd = sdRound(vAux, uMask.xy, uMask.zw, uRadius);
  float aa = max(fwidth(vAux.x), fwidth(vAux.y)) * 0.8 + 1e-3;
  float a = 1.0 - smoothstep(-aa, aa, sd);
  float fade = uFade * smoothstep(uFadeY, uFadeY + 60.0, vAux.y);
  c = mix(c, floorColour(gl_FragCoord.xy), fade);
  oColour = vec4(c * a, a);
  oDepth = vec4(vDepth * a, 0.0, 0.0, a);
}`;

// A piece's (or tile's) shadow: the same picture in flat #1a2133, blurred by golden taps from a matched mip level.
const FS_SHADOW = `${COMMON}${OUT2}
in vec2 vUV; in float vDepth;
uniform sampler2D uTex; uniform vec2 uBlur; uniform float uLod; uniform float uOpacity;
float alphaAt(vec2 p) { return (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? 0.0 : textureLod(uTex, p, uLod).a; }
void main() {
  float s = 0.0;
  for (int i = 0; i < 20; i++) {
    float r = sqrt((float(i) + 0.5) / 20.0);
    float an = float(i) * 2.39996323;
    s += alphaAt(vUV + vec2(cos(an), sin(an)) * r * uBlur);
  }
  float a = s / 20.0 * uOpacity;
  oColour = vec4(vec3(0.102, 0.129, 0.2) * a, a);
  oDepth = vec4(vDepth * a, 0.0, 0.0, a);
}`;

// A lifted piece or a logo tile. Tiles near the lens arrive pre-blurred (uBlur) with their depth set to the focus.
const FS_PIECE = `${COMMON}${OUT2}
in vec2 vUV; in float vDepth;
uniform sampler2D uTex; uniform float uFade; uniform float uAlpha; uniform vec2 uBlur; uniform float uLod; uniform float uDepthSet;
vec4 at(vec2 p, float lod) { return (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? vec4(0.0) : textureLod(uTex, p, lod); }
void main() {
  vec4 c;
  if (uBlur.x > 0.0) {
    c = vec4(0.0);
    for (int i = 0; i < 32; i++) {
      float r = sqrt((float(i) + 0.5) / 32.0);
      float an = float(i) * 2.39996323;
      c += at(vUV + vec2(cos(an), sin(an)) * r * uBlur, uLod);
    }
    c /= 32.0;
  } else {
    c = texture(uTex, vUV);
  }
  c.rgb = mix(c.rgb, floorColour(gl_FragCoord.xy) * c.a, uFade);
  c *= uAlpha;
  float depth = uDepthSet > 0.0 ? uDepthSet : vDepth;
  oColour = c;
  oDepth = vec4(depth * c.a, 0.0, 0.0, c.a);
}`;

// The testimonial card's white edge.
const FS_SOLID = `${COMMON}${OUT2}
in vec2 vUV; in float vDepth;
uniform vec3 uColour; uniform float uAlpha;
void main() {
  vec3 c = mix(uColour, uColour * 0.93, vUV.y);
  float edge = smoothstep(0.0, 0.03, vUV.x) * smoothstep(0.0, 0.03, 1.0 - vUV.x);
  float a = uAlpha * edge;
  oColour = vec4(c * a, a);
  oDepth = vec4(vDepth * a, 0.0, 0.0, a);
}`;

// Depth of field per pixel: radius 75·(focus−z)/z in front of the focus, 6·(z−focus)/z behind, capped; 40 taps on a
// golden-angle disc, each read from the mip level matched to the tap spacing; nearer samples spread over farther ones.
const FS_DOF = `${COMMON}
uniform sampler2D uCol; uniform sampler2D uDep;
uniform float uFocus; uniform float uKF; uniform float uKB; uniform float uCap; uniform float uWeight;
out vec4 oAcc;
float depthAt(vec2 uv) { vec4 d = textureLod(uDep, uv, 0.0); return d.r / max(d.a, 1e-4); }
float coc(float z) { return z < uFocus ? min(uCap, uKF * (uFocus - z) / max(z, 1.0)) : min(uCap, uKB * (z - uFocus) / z); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float dC = depthAt(uv);
  float cC = coc(dC);
  vec3 c0 = textureLod(uCol, uv, 0.0).rgb;
  if (cC < 0.5) { oAcc = vec4(c0 * uWeight, uWeight); return; }
  float lod = log2(max(1.0, cC * 0.28));
  vec3 sum = c0;
  float ws = 1.0;
  for (int i = 0; i < 40; i++) {
    float rr = sqrt((float(i) + 0.5) / 40.0) * cC;
    float an = float(i) * 2.39996323;
    vec2 p = uv + vec2(cos(an), sin(an)) * rr / uRes;
    vec3 c = textureLod(uCol, p, lod).rgb;
    float d = depthAt(p);
    float cs = coc(d);
    if (d > dC) cs = min(cs, cC);
    float w = smoothstep(rr - 1.5, rr + 0.5, cs);
    sum += c * w;
    ws += w;
  }
  oAcc = vec4(sum / ws * uWeight, uWeight);
}`;

const FS_OUT = `${COMMON}
uniform sampler2D uAcc; uniform float uSeed;
out vec4 o;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
void main() {
  vec4 a = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0);
  vec3 c = a.rgb / max(a.a, 1e-4);
  c += (h(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src);
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.bindAttribLocation(p, 1, "aUV");
  gl.bindAttribLocation(p, 2, "aAux");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const loc = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}
const P = {
  floor: program(VS_SCREEN, FS_FLOOR),
  pageShadow: program(VS_WORLD, FS_PAGE_SHADOW),
  page: program(VS_WORLD, FS_PAGE),
  shadow: program(VS_WORLD, FS_SHADOW),
  piece: program(VS_WORLD, FS_PIECE),
  solid: program(VS_WORLD, FS_SOLID),
  dof: program(VS_SCREEN, FS_DOF),
  out: program(VS_SCREEN, FS_OUT),
};

// One dynamic quad buffer (4 vertices × pos3 uv2 aux2) and a full-screen triangle.
const quadBuf = gl.createBuffer();
const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, 4 * 7 * 4, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
gl.enableVertexAttribArray(2);
gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 28, 20);
const screenVao = gl.createVertexArray();
gl.bindVertexArray(screenVao);
const screenBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, screenBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const quadData = new Float32Array(28);

// Corners in order TL, TR, BL, BR (a triangle strip).
function drawQuad(corners, uvs, aux) {
  for (let i = 0; i < 4; i++) {
    quadData.set(corners[i], i * 7);
    quadData.set(uvs[i], i * 7 + 3);
    quadData.set(aux ? aux[i] : [0, 0], i * 7 + 5);
  }
  gl.bindVertexArray(quadVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, quadData);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
const UV = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

function texture(source, w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (ANISO) gl.texParameterf(gl.TEXTURE_2D, ANISO.TEXTURE_MAX_ANISOTROPY_EXT, 16);
  gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
async function load(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: "premultiply", colorSpaceConversion: "none" });
  const t = texture(bmp, bmp.width, bmp.height);
  const size = [bmp.width, bmp.height];
  bmp.close();
  return { t, size };
}

// Render targets: the scene (colour with mips + depth), the motion-blur accumulator.
function target(format, w, h, mips) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, format, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
const sceneCol = target(gl.RGBA8, W, H, true);
const sceneDep = target(gl.RGBA16F, W, H, false);
const accum = target(gl.RGBA16F, W, H, false);
const sceneFbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneCol, 0);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, sceneDep, 0);
gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
const accFbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, accFbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accum, 0);
if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("accumulator incomplete");

// ── Assets ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const tiles = await Promise.all(manifest.tiles.map(async (tile) => ({ ...tile, tex: (await load(`../capture/${tile.file}`)).t })));
const pieces = await Promise.all(
  manifest.pieces.map(async (piece, i) => ({ ...piece, tex: (await load(`../capture/${piece.file}`)).t, motion: motionFor(piece, i) })),
);

// The 為替 mark as logo tiles in four colourways: the app icon itself (ink, magenta ring), magenta, paper, blush.
const markSvg = await (await fetch("./kawase-mark.svg")).text();
const glyph = markSvg.match(/<g [^>]*>.*<\/g>/s)[0];
function tileSvg(kind) {
  const ink = kind === "ink";
  const base = { ink: ["#232325", "#0c0c0d"], magenta: ["#ff3dff", "#e600ec"], paper: ["#ffffff", "#eeeef2"], blush: ["#ffe6ff", "#fbc6fb"] }[kind];
  const glyphFill = kind === "ink" || kind === "magenta" ? "#FFFFFF" : "#FA00FF";
  const ring = ink ? `<rect x="16" y="16" width="168" height="168" rx="32" fill="none" stroke="#FA00FF" stroke-width="6"/>` : kind === "paper" ? `<rect x="16" y="16" width="168" height="168" rx="32" fill="none" stroke="#FA00FF" stroke-opacity="0.9" stroke-width="5"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 224 224" width="512" height="512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base[0]}"/><stop offset="1" stop-color="${base[1]}"/></linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${ink ? 0.10 : 0.35}"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect width="200" height="200" rx="48" fill="url(#g)"/>
    <rect x="1" y="1" width="198" height="198" rx="47" fill="url(#hl)"/>
    ${kind === "paper" ? `<rect x="0.5" y="0.5" width="199" height="199" rx="47.5" fill="none" stroke="#000" stroke-opacity="0.07"/>` : ""}
    ${ring}${glyph.replace(/fill="#FFFFFF"/g, `fill="${glyphFill}"`)}
  </svg>`;
}
async function tileTexture(kind) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tileSvg(kind))}`;
  await img.decode();
  const c = new OffscreenCanvas(512, 512);
  c.getContext("2d").drawImage(img, 0, 0, 512, 512);
  const bmp = await createImageBitmap(c, { premultiplyAlpha: "premultiply" });
  return texture(bmp, 512, 512);
}
const TILE_TEX = Object.fromEntries(await Promise.all(["ink", "magenta", "paper", "blush"].map(async (k) => [k, await tileTexture(k)])));
// The tile picture is the 200-unit mark inside a 224-unit canvas: its size in the world is the mark's.
const TILE_PAD = 224 / 200;

// ── The logo tiles' paths ──────────────────────────────────────────────────────────────────────────────────────────
// World keys are [t, x, y, z, size, roll°] in page px; screen keys are [t, sx/W, sy/H, depth/d, screen size/W, roll°].
const button = manifest.pieces.find((p) => p.id === "hero-open").inner;
const button2 = manifest.pieces.find((p) => p.id === "hero-phone").inner;
const by = button.y + button.h / 2;
// The four tiles start as a small cluster beside the buttons (the copy is left-aligned; the left margin is the frame's edge).
const gx = button2.x + button2.w + 34;
const camEnd = camera(9.97);
const cardLeft = W / 2 - LAYOUT.cardW / 2;
const cw = LAYOUT.cardW;
function endKey(t, sx, sy, depthOf, sizeScreen, roll) {
  const depth = camEnd.d * depthOf;
  const p = unproject(camEnd, sx, sy, depth);
  return [t, p[0] + PAGE_W / 2, p[1], p[2], (sizeScreen * depth) / FOCAL, roll];
}
const TILES = [
  {
    kind: "magenta",
    keys: [
      [0, gx, by - 16, 2, 32, -8],
      [0.1, gx, by - 16, 2, 32, -8],
      [1.35, -84, 76, 150, 172, -12],
      [2.4, -84, 376, 150, 172, -12],
      [9.4, -72, 360, 140, 172, -10],
      endKey(9.97, cardLeft + 0.034 * cw, LAYOUT.cardTop + 0.036 * cw, 0.975, 0.137 * cw, -10),
      endKey(14.5, cardLeft + 0.03 * cw, LAYOUT.cardTop + 0.03 * cw, 0.975, 0.137 * cw, -11.5),
    ],
  },
  {
    kind: "blush",
    keys: [
      [0, gx + 16, by + 26, 2, 30, 7],
      [0.1, gx + 16, by + 26, 2, 30, 7],
      [1.35, 46, -64, 236, 150, 10],
      [2.4, 46, 236, 236, 150, 10],
      [9.4, 30, 250, 220, 150, 9],
      endKey(9.97, 0.085 * W, 0.885 * H, 0.64, 0.17 * W, 12),
      endKey(14.5, 0.079 * W, 0.89 * H, 0.64, 0.17 * W, 13.5),
    ],
  },
  {
    kind: "ink",
    keys: [
      [0, gx + 50, by - 20, 2, 32, 8],
      [0.1, gx + 50, by - 20, 2, 32, 8],
      [1.35, 1524, 76, 162, 180, 12],
      [2.4, 1524, 376, 162, 180, 12],
      [9.4, 1510, 360, 150, 180, 12],
      endKey(9.97, cardLeft + cw - 0.004 * cw, LAYOUT.cardTop + 0.036 * cw, 0.978, 0.118 * cw, 14),
      endKey(14.5, cardLeft + cw + 0.002 * cw, LAYOUT.cardTop + 0.032 * cw, 0.978, 0.118 * cw, 15.5),
    ],
  },
  {
    kind: "paper",
    keys: [
      [0, gx + 66, by + 22, 2, 30, -6],
      [0.1, gx + 66, by + 22, 2, 30, -6],
      [1.35, 1396, -60, 244, 150, -8],
      [2.4, 1396, 240, 244, 150, -8],
      [9.4, 1420, 300, 220, 150, -8],
      endKey(9.97, cardLeft + cw + 0.1 * cw, LAYOUT.cardTop + 0.47 * cw, 0.99, 0.123 * cw, -9),
      endKey(14.5, cardLeft + cw + 0.104 * cw, LAYOUT.cardTop + 0.475 * cw, 0.99, 0.123 * cw, -10.5),
    ],
  },
].map((tile) => ({ ...tile, at: track(tile.keys) }));
// Screen-anchored tiles: the one that drifts past the left edge close to the lens at 5.4 s, and the bottom-right
// blur that drifts in for the end card.
const SCREEN_TILES = [
  {
    kind: "ink",
    from: 4.5,
    to: 6.4,
    at: track([
      [4.5, 0.16, 1.32, 0.3, 0.2, -14],
      [5.4, -0.02, 0.78, 0.3, 0.2, -18],
      [6.4, -0.3, 0.28, 0.3, 0.2, -22],
    ]),
  },
  {
    kind: "paper",
    from: 9.5,
    to: DUR,
    at: track([
      [9.5, 1.22, 1.28, 0.62, 0.19, 18],
      [10.25, 0.915, 0.905, 0.62, 0.185, 14],
      [DUR, 0.907, 0.897, 0.62, 0.185, 12],
    ]),
  },
];

// ── The frame ──────────────────────────────────────────────────────────────────────────────────────────────────────
const CAP = 120 * SCALE;
const KF = 75 * SCALE;
const KB = 6 * SCALE;

function setCamera(prog, cam, jitter) {
  const l = prog.loc;
  gl.uniform3fv(l.uCam, cam.pos);
  gl.uniform3fv(l.uU, cam.u);
  gl.uniform3fv(l.uF, cam.f);
  gl.uniform1f(l.uFocal, FOCAL);
  gl.uniform2f(l.uRes, W, H);
  if (l.uJitter) gl.uniform2fv(l.uJitter, jitter);
}

// Where a piece is: its four corners, standing up about its middle line.
function pieceCorners(rect, z, stand) {
  const cx = rect.x + rect.w / 2 - PAGE_W / 2;
  const cy = rect.y + rect.h / 2;
  const c = Math.cos(stand);
  const s = Math.sin(stand);
  const out = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const dx = (sx * rect.w) / 2;
    const dy = (sy * rect.h) / 2;
    out.push([cx + dx, cy + dy * c, z - dy * s]);
  }
  return out;
}

// A tile's corners: a square of the given size, turned by roll in its own plane, tilted to face the lens.
function tileCorners(p, size, roll, face) {
  const half = (size * TILE_PAD) / 2;
  const cr = Math.cos(roll * DEG);
  const sr = Math.sin(roll * DEG);
  const a = [cr, sr * Math.cos(face), -sr * Math.sin(face)];
  const b = [-sr, cr * Math.cos(face), -cr * Math.sin(face)];
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([i, j]) => [p[0] + (a[0] * i + b[0] * j) * half, p[1] + (a[1] * i + b[1] * j) * half, p[2] + (a[2] * i + b[2] * j) * half]);
}

function cocAt(depth, focus) {
  return depth < focus ? Math.min(CAP, (KF * (focus - depth)) / Math.max(depth, 1)) : Math.min(CAP, (KB * (depth - focus)) / depth);
}

// The state of everything at time t (pure).
// ?flat=1 leaves out everything lifted, so the flow check measures the camera alone (no parallax from pieces).
const FLAT = Q.has("flat");
function scene(t) {
  const cam = camera(t);
  const fade = belowFade(t);
  const items = [];
  if (FLAT) return { cam, items, focus: cam.d, fade };
  for (const piece of pieces) {
    const mo = piece.motion;
    const k = smoother(win(t, mo.a, mo.b));
    const z = lerp(mo.z0, mo.z1, k);
    const stand = lerp(mo.stand0 * DEG, mo.stand, k);
    const below = piece.inner.y + piece.inner.h / 2 > HERO_BOTTOM;
    const f = below ? fade : 0;
    if (f >= 0.999) continue;
    items.push({ type: "piece", piece, z, stand, fade: f });
  }
  for (const tile of TILES) {
    const [x, y, z, size, roll] = tile.at(t);
    items.push({ type: "tile", kind: tile.kind, p: [x - PAGE_W / 2, y, z], size, roll, face: cam.th * 0.9 });
  }
  for (const tile of SCREEN_TILES) {
    if (t < tile.from || t > tile.to) continue;
    const [sx, sy, depthOf, sizeW, roll] = tile.at(t);
    const depth = cam.d * depthOf;
    const p = unproject(cam, sx * W, sy * H, depth);
    items.push({ type: "tile", kind: tile.kind, p, size: (sizeW * W * depth) / FOCAL, roll, face: cam.th });
  }
  items.sort((a, b) => (a.type === "piece" ? a.z : a.p[2]) - (b.type === "piece" ? b.z : b.p[2]));

  // Focus: the page under the frame's centre, pulled toward a lifted piece while it crosses the middle; on the end
  // card, a little above the page so the lifted phones are as crisp as the card.
  let focus = cam.d;
  if (t < 8.2) {
    let pull = 0;
    let target = cam.d;
    for (const it of items) {
      if (it.type !== "piece" || it.z < 30) continue;
      const r = it.piece.inner;
      const centre = project(cam, [r.x + r.w / 2 - PAGE_W / 2, r.y + r.h / 2, it.z]);
      const half = (Math.max(r.w, r.h) * FOCAL) / centre.z / 2;
      const dist = Math.hypot(centre.x - W / 2, centre.y - H / 2) / Math.max(half, 1);
      const w = 1 - smooth(win(dist, 0.35, 0.9));
      if (w > pull) {
        pull = w;
        target = centre.z;
      }
    }
    focus = lerp(cam.d, target, pull * 0.85 * (1 - smooth(win(t, 7.6, 8.1))));
  }
  focus = lerp(focus, cam.d - 100, smooth(win(t, 9.5, 9.97)));
  return { cam, items, focus, fade };
}

function drawScene(t, jitter) {
  const { cam, items, focus, fade } = scene(t);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);

  gl.useProgram(P.floor.p);
  setCamera(P.floor, cam, jitter);
  gl.bindVertexArray(screenVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // The page's shadow and the page, inside the (morphing) rounded mask.
  const mask = [0, 0, PAGE_W, maskBottom(t)];
  const radius = maskRadius(t);
  const sigma = Math.max(40, (24 * cam.d) / FOCAL);
  const m = sigma * 4;
  gl.useProgram(P.pageShadow.p);
  setCamera(P.pageShadow, cam, jitter);
  gl.uniform4fv(P.pageShadow.loc.uMask, mask);
  gl.uniform1f(P.pageShadow.loc.uRadius, radius);
  gl.uniform1f(P.pageShadow.loc.uSigma, sigma);
  gl.uniform1f(P.pageShadow.loc.uOpacity, 0.11);
  const sx0 = -m;
  const sx1 = PAGE_W + m;
  const sy0 = -m;
  const sy1 = mask[3] + m;
  drawQuad(
    [
      [sx0 - PAGE_W / 2, sy0, 0],
      [sx1 - PAGE_W / 2, sy0, 0],
      [sx0 - PAGE_W / 2, sy1, 0],
      [sx1 - PAGE_W / 2, sy1, 0],
    ],
    UV,
    [
      [sx0, sy0],
      [sx1, sy0],
      [sx0, sy1],
      [sx1, sy1],
    ],
  );

  gl.useProgram(P.page.p);
  setCamera(P.page, cam, jitter);
  gl.uniform4fv(P.page.loc.uMask, mask);
  gl.uniform1f(P.page.loc.uRadius, radius);
  gl.uniform1f(P.page.loc.uFade, fade);
  gl.uniform1f(P.page.loc.uFadeY, HERO_BOTTOM);
  gl.uniform1i(P.page.loc.uTex, 0);
  gl.activeTexture(gl.TEXTURE0);
  for (const tile of tiles) {
    if (tile.y > mask[3]) continue;
    gl.bindTexture(gl.TEXTURE_2D, tile.tex);
    const y0 = tile.y;
    const y1 = tile.y + tile.h;
    drawQuad(
      [
        [-PAGE_W / 2, y0, 0],
        [PAGE_W / 2, y0, 0],
        [-PAGE_W / 2, y1, 0],
        [PAGE_W / 2, y1, 0],
      ],
      UV,
      [
        [0, y0],
        [PAGE_W, y0],
        [0, y1],
        [PAGE_W, y1],
      ],
    );
  }

  // Shadows first (everything lifted casts onto the page or the floor), then the lifted things, lowest first.
  gl.useProgram(P.shadow.p);
  setCamera(P.shadow, cam, jitter);
  gl.uniform1i(P.shadow.loc.uTex, 0);
  for (const it of items) drawShadow(it);

  for (const it of items) drawItem(it, cam, focus);

  // Depth of field into the accumulator.
  gl.bindTexture(gl.TEXTURE_2D, sceneCol);
  gl.generateMipmap(gl.TEXTURE_2D);
  return focus;
}

function drawShadow(it) {
  let corners;
  let zc;
  let rectW;
  let rectH;
  let opacity = 0.26;
  if (it.type === "piece") {
    const r = it.piece.rect;
    corners = pieceCorners(r, it.z, it.stand);
    zc = it.z;
    rectW = r.w;
    rectH = r.h;
    opacity *= 1 - it.fade;
    gl.bindTexture(gl.TEXTURE_2D, it.piece.tex);
  } else {
    corners = tileCorners(it.p, it.size, it.roll, it.face);
    zc = it.p[2];
    rectW = rectH = it.size * TILE_PAD;
    opacity *= clamp(1 - zc / 700);
    gl.bindTexture(gl.TEXTURE_2D, TILE_TEX[it.kind]);
  }
  if (opacity < 0.003 || zc < 1) return;
  // Each corner drops to the floor, offset (0.10z, 4 + 0.36z) by its own height.
  const ground = corners.map(([x, y, z]) => [x + 0.1 * z, y + 4 + 0.36 * z]);
  const blur = 7 + 0.5 * zc;
  const eu = (blur * 1.15) / rectW;
  const ev = (blur * 1.15) / rectH;
  const bil = (u, v) => {
    const top = [lerp(ground[0][0], ground[1][0], u), lerp(ground[0][1], ground[1][1], u)];
    const bot = [lerp(ground[2][0], ground[3][0], u), lerp(ground[2][1], ground[3][1], u)];
    return [lerp(top[0], bot[0], v), lerp(top[1], bot[1], v), 0];
  };
  const uvs = [
    [-eu, -ev],
    [1 + eu, -ev],
    [-eu, 1 + ev],
    [1 + eu, 1 + ev],
  ];
  const texelsPerPx = it.type === "piece" ? manifest.dpr : 512 / rectW;
  const lod = Math.log2(Math.max(1, blur * texelsPerPx * 0.4));
  gl.uniform2f(P.shadow.loc.uBlur, blur / rectW, blur / rectH);
  gl.uniform1f(P.shadow.loc.uLod, lod);
  gl.uniform1f(P.shadow.loc.uOpacity, opacity);
  drawQuad(
    uvs.map(([u, v]) => bil(u, v)),
    uvs,
  );
}

function drawItem(it, cam, focus) {
  const l = P.piece.loc;
  if (it.type === "piece") {
    const r = it.piece.rect;
    const corners = pieceCorners(r, it.z, it.stand);
    if (it.piece.id === "budget" && it.stand > 0.01) drawEdge(it, corners, cam);
    gl.useProgram(P.piece.p);
    setCamera(P.piece, cam, currentJitter);
    gl.uniform1i(l.uTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, it.piece.tex);
    gl.uniform1f(l.uFade, it.fade);
    gl.uniform1f(l.uAlpha, 1);
    gl.uniform2f(l.uBlur, 0, 0);
    gl.uniform1f(l.uDepthSet, 0);
    drawQuad(corners, UV);
    return;
  }
  // A logo tile: blurred here by its own circle of confusion, so the depth-of-field pass leaves it alone.
  const centre = project(cam, it.p);
  if (centre.z < 5) return;
  const px = (it.size * TILE_PAD * FOCAL) / centre.z;
  const coc = cocAt(centre.z, focus);
  const pre = coc > 1.5;
  const e = pre ? (coc * 1.1) / px : 0;
  const corners = tileCorners(it.p, it.size, it.roll, it.face);
  const ex = (c, a, b) => [lerp(c[a][0], c[b][0], -e), lerp(c[a][1], c[b][1], -e), lerp(c[a][2], c[b][2], -e)];
  // Grow the quad by e on every side (in the tile's own plane) and widen the UVs to match.
  const g = [ex(corners, 0, 3), ex(corners, 1, 2), ex(corners, 2, 1), ex(corners, 3, 0)];
  const uvs = UV.map(([u, v]) => [lerp(-e, 1 + e, u), lerp(-e, 1 + e, v)]);
  gl.useProgram(P.piece.p);
  setCamera(P.piece, cam, currentJitter);
  gl.uniform1i(l.uTex, 0);
  gl.bindTexture(gl.TEXTURE_2D, TILE_TEX[it.kind]);
  gl.uniform1f(l.uFade, 0);
  gl.uniform1f(l.uAlpha, 1);
  gl.uniform2f(l.uBlur, pre ? coc / px : 0, pre ? coc / px : 0);
  gl.uniform1f(l.uLod, pre ? Math.log2(Math.max(1, (coc / px) * 512 * 0.3)) : 0);
  gl.uniform1f(l.uDepthSet, pre ? focus : 0);
  drawQuad(pre ? g : corners, pre ? uvs : UV);
}

// The testimonial card stands on a 34 px white edge (its thickness, facing the lens).
function drawEdge(it, corners, cam) {
  const n = [0, Math.sin(it.stand), Math.cos(it.stand)];
  const T = 34;
  const pad = manifest.pad;
  const r = it.piece.rect;
  // The card's own bottom edge, inside the capture's padding.
  const k = pad / r.h;
  const bl = [lerp(corners[2][0], corners[0][0], k) + pad, lerp(corners[2][1], corners[0][1], k), lerp(corners[2][2], corners[0][2], k)];
  const br = [lerp(corners[3][0], corners[1][0], k) - pad, lerp(corners[3][1], corners[1][1], k), lerp(corners[3][2], corners[1][2], k)];
  const down = (p) => [p[0] - n[0] * T, p[1] - n[1] * T, p[2] - n[2] * T];
  gl.useProgram(P.solid.p);
  setCamera(P.solid, cam, currentJitter);
  gl.uniform3f(P.solid.loc.uColour, 1, 1, 1);
  gl.uniform1f(P.solid.loc.uAlpha, 1 - it.fade);
  drawQuad([bl, br, down(bl), down(br)], UV);
}

let currentJitter = [0, 0];
const JITTER = Array.from({ length: 64 }, (_, i) => [hash(i * 2 + 7) - 0.5, hash(i * 2 + 8) - 0.5]);

function renderFrame(t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, accFbo);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const span = SHUTTER / FPS;
  for (let k = 0; k < SUB; k++) {
    const tk = clamp(t + ((k + 0.5) / SUB - 0.5) * span, 0, DUR);
    currentJitter = SUB > 1 ? JITTER[k % JITTER.length].map((v) => v * 0.8) : [0, 0];
    const focus = drawScene(tk, currentJitter);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accFbo);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.dof.p);
    gl.uniform2f(P.dof.loc.uRes, W, H);
    gl.uniform1f(P.dof.loc.uFocus, focus);
    gl.uniform1f(P.dof.loc.uKF, KF);
    gl.uniform1f(P.dof.loc.uKB, KB);
    gl.uniform1f(P.dof.loc.uCap, CAP);
    gl.uniform1f(P.dof.loc.uWeight, 1 / SUB);
    gl.uniform1i(P.dof.loc.uCol, 0);
    gl.uniform1i(P.dof.loc.uDep, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sceneDep);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneCol);
    gl.bindVertexArray(screenVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, W, H);
  gl.useProgram(P.out.p);
  gl.uniform2f(P.out.loc.uRes, W, H);
  gl.uniform1f(P.out.loc.uSeed, (t * 60) % 97);
  gl.uniform1i(P.out.loc.uAcc, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, accum);
  gl.bindVertexArray(screenVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ── The end card's words ───────────────────────────────────────────────────────────────────────────────────────────
const LINE1 = (Q.get("line1") ?? "Money that moves,").split(" ");
const LINE2 = (Q.get("line2") ?? "when you speak.").split(" ");
const badge = document.getElementById("badge");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const wordsOf = (el, words) => {
  el.innerHTML = words.map((w) => `<span class="word">${w}</span>`).join(" ");
  return [...el.querySelectorAll(".word")];
};
const w1 = wordsOf(line1, LINE1);
const w2 = wordsOf(line2, LINE2);
const ts = LAYOUT.text;
Object.assign(badge.style, {
  top: `${LAYOUT.badgeTop}px`,
  height: `${40 * ts}px`,
  padding: `0 ${16 * ts}px 0 ${9 * ts}px`,
  fontSize: `${21 * ts}px`,
  left: "50%",
});
badge.querySelector("img").style.cssText = `width:${24 * ts}px;height:${24 * ts}px;border-radius:${6 * ts}px`;
Object.assign(line1.style, { top: `${LAYOUT.badgeTop + 50 * ts}px`, fontSize: `${74 * ts}px`, lineHeight: "1" });
Object.assign(line2.style, { top: `${LAYOUT.badgeTop + 128 * ts}px`, fontSize: `${82 * ts}px`, lineHeight: "1" });

function wordState(el, t, start) {
  const k = clamp((t - start) / 0.34);
  const e = 1 - (1 - k) ** 3;
  el.style.opacity = String(clamp(k * 1.8));
  el.style.transform = `translateY(${16 * ts * (1 - e)}px)`;
  el.style.filter = `blur(${12 * ts * (1 - e)}px)`;
}
function words(t) {
  const b = clamp((t - 10.02) / 0.35);
  const be = 1 - (1 - b) ** 3;
  badge.style.opacity = String(be);
  badge.style.transform = `translateX(-50%) translateY(${8 * ts * (1 - be)}px)`;
  w1.forEach((el, i) => wordState(el, t, 10.12 + 0.06 * i));
  w2.forEach((el, i) => wordState(el, t, 10.36 + 0.05 * i));
}

await document.fonts.load(`500 74px "Geist"`);
await document.fonts.load(`italic 82px "Instrument Serif"`);
await document.fonts.ready;

window.seek = (t) => {
  renderFrame(t);
  words(t);
  gl.finish();
};
window.filmInfo = { W, H, FPS, SUB, DUR, CRUISE, Y0, D_STRIP, D_CARD, FOCAL, gpu: window.filmGpu, camera: (t) => camera(t) };
if (Q.has("t")) window.seek(Number(Q.get("t")));
window.filmReady = true;
