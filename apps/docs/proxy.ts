// Two jobs, in order: (1) serve a page's Markdown twin for `/docs/page.md` or an `Accept: text/markdown` request
// (agents and LLM tools), and (2) the i18n routing: English has no prefix, the other nine languages do.
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";

import { i18n } from "@/lib/i18n";

const i18nProxy = createI18nMiddleware(i18n);
const markdownTwin = `/:lang/llms.mdx/docs{/*path}/content.md`;

const suffixed = rewritePath("/:lang/docs{/*path}.md", markdownTwin);
const negotiated = rewritePath("/:lang/docs{/*path}", markdownTwin);

const isLanguage = (lang: string | undefined): boolean => lang !== undefined && i18n.languages.includes(lang as never);

/** Puts the default language in front of unprefixed paths, so the compiled twin always has a `:lang`. */
function withLanguage(pathname: string): string {
  const first = pathname.split("/")[1];
  return isLanguage(first) ? pathname : `/${i18n.defaultLanguage}${pathname}`;
}

function rewriteTo(request: NextRequest, rule: typeof suffixed, varyOnAccept: boolean) {
  const target = rule.rewrite(withLanguage(request.nextUrl.pathname));
  if (!target) return undefined;
  // This URL has two representations, selected by `Accept`.
  return NextResponse.rewrite(new URL(target, request.nextUrl), varyOnAccept ? { headers: { Vary: "Accept" } } : undefined);
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return (
    rewriteTo(request, suffixed, false) ??
    (isMarkdownPreferred(request) ? rewriteTo(request, negotiated, true) : undefined) ??
    i18nProxy(request, event)
  );
}

export const config = {
  // Everything except Next's assets, the search api, the llms files, the docs' captures and clips (public/media), and
  // static files with an extension (but `.md` twins of docs pages do pass).
  matcher: ["/((?!api|_next/static|_next/image|media/|llms\\.txt|llms-full\\.txt|.*\\.(?:ico|svg|png|jpg|webp|mp4|txt|xml|json)$).*)"],
};
