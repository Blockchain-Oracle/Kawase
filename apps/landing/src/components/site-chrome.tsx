// The header and footer every page shares. The glass header: the sections, the theme, "Get the app" (the phones) and the
// one primary action, opening the web app. The footer (10-15 rebuild): where everything is, then Kawase 為替 set huge
// across the page, the way Mitoshi's ends.
import { Mark } from "@kawase/ui-web/components/mark";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { FloatingHeader } from "@/components/ui/floating-header";
import { ENTITY } from "@/lib/capabilities";
import { NAV, links } from "@/lib/links";

export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SiteHeader() {
  return (
    <div className="px-4">
      <FloatingHeader
        brand={<Brand />}
        links={[...NAV, { label: "Get the app", href: "/download" }]}
        extra={<ThemeToggle />}
        action={
          <a href={links.webApp} className={PRIMARY_BUTTON}>
            Open the app
          </a>
        }
      />
    </div>
  );
}

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Open the web app", href: links.webApp },
      { label: "Get the app", href: "/download" },
      { label: "What's inside", href: "/#inside" },
      { label: "Safety", href: "/#safety" },
    ],
  },
  {
    title: "Proof",
    links: [
      { label: "Demo and evidence", href: "/demo" },
      { label: "Live counts", href: "/live" },
      { label: "Source on GitHub", href: links.github },
      { label: "Follow on X", href: links.x },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Docs", href: links.docs },
      { label: "How it works", href: "/#tour" },
      { label: "Availability", href: `${links.docs}/docs/availability` },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
          <div className="flex flex-col gap-4">
            <Brand />
            <p className="max-w-[300px] text-[15px] leading-relaxed text-muted-foreground">
              Every money app on Arc, in one you talk to. Your limits live on chain.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{column.title}</h2>
              <ul className="mt-4 grid gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-[15px] text-foreground/80 transition-colors hover:text-foreground">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>A Tameion Agents Hackathon build. Testnet money has no value; nothing here is investment advice.</p>
          <p className="inline-flex items-center gap-2 font-mono tracking-widest uppercase">
            Built on <Mark entity={ENTITY.arc} size={16} /> Arc · <Mark entity={ENTITY.circle} size={16} /> Circle
          </p>
        </div>
      </div>

      {/* The name, set across the page. */}
      <div className="pointer-events-none mt-10 select-none" aria-hidden>
        <p className="mx-auto flex max-w-7xl items-baseline justify-center gap-[2.5vw] px-5 pb-6 font-display text-[clamp(84px,17vw,260px)] leading-[0.8] font-black tracking-[-0.02em] whitespace-nowrap text-foreground/[0.06] sm:px-8">
          Kawase<span className="text-[0.42em] text-accent/30">為替</span>
        </p>
      </div>
    </footer>
  );
}
