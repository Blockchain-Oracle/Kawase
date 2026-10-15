// The last call (Mitoshi's LandingFinal): Kawase in your pocket, every way in at once: the badges (iPhone's honest
// state, the Android APK, the browser), the QR to /download for a phone in the other hand, and two phones on the
// magenta light. The release is read live by the caller (the TestFlight gate).
import { links } from "@/lib/links";
import type { StoreRelease } from "@/lib/release";

import { PhoneShot } from "./devices";
import { QrPlate, StoreBadges } from "./stores";

export function GetApp({ release }: { release: StoreRelease }) {
  return (
    <section id="get" className="scroll-mt-24 px-5 py-24 sm:px-8 sm:py-32" aria-labelledby="get-title">
      <div className="lp-glow lp-tile relative mx-auto max-w-7xl overflow-hidden rounded-[40px] border border-border">
        <div className="lp-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-16">
          <div>
            <h2 id="get-title" className="font-display text-[clamp(44px,4.8vw,70px)] leading-[0.96] font-black tracking-[-0.01em] text-foreground">
              Kawase, in your <span className="text-accent">pocket</span>.
            </h2>
            <p className="mt-5 max-w-[520px] text-[19px] leading-[1.5] text-[var(--lp-ink-soft)]">
              On iPhone, on Android, or right here in the browser. One account on all three, and free test USDC to try
              everything first.
            </p>
            <StoreBadges release={release} className="mt-9" />
            <p className="mt-4 text-sm text-muted-foreground">
              Android installs the APK directly; your phone asks once to allow it.{" "}
              <a href="/download" className="font-semibold text-foreground underline underline-offset-4">
                Every way to install
              </a>
            </p>
          </div>
          <div className="relative hidden items-end gap-6 lg:flex">
            <QrPlate url={`${links.landing}/download`} caption="Point your phone's camera here" />
            <div className="relative -mb-16 flex">
              <PhoneShot name="margin" alt="" className="[--phone-w:190px] -rotate-6" />
              <PhoneShot name="marketplace" alt="" className="-ms-14 mt-10 [--phone-w:190px] rotate-6" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
