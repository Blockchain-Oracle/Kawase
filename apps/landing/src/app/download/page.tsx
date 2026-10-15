// `/download` (the owner, 10-15: "slash download… the iOS… for the Android, we just tell them to download the APK. So
// there will be QR code too"). Mitoshi's /download, Kawase's honesty: a card per way in, the visitor's own platform
// first (from the user agent), each with its live state, its steps and, on a desktop, a QR for the phone in the other
// hand. iPhone links to TestFlight only while Apple's join page takes testers (the gate in `server/store-release.ts`);
// until then it says Kawase is in Apple's beta review and points the iPhone at the web app, which works there today. The
// Mac app isn't finished (the owner, 10-15), so the Mac row says it's on its way and offers the web app. While Apple
// reviews the beta, an iPhone visitor can leave an email: it joins the public TestFlight group and Apple sends the
// invitation the minute testers are let in; on Android the same field mails the APK and how to install it. The form sits
// in the hero, above the fold, with an iPhone / Android choice (`components/landing/app-invite.tsx`). Kawase isn't on
// Google Play, so the Android steps say what Play Protect may ask.
import { ArrowUpRight, Check, Globe, Laptop } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { PhoneShot } from "@/components/landing/devices";
import { AppInvite } from "@/components/landing/app-invite";
import { AndroidGlyph, AppleGlyph } from "@/components/landing/glyphs";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/landing/hero";
import { QrPlate, StoreBadges } from "@/components/landing/stores";
import { links } from "@/lib/links";
import { platformOf, type Platform, type StoreRelease } from "@/lib/release";
import { liveStoreRelease } from "@/server/store-release";

export const metadata: Metadata = {
  title: "Get the app",
  description: "Kawase on iPhone, Android and the web: one account on all three.",
};

type CardId = "ios" | "android" | "web";

function Card({ title, glyph, state, mine, children, qr }: { title: string; glyph: ReactNode; state: string; mine: boolean; children: ReactNode; qr?: ReactNode }) {
  return (
    <article className="lp-tile flex flex-col gap-6 rounded-[32px] border border-border p-7" aria-label={title}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-[14px] bg-muted text-foreground">{glyph}</span>
          <div>
            <h2 className="font-display text-[26px] leading-none font-black text-foreground">{title}</h2>
            <p className="mt-1.5 text-[14px] font-medium text-muted-foreground">{state}</p>
          </div>
        </div>
        {mine ? <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-white">This device</span> : null}
      </header>
      <div className="flex-1 text-[16px] leading-[1.55] text-[var(--lp-ink-soft)]">{children}</div>
      {qr ? <div className="hidden justify-center border-t border-border pt-6 lg:flex">{qr}</div> : null}
    </article>
  );
}

function Steps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="mt-4 grid gap-2.5">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-bold text-background">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function IosCard({ release, mine }: { release: StoreRelease; mine: boolean }) {
  const open = release.testflight !== null;
  return (
    <Card
      title="iPhone"
      glyph={<AppleGlyph className="size-6" />}
      state={open ? "Public beta on TestFlight" : release.inReview ? "In Apple's beta review" : "Coming to TestFlight"}
      mine={mine}
      qr={<QrPlate url={release.testflight ?? links.webApp} caption={open ? "Opens the TestFlight invitation" : "Opens the web app on your iPhone"} size={150} />}
    >
      {open ? (
        <>
          Kawase's iPhone app is a public beta on Apple's TestFlight.
          <Steps steps={["Install TestFlight from the App Store.", "Open the invitation and tap Accept.", "Install Kawase. Updates arrive by themselves."]} />
          <a href={release.testflight ?? undefined} className={`${BUTTON_PRIMARY} mt-6`}>
            Join the beta <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </>
      ) : (
        <>
          The iPhone app is with Apple for its beta review; this card opens TestFlight by itself the minute Apple lets
          testers in. Until then the web app works on your iPhone, with the same account:
          <Steps steps={["Open the web app in Safari.", "Tap Share, then Add to Home Screen.", "Kawase opens from your Home Screen like an app."]} />
          <a href={links.webApp} className={`${BUTTON_PRIMARY} mt-6`}>
            Open the web app <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </>
      )}
    </Card>
  );
}

