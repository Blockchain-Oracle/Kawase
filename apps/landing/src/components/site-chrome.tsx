// The header and footer every page shares: the glass header (one lime action: open the web app) and the footer.
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { FloatingHeader } from "@/components/ui/floating-header";
import { Footer } from "@/components/ui/footer";
import { NAV, links } from "@/lib/links";

export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SiteHeader() {
  return (
    <div className="px-4">
      <FloatingHeader
        brand={<Brand />}
        links={NAV}
        extra={<ThemeToggle />}
        action={
          <a href={links.webApp} className={PRIMARY_BUTTON}>
            Open the web app
          </a>
        }
      />
    </div>
  );
}

export function SiteFooter() {
  return (
    <Footer
      brand={<Brand />}
      tagline="The AI money app for everything on Arc. Speak or type in your language; your limits live on chain."
      note="為替 · Built on Arc"
      links={[
        { label: "Web app", href: links.webApp },
        { label: "Docs", href: links.docs },
        { label: "Demo and evidence", href: "/demo" },
        { label: "Live counts", href: "/live" },
        { label: "Source on GitHub", href: links.github },
      ]}
      bottomStart={<p>Kawase is a hackathon build for the Tameion Agents Hackathon. Testnet money has no value.</p>}
      bottomEnd="Arc · Circle"
    />
  );
}
