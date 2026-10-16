// The docs' 404 for every address they don't have (Abu, 10-16: "our custom 404… everywhere"). The root layout lives
// under [lang], so Next sends unmatched addresses here and skips the layouts: this page brings its own document, the
// docs' styles and fonts, and the provider the search button needs. NotFoundPage reads the reader's language from the
// address.
import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import { tokens } from "@kawase/ui-tokens";

import { NotFoundPage } from "@/components/not-found-page";
import "./global.css";

export const metadata: Metadata = { title: "Nothing here · Kawase docs", robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={tokens.fonts.googleFontsHref} />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: "dark" }}>
          <NotFoundPage />
        </RootProvider>
      </body>
    </html>
  );
}
