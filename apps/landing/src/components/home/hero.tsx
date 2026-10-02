// The first screen: the promise, the orb, and one way in (the web app as a guest, no sign-up).
import { ArrowRight } from "lucide-react";

import { SUPPORTED_LOCALES } from "@kawase/config";
import { isRtlLocale } from "@kawase/i18n";

import { Orb } from "@/components/orb";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/site-chrome";
import { links } from "@/lib/links";

/** The same request in four of the ten languages, as someone would say it. */
const SPOKEN = [
  { lang: "en", text: "Send 20 dollars to @amina" },
  { lang: "fr", text: "Envoie 20 dollars à @amina" },
  { lang: "hi", text: "@amina को 20 डॉलर भेजो" },
  { lang: "ar", text: "أرسل 20 دولارًا إلى @amina" },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-20 sm:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            為替 · The AI money app for everything on Arc
          </p>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Money that moves when you speak
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Ask Kawase by voice or by text in {SUPPORTED_LOCALES.length} languages. It drafts the payment, the swap or
            the bridge as a card; you approve; and the limits you set are enforced by the chain, not by a promise.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href={links.webApp} className={PRIMARY_BUTTON}>
              Try it as a guest
              <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </a>
            <a href="/demo" className={SECONDARY_BUTTON}>
              See it on chain
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No sign-up to try: chat as a guest, then sign in when you want a wallet of your own.
          </p>
          <ul className="mt-10 flex flex-wrap gap-2" aria-label="Examples of what you can say">
            {SPOKEN.map((line) => (
              <li
                key={line.lang}
                lang={line.lang}
                dir={isRtlLocale(line.lang) ? "rtl" : "ltr"}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground/90"
              >
                “{line.text}”
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[420px]">
          <div className="stipple absolute inset-[8%] rounded-full opacity-60" aria-hidden />
          <Orb network="mainnet" />
        </div>
      </div>
    </section>
  );
}
