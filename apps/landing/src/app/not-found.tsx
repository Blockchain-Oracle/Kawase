// The landing's 404 (Abu, 10-16: "our custom 404 page… everywhere"): the banner's composition — paper, the magenta
// light, a condensed black headline with one magenta word — with Kawase's receipt slip voided beside it, and the ways
// on: the app, home, the docs. Next serves it with a 404 status inside the site's header and footer.
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/landing/hero";
import { VoidSlip } from "@/components/landing/void-slip";
import { links } from "@/lib/links";

export const metadata: Metadata = { title: "Nothing here", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="lp-glow relative overflow-hidden" aria-labelledby="not-found-title">
      <div className="lp-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pt-16 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-24">
        <div className="max-w-[600px]">
          <p className="text-[14px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">404</p>
          <h1 id="not-found-title" className="mt-3 font-display text-[clamp(52px,8vw,104px)] leading-[0.94] font-black tracking-[-0.01em] text-foreground">
            Nothing <span className="text-accent">moved</span>.
          </h1>
          <p className="mt-6 text-[20px] leading-[1.5] text-[var(--lp-ink-soft)]">
            There's no page at this address, and nothing left anyone's wallet. Here's where you were probably going.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={links.webApp} className={BUTTON_PRIMARY}>
              Open Kawase <ArrowUpRight className="size-4" aria-hidden />
            </a>
            <a href="/" className={BUTTON_SECONDARY}>
              Home
            </a>
            <a href={links.docs} className={BUTTON_SECONDARY}>
              Docs
            </a>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <VoidSlip stub="Paid on Arc with Kawase · getkawase.xyz" />
        </div>
      </div>
    </section>
  );
}
