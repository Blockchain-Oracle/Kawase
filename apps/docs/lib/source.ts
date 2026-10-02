import { llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";

import { i18n } from "./i18n";
import { expandRegistryBlocks } from "./registry-markdown";
import { docsRoute } from "./shared";

const docs = defineDocs({
  dir: "content/docs",
  docs: {
    // `sourceHash` is written by scripts/translate.ts: the English file a translation was made from.
    schema: pageSchema.extend({ sourceHash: z.string().optional() }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api
export const source = loader({
  i18n,
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

// llms.txt / llms-full.txt / per-page Markdown. The registry-driven MDX blocks become Markdown tables here, so an
// agent reading the docs gets the same availability matrix a person sees.
export const docsLlms = llms(source, {
  renderPage: async (page) =>
    `# ${page.data.title} (${page.url})\n\n${expandRegistryBlocks(await page.data.getText("processed"), page.locale ?? i18n.defaultLanguage)}`,
});
