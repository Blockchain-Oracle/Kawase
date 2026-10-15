// The devices every landing surface shows the app in. The phone is Mitoshi's (crypto-world-fair
// web/src/features/landing/hero/PhoneFrame.tsx, from 21st.dev 20020 solaceui/phone-mockups-1 `Iphone15Pro`): the body,
// side buttons, Dynamic Island and a 390 × 844 pt screen as one SVG, the screen an HTML layer so it can hold a capture
// or a live element. The window is the web app on a desktop: a plain rounded frame with the three lights, so the capture
// is the product, not the chrome. Captures are real (apps/landing/public/app/screens, a fresh guest on
// app.getkawase.xyz, no account), AVIF with a WebP fallback. Server components; styles in `landing.css`.
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const BODY = "M2 73C2 32.6832 34.6832 0 75 0H357C397.317 0 430 32.6832 430 73V809C430 849.317 397.317 882 357 882H75C34.6832 882 2 849.317 2 809V73Z";
const BUTTONS = [
  "M0 171C0 170.448 0.447715 170 1 170H3V204H1C0.447715 204 0 203.552 0 203V171Z",
  "M1 234C1 233.448 1.44772 233 2 233H3.5V300H2C1.44772 300 1 299.552 1 299V234Z",
  "M1 319C1 318.448 1.44772 318 2 318H3.5V385H2C1.44772 385 1 384.552 1 384V319Z",
  "M430 279H432C432.552 279 433 279.448 433 280V384C433 384.552 432.552 385 432 385H430V279Z",
];
const INNER = "M6 74C6 35.3401 37.3401 4 76 4H356C394.66 4 426 35.3401 426 74V808C426 846.66 394.66 878 356 878H76C37.3401 878 6 846.66 6 808V74Z";
const ISLAND = "M154 48.5C154 38.2827 162.283 30 172.5 30H259.5C269.717 30 278 38.2827 278 48.5C278 58.7173 269.717 67 259.5 67H172.5C162.283 67 154 58.7173 154 48.5Z";
const LENS = "M249 48.5C249 42.701 253.701 38 259.5 38C265.299 38 270 42.701 270 48.5C270 54.299 265.299 59 259.5 59C253.701 59 249 54.299 249 48.5Z";

export type PhoneScreen = "home" | "markets" | "margin" | "marketplace" | "token" | "welcome";
export type DeskScreen = "desktop-home" | "desktop-longshort" | "desktop-marketplace" | "desktop-token";

/** The device at its natural 433 × 882 size; scale it with CSS (`--phone-w`), never by re-drawing. */
export function Phone({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={cn("phone", className)} role={label ? "img" : undefined} aria-label={label}>
      <svg className="phone-body" viewBox="0 0 433 882" fill="none" aria-hidden focusable="false">
        <path d={BODY} className="phone-metal" />
        {BUTTONS.map((d) => (
          <path key={d} d={d} className="phone-metal" />
        ))}
        <path d={INNER} className="phone-bezel" />
      </svg>
      <div className="phone-screen">{children}</div>
      <svg className="phone-island" viewBox="0 0 433 882" fill="none" aria-hidden focusable="false">
        <path d={ISLAND} className="phone-island-pill" />
        <path d={LENS} className="phone-island-lens" />
      </svg>
    </div>
  );
}

/** A real capture of the app: AVIF with a WebP fallback. */
export function Shot({ name, alt, eager = false, width = 780, height = 1688 }: { name: PhoneScreen | DeskScreen; alt: string; eager?: boolean; width?: number; height?: number }) {
  return (
    <picture className="shot">
      <source srcSet={`/app/screens/${name}.avif`} type="image/avif" />
      <img src={`/app/screens/${name}.webp`} alt={alt} width={width} height={height} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "auto"} />
    </picture>
  );
}

/** A phone showing one capture. */
export function PhoneShot({ name, alt, eager, className }: { name: PhoneScreen; alt: string; eager?: boolean; className?: string }) {
  return (
    <Phone className={className}>
      <Shot name={name} alt={alt} eager={eager} />
    </Phone>
  );
}

/** The web app in a desktop window: three lights, the address, the capture. */
export function Window({ name, alt, eager, className }: { name: DeskScreen; alt: string; eager?: boolean; className?: string }) {
  return (
    <div className={cn("window", className)}>
      <div className="window-bar" aria-hidden>
        <span className="window-light" />
        <span className="window-light" />
        <span className="window-light" />
        <span className="window-address">app.getkawase.xyz</span>
      </div>
      <Shot name={name} alt={alt} eager={eager} width={1600} height={1000} />
    </div>
  );
}