function AndroidCard({ release, mine }: { release: StoreRelease; mine: boolean }) {
  return (
    <Card
      title="Android"
      glyph={<AndroidGlyph className="h-[16px] w-auto" />}
      state="The APK, straight to your phone"
      mine={mine}
      qr={<QrPlate url={release.apk} caption="Downloads the APK on your Android phone" size={150} />}
    >
      The full app as an APK, straight from us: Kawase isn't on Google Play yet.
      <Steps
        steps={[
          "Download the APK.",
          "Open it; allow installs from your browser when Android asks (once).",
          "If Play Protect warns, tap More details, then Install anyway (or let it scan the app).",
          "Open Kawase. Updates arrive by themselves.",
        ]}
      />
      <a href={release.apk} download className={`${BUTTON_PRIMARY} mt-6`}>
        Download the APK <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </Card>
  );
}

function WebCard({ mine }: { mine: boolean }) {
  return (
    <Card
      title="Web"
      glyph={<Globe className="size-6" />}
      state="Nothing to install"
      mine={mine}
      qr={<QrPlate url={links.webApp} caption="Opens app.getkawase.xyz" size={150} />}
    >
      Every feature, in any browser, on a phone or a laptop. Look around without an account, sign in when you want to
      move money.
      <ul className="mt-4 grid gap-2.5">
        {["The same account as the phone apps", "Voice in the browser, in ten languages", "Installs as an app from your browser's menu"].map((line) => (
          <li key={line} className="flex gap-3">
            <Check className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <a href={links.webApp} className={`${BUTTON_PRIMARY} mt-6`}>
        Open the web app <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </Card>
  );
}

const ORDER: Record<Platform, readonly CardId[]> = {
  ios: ["ios", "web", "android"],
  android: ["android", "web", "ios"],
  desktop: ["ios", "android", "web"],
};

export default async function Download() {
  const [release, agent] = await Promise.all([liveStoreRelease(), headers().then((list) => list.get("user-agent"))]);
  const platform = platformOf(agent);
  const cards: Record<CardId, ReactNode> = {
    ios: <IosCard key="ios" release={release} mine={platform === "ios"} />,
    android: <AndroidCard key="android" release={release} mine={platform === "android"} />,
    web: <WebCard key="web" mine={platform === "desktop"} />,
  };

  return (
    <>
      <section className="lp-glow relative overflow-hidden" aria-labelledby="download-title">
        <div className="lp-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pt-14 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-20">
          <div className="max-w-[620px]">
            <h1 id="download-title" className="font-display text-[clamp(52px,8vw,104px)] leading-[0.94] font-black tracking-[-0.01em] text-foreground">
              Kawase, on your <span className="text-accent">phone</span>.
            </h1>
            <p className="mt-6 text-[20px] leading-[1.5] text-[var(--lp-ink-soft)]">
              iPhone, Android or the browser. One account on all three, and everything you do follows you.
            </p>
            {/* Get it by email without scrolling (Abu, 10-16): the visitor's own phone is chosen for them. */}
            <AppInvite initial={platform === "android" ? "android" : "ios"} />
            <StoreBadges release={release} className="mt-8" />
          </div>
          <div className="relative hidden h-[520px] w-[520px] lg:block" aria-hidden>
            <PhoneShot name="token" alt="" className="absolute top-16 left-0 -rotate-[8deg] [--phone-w:210px]" />
            <PhoneShot name="marketplace" alt="" className="absolute top-16 right-0 rotate-[8deg] [--phone-w:210px]" />
            <PhoneShot name="home" alt="" eager className="absolute top-0 left-1/2 -translate-x-1/2 [--phone-w:240px]" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8" aria-label="Ways to get Kawase">
        <div className="grid gap-5 lg:grid-cols-3">{ORDER[platform].map((id) => cards[id])}</div>

        <div className="lp-tile mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-border px-7 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-[14px] bg-muted text-foreground">
              <Laptop className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-[20px] font-bold text-foreground">Kawase for Mac is on its way</p>
              <p className="text-[15px] text-muted-foreground">Until then, the web app runs in any browser on your Mac, voice included.</p>
            </div>
          </div>
          <a href={links.webApp} className={BUTTON_SECONDARY}>
            Open the web app
          </a>
        </div>
      </section>
    </>
  );
}
