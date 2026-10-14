// The HTML shell for the web build. It loads the fonts and starts in the default (dark) theme, so the
// prerendered page does not flash light before the app picks its theme.
//
// Kawase is a phone app first. A window narrower than a laptop keeps the phone layout in a centred column instead of
// stretching across the screen: the column is the containing block for everything inside it (the transform makes
// fixed and absolute layers — sheets, the dock, the fan, toasts — stay within it), and the page around it takes the
// theme's background. From Tailwind's `lg` (1024 px: a laptop, the Tauri app at 1280×820) the app uses the whole
// window with its desktop layout (Stage 13: sidebar, content column, dialogs). Mouse and keyboard: a pointer on
// everything pressable and a visible focus ring for the keyboard.
import { tokens } from "@kawase/ui-tokens";
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** Above this width the app sits in a phone-width column, up to the desktop layout's breakpoint. */
const COLUMN_BREAKPOINT_PX = 520;
const COLUMN_MAX_PX = 480;
const DESKTOP_PX = 1024;

const columnCss = `
html, body { background-color: var(--color-background, ${tokens.themes[tokens.defaultMode].background}); }
@media (min-width: ${COLUMN_BREAKPOINT_PX}px) and (max-width: ${DESKTOP_PX - 1}px) {
  body { display: flex; justify-content: center; }
  #root {
    width: 100%;
    max-width: ${COLUMN_MAX_PX}px;
    transform: translateZ(0);
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--color-border, ${tokens.themes[tokens.defaultMode].border});
  }
}
:where([role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], a[href]) {
  cursor: pointer;
}
:where([role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"])[aria-disabled="true"] {
  cursor: default;
}
:where([role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], a[href], input, textarea):focus-visible {
  outline: 2px solid var(--color-ring, ${tokens.themes[tokens.defaultMode].primary});
  outline-offset: 2px;
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
        {/* Installable web app (PWA): manifest, theme colour, home-screen icon, and an offline-page-only worker. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={tokens.themes[tokens.defaultMode].background} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js"))`,
          }}
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: columnCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
