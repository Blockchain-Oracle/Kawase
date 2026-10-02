import type { Metadata, Viewport } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import { i18nProvider } from "fumadocs-ui/i18n";
import { tokens } from "@kawase/ui-tokens";

import { directionOf, i18n } from "@/lib/i18n";
import { translations } from "@/lib/layout.shared";
import { links } from "@/lib/shared";
import "../global.css";

export const metadata: Metadata = {
  metadataBase: new URL(links.docs),
  title: { default: "Kawase docs", template: "%s · Kawase docs" },
  description: "Kawase is an AI money app for everything on Arc: ask by voice or text in ten languages, with on-chain limits.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: tokens.story.ink },
    { media: "(prefers-color-scheme: light)", color: "#F7F8F4" },
  ],
};

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export default async function Layout({ params, children }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  const dir = directionOf(lang);
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={tokens.fonts.googleFontsHref} />
      </head>
      <body dir={dir} className="flex min-h-screen flex-col">
        <RootProvider dir={dir} i18n={i18nProvider(translations, lang)} theme={{ defaultTheme: "dark" }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
