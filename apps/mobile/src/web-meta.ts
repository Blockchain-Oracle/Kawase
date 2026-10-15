// What a browser tab, a bookmark and a shared link say about the web app: the landing's own words. The HTML shell
// (+html.tsx) puts them in the prerendered page; the root layout keeps the title once the app has loaded (Expo Router
// leaves document titles to `expo-router/head`, so without it the tab goes blank after hydration).
export const WEB_TITLE = "Kawase — money that moves when you speak";
export const WEB_DESCRIPTION = "A voice-first AI money app for everything on Arc, in ten languages, with on-chain limits.";
