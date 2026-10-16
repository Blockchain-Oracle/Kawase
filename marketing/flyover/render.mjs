// Step 3: render the film page frame by frame on the real GPU and encode it.
//
//   node render.mjs                                   # 1440×1152, 60 fps, 16 subframes → out/kawase-flyover.mp4
//   node render.mjs --fps 30 --sub 4 --name preview   # quick preview (for the optical-flow check)
//   node render.mjs --stills 0,1.6,2.5,5,6.5,9.3,11   # stills only → out/stills/
//   node render.mjs --w 1080 --h 1350 --audio audio/out/mix.m4a --name kawase-flyover-4x5
//
// Chrome runs headless on Metal (--use-angle=metal --enable-gpu --ignore-gpu-blocklist); the page's WebGL renderer is
// printed so a software fallback is caught. Each frame is seek(t) then a PNG screenshot piped to ffmpeg (H.264, yuv420p,
// faststart). With --audio the track is muxed (AAC 256k).
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "1" : all[i + 1]]] : acc), []),
);
const W = Number(args.w ?? 1440);
const H = Number(args.h ?? 1152);
const FPS = Number(args.fps ?? 60);
const SUB = Number(args.sub ?? 16);
const DUR = 14.5;
const NAME = args.name ?? (W === 1440 && H === 1152 ? "kawase-flyover" : `kawase-flyover-${W}x${H}`);
const OUT = join(HERE, "out");
mkdirSync(join(OUT, "stills"), { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const path = normalize(join(HERE, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(HERE) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  createReadStream(path).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--force-color-profile=srgb"],
});
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("console", (m) => (m.type() === "error" ? console.error("page:", m.text()) : null));
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${port}/film/index.html?w=${W}&h=${H}&fps=${FPS}&sub=${SUB}${args.flat ? "&flat=1" : ""}`);
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 120000 });
  const info = await page.evaluate(() => ({ gpu: window.filmInfo.gpu, cruise: window.filmInfo.CRUISE, y0: window.filmInfo.Y0 }));
  console.log(`renderer: ${info.gpu}; cruise ${info.cruise.toFixed(1)} px/s from y ${info.y0.toFixed(0)}`);
  if (/swiftshader|llvmpipe|software/i.test(info.gpu)) throw new Error("WebGL fell back to software rendering");
  const cdp = await page.context().newCDPSession(page);
  const shot = async () => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 }, optimizeForSpeed: true });
    return Buffer.from(data, "base64");
  };

  if (args.stills) {
    for (const t of args.stills.split(",").map(Number)) {
      await page.evaluate((tt) => window.seek(tt), t);
      const file = join(OUT, "stills", `${NAME}-${t.toFixed(2)}s.png`);
      writeFileSync(file, await shot());
      console.log("still", file);
    }
  } else {
    const from = Number(args.from ?? 0);
    const to = Number(args.to ?? DUR);
    const frames = Math.round((to - from) * FPS);
    const file = join(OUT, `${NAME}.mp4`);
    const audio = args.audio ? ["-i", join(HERE, args.audio)] : [];
    const ff = spawn(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-c:v",
        "png",
        "-i",
        "-",
        ...audio,
        "-map",
        "0:v",
        ...(audio.length ? ["-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-ar", "48000"] : []),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        String(args.crf ?? 14),
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-tune",
        "film",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-movflags",
        "+faststart",
        "-t",
        String(frames / FPS),
        file,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const started = Date.now();
    for (let i = 0; i < frames; i++) {
      const t = from + i / FPS;
      await page.evaluate((tt) => window.seek(tt), t);
      const png = await shot();
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % FPS === 0) console.log(`frame ${i}/${frames} t=${t.toFixed(2)} ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    // The camera at the midpoint between frames, for flowcheck.py (page speed from screen speed).
    const cams = await page.evaluate(
      ({ frames, fps, from }) =>
        Array.from({ length: frames }, (_, i) => {
          const c = window.filmInfo.camera(from + (i + 0.5) / fps);
          return { d: c.d, th: c.th, F: window.filmInfo.FOCAL };
        }),
      { frames, fps: FPS, from },
    );
    writeFileSync(join(OUT, `${NAME}-cams.json`), JSON.stringify(cams));
    await new Promise((r, j) => ff.on("close", (code) => (code === 0 ? r() : j(new Error(`ffmpeg exited ${code}`)))));
    console.log("wrote", file, `${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
} finally {
  await browser.close();
  server.close();
}
