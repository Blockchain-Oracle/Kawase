// Web smoke test: welcome → pick Arabic → start as a guest → home → settings → back. Needs the dev server on
// :8081 and the api the app points at (EXPO_PUBLIC_API_URL). Run: node apps/mobile/scripts/web-smoke.mjs
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../plan/spikes/code/08-ui-stack/", import.meta.url));
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:8081";
const out = (name) => new URL(`../../../plan/design/gallery/${name}`, import.meta.url).pathname;
const SETTLE_MS = 2500;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 880 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));

await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
await page.waitForURL(/welcome/, { timeout: 120000 });
await page.waitForTimeout(SETTLE_MS);
await page.getByRole("radio", { name: "العربية" }).click();
await page.waitForTimeout(SETTLE_MS);
await page.screenshot({ path: out("web-welcome-ar.png") });
const direction = await page.evaluate(() => getComputedStyle(document.querySelector('[dir], [style*="direction"]') ?? document.body).direction);
await page.getByRole("button", { name: "ابدأ" }).click();
await page.waitForURL((url) => !url.pathname.includes("welcome"), { timeout: 60000 });
await page.waitForTimeout(SETTLE_MS);
await page.screenshot({ path: out("web-home-guest-ar.png") });
const homeText = await page.evaluate(() => document.body.innerText);
await page.getByRole("button", { name: "الإعدادات" }).click();
await page.waitForURL(/settings/, { timeout: 60000 });
await page.waitForTimeout(SETTLE_MS);
await page.screenshot({ path: out("web-settings-ar.png") });
const settingsText = await page.evaluate(() => document.body.innerText);
console.log(JSON.stringify({ direction, homeHasGuestSignIn: homeText.includes("تسجيل الدخول"), settingsHasGuest: settingsText.includes("ضيف"), errors }, null, 1));
await browser.close();
