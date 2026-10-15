// The ways to get Kawase, as tactile two-line badges (Mitoshi's StoreBadges, from 21st.dev 8280
// efferd/app-store-button: the mark beside a small line and a name). iPhone links to TestFlight only while Apple's join
// page takes testers (`server/store-release.ts`); until then the badge keeps its mark and name with its honest state
// ("In Apple's review") and no link, so nobody lands on a dead end. Android is the APK itself. The web app is always one
// tap away. Plus the QR plate, drawn on the server. Server components.
import { Globe } from "lucide-react";
import type { ReactNode } from "react";

import { links } from "@/lib/links";
import { qrSvg } from "@/lib/qr";
import type { StoreRelease } from "@/lib/release";
import { cn } from "@/lib/utils";

import { AndroidGlyph, AppleGlyph } from "./glyphs";

function Badge({ href, glyph, kicker, name, tone, download }: { href: string | null; glyph: ReactNode; kicker: string; name: string; tone: "ink" | "paper"; download?: boolean }) {
  const face = (
    <>
      <span className="flex size-7 items-center justify-center" aria-hidden>
        {glyph}
      </span>
      <span className="flex flex-col items-start leading-none">
        <small className="text-[11px] font-semibold tracking-wide uppercase opacity-70">{kicker}</small>
        <b className="mt-1 text-[19px] font-semibold">{name}</b>
      </span>
    </>
  );
  const className = cn(
    "inline-flex h-[60px] items-center gap-3 rounded-[18px] ps-4 pe-5 transition-transform duration-150",
    tone === "ink" ? "bg-foreground text-background" : "border border-border bg-card text-foreground",
    href ? "hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" : "cursor-default opacity-80",
  );
  if (!href) {
    return (
      <span className={className} role="note" aria-label={`${name}: ${kicker}`}>
        {face}
      </span>
    );
  }
  return (
    <a href={href} className={className} {...(download ? { download: "" } : {})}>
      {face}
    </a>
  );
}

export function IosBadge({ release }: { release: StoreRelease }) {
  return (
    <Badge
      href={release.testflight}
      glyph={<AppleGlyph className="size-6" />}
      kicker={release.testflight ? "Join the beta on" : release.inReview ? "In Apple's review" : "Coming to"}
      name={release.testflight ? "TestFlight" : "iPhone"}
      tone="ink"
    />
  );
}

export function AndroidBadge({ release }: { release: StoreRelease }) {
  return <Badge href={release.apk} glyph={<AndroidGlyph className="h-[15px] w-auto" />} kicker="Download the" name="Android APK" tone="paper" download />;
}

export function WebBadge() {
  return <Badge href={links.webApp} glyph={<Globe className="size-6" />} kicker="Open it in your" name="Browser" tone="paper" />;
}

export function StoreBadges({ release, className }: { release: StoreRelease; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)} role="group" aria-label="Get Kawase">
      <IosBadge release={release} />
      <AndroidBadge release={release} />
      <WebBadge />
    </div>
  );
}

/** A QR code on a white plate, with what it opens written under it. */
export async function QrPlate({ url, caption, size = 168, className }: { url: string; caption: string; size?: number; className?: string }) {
  const svg = await qrSvg(url);
  return (
    <figure className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="lp-qr rounded-[20px] bg-white p-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.25)]" style={{ width: size }} role="img" aria-label={`QR code: ${caption}`}>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <figcaption className="max-w-[200px] text-center text-[13px] leading-snug text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
