import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { tokens } from "@kawase/ui-tokens";

import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { links } from "@/lib/links";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(links.landing),
  title: { default: "Kawase — money that moves when you speak", template: "%s · Kawase" },
  description:
    "Kawase (為替) is a voice-first AI money app for everything on Arc: send, swap, bridge, earn and automate in ten languages, with limits enforced on chain.",
  openGraph: {
    title: "Kawase — money that moves when you speak",
    description: "A voice-first AI money app for everything on Arc, in ten languages, with on-chain limits.",
    type: "website",
    siteName: "Kawase",
    // The README banner at 1200×600: real captures of the app, composed (provenance in .github/assets).
    images: [{ url: "/og.png", width: 1200, height: 600, alt: "Kawase: money that moves when you speak" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: tokens.story.ink,
  colorScheme: "dark light",
};

// Applies a remembered light theme before the first paint (ink is the default).
const THEME_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light")document.documentElement.classList.remove("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The token file's one font stylesheet, shared with the web app. */}
        <link rel="stylesheet" href={tokens.fonts.googleFontsHref} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <div className="pt-4">
          <SiteHeader />
        </div>
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
