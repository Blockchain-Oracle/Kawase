// The HTML shell for the web build. It loads the fonts and starts in the default (dark) theme, so the
// prerendered page does not flash light before the app picks its theme.
//
// Kawase is a phone app first; on a laptop (most judges, D10) the app keeps its phone layout in a centred column
// instead of stretching across the screen. The column is the containing block for everything inside it (the
// transform makes fixed and absolute layers — sheets, the dock, the fan, toasts — stay within it), and the page
// around it takes the theme's background.
import { tokens } from "@kawase/ui-tokens";
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** Above this width the app sits in a phone-width column. */
const COLUMN_BREAKPOINT_PX = 520;
const COLUMN_MAX_PX = 480;

const columnCss = `
html, body { background-color: var(--color-background, ${tokens.themes.dark.background}); }
@media (min-width: ${COLUMN_BREAKPOINT_PX}px) {
  body { display: flex; justify-content: center; }
  #root {
    width: 100%;
    max-width: ${COLUMN_MAX_PX}px;
    transform: translateZ(0);
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--color-border, ${tokens.themes.dark.border});
  }
}
`;

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
        <style dangerouslySetInnerHTML={{ __html: columnCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
