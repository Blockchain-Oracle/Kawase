// What the landing's download buttons may link to right now. Ported from Mitoshi (crypto-world-fair
// web/src/lib/release.ts, itself from Owarine): the iPhone app's public TestFlight link, offered only while Apple's join
// page takes testers (`server/store-release.ts`), and Android's installable build. Android is the APK itself (the
// owner, 10-15: "for the Android, we just have to tell them to download the APK"), the newest EAS preview build; it
// takes the same over-the-air updates as the iPhone build (the preview channel serves the production branch).
// Pure (no server-only import) so the parsing can be tested.
import { PUBLIC_LINKS } from "@kawase/config";

/** The public TestFlight invitation for Kawase (App Store Connect → TestFlight → Public beta). */
export const TESTFLIGHT_PUBLIC_LINK = "https://testflight.apple.com/join/PD3fgXZx";

/** The store links a visitor can open right now; null is "not yet". */
export interface StoreRelease {
  testflight: string | null;
  /** A TestFlight link is set but Apple's beta review hasn't opened it yet (the badge says so). */
  inReview?: boolean;
  apk: string;
}

export type Platform = "ios" | "android" | "desktop";

const TESTFLIGHT_JOIN = /^\/join\/([A-Za-z0-9]+)\/?$/;
const HTTP = { ok: 200, notFound: 404, gone: 410 } as const;

/** Only Apple's own join links: a TestFlight invitation is never anywhere else. */
export function parseTestflight(raw: string | undefined | null): string | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname === "testflight.apple.com" && TESTFLIGHT_JOIN.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What Apple's join page says about a beta: it takes testers, it doesn't, or it couldn't be read. */
export type TestflightState = "open" | "closed" | "unknown";

/**
 * Apple's answer for one join link, from the page it serves (HTML-escaped English; the request asks for en-US). Closed:
 * the page says the beta takes no one (before Apple's beta review passes, at the tester limit, or with the link turned
 * off) or the code is gone (404/410). Open: the join page for this code (it links `itms-beta://…/join/<code>`) without
 * that line. Anything else is unknown, never open.
 */
export function testflightState(link: string, status: number, html: string): TestflightState {
  if (status === HTTP.notFound || status === HTTP.gone) return "closed";
  if (status !== HTTP.ok) return "unknown";
  if (/isn(?:'|’|&#39;|&#x27;|&apos;)t accepting any new testers|this beta is full/i.test(html)) return "closed";
  const code = TESTFLIGHT_JOIN.exec(new URL(link).pathname)?.[1];
  return code && html.includes(`itms-beta://testflight.apple.com/join/${code}`) ? "open" : "unknown";
}

export function readStoreRelease(env: Record<string, string | undefined> = process.env): StoreRelease {
  return {
    testflight: parseTestflight(env.TESTFLIGHT_PUBLIC_LINK ?? TESTFLIGHT_PUBLIC_LINK),
    apk: env.ANDROID_APK_URL?.trim() || PUBLIC_LINKS.androidApk,
  };
}

/**
 * The device a request comes from, for which card leads on /download: an iPhone (or iPod; an iPad that says iPad), an
 * Android phone, or anything else. iPadOS Safari reports a Mac, so it reads as a desktop and still sees every card.
 */
export function platformOf(userAgent: string | null | undefined): Platform {
  const ua = userAgent ?? "";
  return /\b(iPhone|iPod|iPad)\b/.test(ua) ? "ios" : /\bAndroid\b/.test(ua) ? "android" : "desktop";
}
