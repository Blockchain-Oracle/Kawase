import type { MetadataRoute } from "next";

import { links } from "@/lib/links";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${links.landing}/sitemap.xml` };
}
