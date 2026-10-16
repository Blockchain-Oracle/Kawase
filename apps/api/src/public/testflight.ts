// /download's "Email me when it opens" (Abu, 10-15: "request access to join, and then we'll send you a link"): the
// address joins the iPhone app's public TestFlight group through the App Store Connect API, so Apple itself emails the
// TestFlight invitation (the beta is open since Apple's review passed on 10-16). Kawase then sends one email of its own,
// in its own layout, with the join link and the three steps. Nothing is stored here: the address goes to Apple, and to Resend for that
// one email. On the Android card the same field mails the APK link with how to install it (Kawase isn't on Google
// Play, so Android asks once about installs from the browser and Play Protect may ask too). Limits: one request per
// address in ten minutes, and a cap for the whole list per hour.
import { createPrivateKey, sign } from "node:crypto";

import { PUBLIC_LINKS } from "@kawase/config";
import type { Logger } from "@kawase/log";

import type { ResendEmail } from "../notify/email";
import { emailHtml, emailText, type EmailContent } from "../notify/email-layout";

export type TestflightConfig = { keyId: string; issuer: string; privateKey: string; groupId: string };
export type InviteResult = "sent" | "already" | "unavailable" | "failed" | "busy";

const API = "https://api.appstoreconnect.apple.com/v1/betaTesters";
/** Apple accepts tokens up to 20 minutes long; a short one is enough for one call. */
const TOKEN_SECONDS = 300;
const MS = 1000;
const HTTP_CONFLICT = 409;
const TIMEOUT_MS = 10_000;
const PER_ADDRESS_MS = 600_000;
const HOUR_MS = 3_600_000;
const PER_HOUR = 100;

// Plain and transactional on purpose (Gmail files "you're on the list" mail with links to other apps under
// Promotions): what was asked, what happens next, one link.
const CONFIRMATION: Omit<EmailContent, "preheader"> = {
  rtl: false,
  label: "Kawase for iPhone",
  headline: "Your TestFlight invitation",
  body: "Kawase's iPhone beta is open. Apple is emailing you the invitation too (from TestFlight); either one works.",
  steps: [
    "On your iPhone, install TestFlight from the App Store.",
    "Tap Join the beta below, or open Apple's invitation email.",
    "Install Kawase from TestFlight. Updates arrive by themselves from then on.",
  ],
  primary: { label: "Join the beta", href: PUBLIC_LINKS.testFlight ?? PUBLIC_LINKS.webApp },
  secondary: [{ label: "Use Kawase in your browser meanwhile", href: PUBLIC_LINKS.webApp }],
  footer: ["You asked for this on getkawase.xyz/download. This is the only email Kawase sends you about it."],
};

const ANDROID: Omit<EmailContent, "preheader"> = {
  rtl: false,
  label: "Kawase for Android",
  headline: "Your download link",
  body: "Open this email on your Android phone. Kawase isn't on Google Play yet, so the app comes straight from us as an APK.",
  steps: [
    "Tap Download the APK below.",
    "Open the file. Android asks once to allow installs from your browser: allow it.",
    "If Play Protect warns, tap More details, then Install anyway (or let it scan the app first).",
    "Open Kawase. Updates arrive by themselves from then on.",
  ],
  primary: { label: "Download the APK", href: PUBLIC_LINKS.androidApk },
  footer: ["You asked for this on getkawase.xyz/download. This is the only email Kawase sends you about it."],
};

export class TestflightInvites {
  private readonly recent = new Map<string, number>();
  private hour: number[] = [];

  constructor(
    private readonly config: TestflightConfig | undefined,
    private readonly email: ResendEmail | undefined,
    private readonly log?: Logger,
  ) {}

  private token(): string {
    const { keyId, issuer, privateKey } = this.config!;
    // The .p8 in one env line: Coolify stores "\\n" for each break, a shell export "\n"; base64 never holds a backslash.
    const key = createPrivateKey(privateKey.replace(/\\+n/g, "\n"));
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / MS);
    const head = b64({ alg: "ES256", kid: keyId, typ: "JWT" });
    const body = b64({ iss: issuer, iat: now, exp: now + TOKEN_SECONDS, aud: "appstoreconnect-v1" });
    return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  }

  /** One request per address in ten minutes, and a cap per hour for the whole page. */
  private limited(key: string): boolean {
    const now = Date.now();
    this.hour = this.hour.filter((at) => now - at < HOUR_MS);
    const last = this.recent.get(key);
    if ((last && now - last < PER_ADDRESS_MS) || this.hour.length >= PER_HOUR) return true;
    this.recent.set(key, now);
    this.hour.push(now);
    return false;
  }

  /** The Android card: one email with the APK and how to install it. */
  async android(address: string): Promise<InviteResult> {
    if (!this.email) return "unavailable";
    if (this.limited(`android:${address}`)) return "busy";
    const content = { ...ANDROID, preheader: "The Kawase APK, and how to install it in a minute." };
    try {
      await this.email.send({ to: address, subject: "Kawase for Android: your download link", text: emailText(content), html: emailHtml(content), idempotencyKey: `kawase-android-${Buffer.from(address).toString("base64url")}-${Math.floor(Date.now() / PER_ADDRESS_MS)}` });
      return "sent";
    } catch (error) {
      this.log?.warn({ err: error }, "android link email failed");
      return "failed";
    }
  }

  async invite(address: string): Promise<InviteResult> {
    if (!this.config) return "unavailable";
    if (this.limited(`ios:${address}`)) return "busy";
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          data: { type: "betaTesters", attributes: { email: address }, relationships: { betaGroups: { data: [{ type: "betaGroups", id: this.config.groupId }] } } },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        // Apple answers 409 both for an address already on the list and for one it won't take: only the first says so.
        const body = (await response.json().catch(() => null)) as { errors?: { code?: string; detail?: string }[] } | null;
        const first = body?.errors?.[0];
        if (response.status === HTTP_CONFLICT && /DUPLICATE|already/i.test(`${first?.code ?? ""} ${first?.detail ?? ""}`)) return "already";
        this.log?.warn({ status: response.status, code: first?.code }, "testflight invite refused");
        return "failed";
      }
      // Apple has the address: one email of Kawase's own says what happens next (a failure here changes nothing).
      if (this.email) {
        const content = { ...CONFIRMATION, preheader: "Kawase's iPhone beta is open: join it on TestFlight." };
        await this.email
          .send({ to: address, subject: "Kawase on iPhone: your TestFlight invitation", text: emailText(content), html: emailHtml(content), idempotencyKey: `kawase-testflight-${Buffer.from(address).toString("base64url")}` })
          .catch((error: unknown) => this.log?.warn({ err: error }, "testflight confirmation email failed"));
      }
      return "sent";
    } catch (error) {
      this.log?.warn({ err: error }, "testflight invite failed");
      return "failed";
    }
  }
}
