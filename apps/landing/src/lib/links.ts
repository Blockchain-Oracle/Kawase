// Where the landing sends people. Defaults come from @kawase/config (PUBLIC_LINKS); each can be overridden at build
// time for a renamed deployment. TestFlight stays null until a public link exists, and the page says "invite only".
import { PUBLIC_LINKS } from "@kawase/config";

export const links = {
  webApp: process.env.NEXT_PUBLIC_WEB_APP_URL ?? PUBLIC_LINKS.webApp,
  docs: process.env.NEXT_PUBLIC_DOCS_URL ?? PUBLIC_LINKS.docs,
  landing: process.env.NEXT_PUBLIC_LANDING_URL ?? PUBLIC_LINKS.landing,
  github: PUBLIC_LINKS.github,
  x: PUBLIC_LINKS.x,
  androidApk: PUBLIC_LINKS.androidApk,
  /** The desktop preview for Apple-silicon Macs (not notarized yet; every surface says so next to the link). */
  desktopMac: PUBLIC_LINKS.desktopMac,
  testFlight: process.env.NEXT_PUBLIC_TESTFLIGHT_URL ?? PUBLIC_LINKS.testFlight,
  demoVideo: process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? PUBLIC_LINKS.demoVideo,
  /** Server-side only: where /live reads the public counts. */
  api: process.env.KAWASE_API_URL ?? PUBLIC_LINKS.api,
} as const;

export const NAV = [
  { label: "Inside", href: "/#inside" },
  { label: "How it works", href: "/#tour" },
  { label: "Safety", href: "/#safety" },
  { label: "Demo", href: "/demo" },
  { label: "Docs", href: links.docs },
] as const;
