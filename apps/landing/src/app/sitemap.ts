import type { MetadataRoute } from "next";

import { links } from "@/lib/links";

const PAGES = ["", "/download", "/demo", "/live"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: `${links.landing}${path}` }));
}
