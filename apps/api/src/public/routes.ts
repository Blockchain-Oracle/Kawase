// `GET /public/stats`: aggregate counts for the showcase (no session needed; the global rate limit applies).
// `GET /public/email/:name.png`: the pictures Kawase's emails show (the mark, the hanko, USDC and EURC), because mail
// clients load images by URL and never draw SVG. `GET /public/receipt-qr/:network/:tx.png`: the receipt slip's QR in an
// email, opening that transaction on the explorer (public data; a transaction never changes, so it caches for good).
// `POST /public/testflight-invite`: /download's "Email me" (public/testflight.ts): the TestFlight list for iPhone, the APK
// link for Android (`platform`).
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import QRCode from "qrcode";
import { z } from "zod";

import { EXPLORERS, MS_PER_SECOND, PUBLIC_STATS_CACHE_MS } from "@kawase/config";

import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { PublicStatsService } from "./service";
import type { TestflightInvites } from "./testflight";

const CACHE_CONTROL = `public, max-age=${PUBLIC_STATS_CACHE_MS / MS_PER_SECOND}`;
const FOREVER = "public, max-age=31536000, immutable";
const EMAIL_ASSETS = ["mark", "hanko", "usdc", "eurc"] as const;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const MAX_EMAIL = 254;
const InviteBody = z.object({ email: z.email().max(MAX_EMAIL), platform: z.enum(["ios", "android"]).default("ios") });
/** Twice the 92 px the email shows it at, for sharp phones. */
const QR_PX = 184;

const assets = new Map(EMAIL_ASSETS.map((name) => [`${name}.png`, readFileSync(new URL(`../../assets/email/${name}.png`, import.meta.url))]));

export function publicRoutes(stats: PublicStatsService, invites: TestflightInvites) {
  const app = new Hono<AppEnv>();
  app.get("/stats", async (c) => {
    c.header("cache-control", CACHE_CONTROL);
    return c.json(await stats.stats());
  });
  app.get("/email/:file", (c) => {
    const file = assets.get(c.req.param("file"));
    if (!file) throw problem(HTTP.notFound, "not_found", "no such picture");
    return c.body(new Uint8Array(file), HTTP.ok, { "content-type": "image/png", "cache-control": FOREVER });
  });
  app.get("/receipt-qr/:network/:file", async (c) => {
    const network = c.req.param("network");
    const hash = c.req.param("file").replace(/\.png$/, "");
    if ((network !== "mainnet" && network !== "testnet") || !TX_HASH.test(hash)) throw problem(HTTP.notFound, "not_found", "no such receipt");
    const url = `${network === "testnet" ? EXPLORERS.arcTestnet : EXPLORERS.arc}/tx/${hash}`;
    const png = await QRCode.toBuffer(url, { type: "png", margin: 1, width: QR_PX, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } });
    return c.body(new Uint8Array(png), HTTP.ok, { "content-type": "image/png", "cache-control": FOREVER });
  });
  app.post("/testflight-invite", async (c) => {
    const parsed = InviteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ result: "invalid" });
    const email = parsed.data.email.trim().toLowerCase();
    return c.json({ result: parsed.data.platform === "android" ? await invites.android(email) : await invites.invite(email) });
  });
  return app;
}
