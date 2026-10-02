import { createGetUrl } from "fumadocs-core/source";
import { PUBLIC_LINKS } from "@kawase/config";

import { i18n } from "./i18n";

export const appName = "Kawase";
export const docsRoute = "/docs";
export const docsContentRoute = "/llms.mdx/docs";

/** Public, overridable at build time for a fork or a renamed deployment. */
export const links = {
  webApp: process.env.NEXT_PUBLIC_WEB_APP_URL ?? PUBLIC_LINKS.webApp,
  landing: process.env.NEXT_PUBLIC_LANDING_URL ?? PUBLIC_LINKS.landing,
  docs: process.env.NEXT_PUBLIC_DOCS_URL ?? PUBLIC_LINKS.docs,
  github: PUBLIC_LINKS.github,
  androidApk: PUBLIC_LINKS.androidApk,
  testFlight: process.env.NEXT_PUBLIC_TESTFLIGHT_URL ?? PUBLIC_LINKS.testFlight,
} as const;

export const gitConfig = { repo: PUBLIC_LINKS.github, branch: "main", contentDir: "apps/docs/content/docs" } as const;

// English twins live at /llms.mdx/docs/…, the others at /<lang>/llms.mdx/docs/… (same rule as page URLs).
const getContentUrl = createGetUrl(docsContentRoute, i18n);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];
  return { segments, url: getContentUrl(segments, page.locale) };
}
