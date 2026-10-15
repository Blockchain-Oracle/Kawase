// The first screen (10-15 rebuild): the README banner as a page, the owner's favourite ("money that speaks, the way
// this is on the left"). The copy on the left in the banner's type (Roboto Condensed Black, one magenta word), the
// product on the right in 3D (`HeroStage`), the magenta light low behind it. It says what Kawase is in one breath (every
// money app on Arc, in one you talk to), and that it runs on iPhone, Android and the web, with both ways in: the web
// app now, the phone apps on /download.
import { ArrowRight } from "lucide-react";

import { Mark } from "@kawase/ui-web/components/mark";

import { ENTITY } from "@/lib/capabilities";
import { links } from "@/lib/links";

import { AndroidGlyph, AppleGlyph } from "./glyphs";
import { HeroStage } from "./hero-stage";

export const BUTTON_PRIMARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-background transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const BUTTON_SECONDARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const CHIPS = ["Arc", "Circle USDC", "CCTP", "x402", "10 languages"];

export function Hero() {
  return (
    <section className="lp-glow relative overflow-hidden" aria-labelledby="hero-title">
      <div className="lp-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-4 lg:pt-20 lg:pb-28">
        <div className="max-w-[660px]">
          <a href="/live" className="lp-chip inline-flex items-center gap-2 rounded-full py-1.5 ps-2 pe-3.5 text-[13px] font-medium text-foreground">
            <span className="lp-live" aria-hidden />
            Live on
            <Mark entity={ENTITY.arc} size={18} />
            <span className="font-semibold">Arc</span>
            <span className="text-muted-foreground">· mainnet and testnet</span>
          </a>

          <h1 id="hero-title" className="mt-7 font-display text-[clamp(50px,5.7vw,86px)] leading-[0.95] font-black tracking-[-0.01em] text-foreground">
            <span className="whitespace-nowrap">Money that moves</span>
            <br />
            when you <span className="text-accent">speak</span>.
          </h1>

          <p className="mt-7 max-w-[560px] text-[19px] leading-[1.5] text-[var(--lp-ink-soft)] sm:text-[21px]">
            Every money app on Arc, in one you talk to. Swap, bridge, earn, go long or short, buy any token, pay for AI
            tools and automate it all. Ask in your language: Kawase races every route and acts inside limits you sign on
            chain.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a href={links.webApp} className={BUTTON_PRIMARY}>
              Open the app <ArrowRight className="size-4" aria-hidden />
            </a>
            <a href="/download" className={BUTTON_SECONDARY}>
              <AppleGlyph className="size-[17px]" />
              <AndroidGlyph className="h-[11px] w-auto" />
              Get it on your phone
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            No sign-up to look around. iPhone, Android and the web, one account on all three.
          </p>

          <ul className="mt-9 flex flex-wrap gap-2.5" aria-label="Built with">
            {CHIPS.map((chip) => (
              <li key={chip} className="lp-chip rounded-full px-4 py-2 text-[15px] font-semibold text-foreground">
                {chip}
              </li>
            ))}
          </ul>
        </div>

        <HeroStage />
      </div>
    </section>
  );
}
