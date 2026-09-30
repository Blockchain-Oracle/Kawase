// The HTML shell for the web build. It loads the fonts and starts in the default (dark) theme, so the
// prerendered page does not flash light before the app picks its theme.
import { tokens } from "@kawase/ui-tokens";
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" className={tokens.defaultMode}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={tokens.fonts.googleFontsHref} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
