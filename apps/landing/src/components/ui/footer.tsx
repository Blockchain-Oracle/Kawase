// Source: 21st.dev ln-dev7/footer-17 "Minimal Two-Column Footer" (https://21st.dev/@ln-dev7/components/footer-17).
// Changes for Kawase: brand, tagline, links and the bottom line come from props (the sample brand and links are
// gone); uppercase letter-spaced labels stay Latin-only (DESIGN.md: never letter-space other scripts).
import type React from "react";

export type FooterLink = { label: string; href: string };

export function Footer({
  brand,
  tagline,
  note,
  links,
  bottomStart,
  bottomEnd,
}: {
  brand: React.ReactNode;
  tagline: string;
  note?: string;
  links: readonly FooterLink[];
  bottomStart: React.ReactNode;
  bottomEnd?: React.ReactNode;
}) {
  return (
    <footer className="bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-4">
            {brand}
            <p className="max-w-[280px] text-sm leading-relaxed text-muted-foreground">{tagline}</p>
            {note ? (
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{note}</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Navigate</h4>
            <ul className="grid grid-cols-2 gap-x-10 gap-y-2 sm:grid-cols-1">
              {links.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-foreground/80 transition-colors hover:text-foreground">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
          <div>{bottomStart}</div>
          {bottomEnd ? <div className="font-mono uppercase tracking-widest">{bottomEnd}</div> : null}
        </div>
      </div>
    </footer>
  );
}
