# Documentation site: framework choice (product + developer docs, self-hosted on Coolify)

Purpose: pick the docs framework for D20 (docs site + showcase) that deploys to Abu's Coolify server (D18), handles EN/FR/ES and other top languages (D4), and looks consistent with the 21st/shadcn web UI (D19).

Sources:
- npm registry, 2026-09-29: `.firecrawl/product/14/npm-versions-2026-09-29.tsv`, `npm-disttags-peers.txt`, `npm-docs-plugins.tsv`
- GitHub API repo activity (stars, `pushed_at`), 2026-09-29 (commands in this session; values below)
- Fumadocs docs (saved `.mdx` under `.firecrawl/product/14/docs-fw/`): https://fumadocs.dev/llms.txt, /docs/internationalization, /docs/headless/internationalization/config, /docs/ui/translations, /docs/ui/theme, /docs/search/orama, /docs/headless/search/orama, /docs/deploying/static, /docs/integrations/llms, /docs/integrations/openapi; RTL issues search `fuma-rtl-issues.json`
- Starlight i18n: https://starlight.astro.build/guides/i18n/
- Nextra i18n: https://nextra.site/docs/guide/i18n
- Docusaurus i18n: https://docusaurus.io/docs/i18n/introduction
- VitePress: https://vitepress.dev/llms.txt (`docs-fw/vitepress.dev.llms.txt`), npm deps
- Mintlify: https://www.mintlify.com/docs/llms.txt, https://www.mintlify.com/docs/api/static-export/overview.md, https://www.mintlify.com/pricing (`docs-fw/mintlify-notes.txt`)

Verified: 2026-09-29

---

## 1. Versions and activity [VERIFIED]

| Framework | Package / latest | Last npm publish | Repo (★, last push) | Runtime |
|---|---|---|---|---|
| **Fumadocs** | `fumadocs-core` / `fumadocs-ui` 16.15.16; `fumadocs-mdx` 15.4.5; `fumadocs-openapi` 12.1.0; `@fumadocs/cli` 1.7.0 | 2026-09-29 | fuma-nama/fumadocs 13.3k, 2026-09-29 | Next.js 16 (peer `next 16.x`), also React Router 7/8, TanStack Start, Waku (peers) |
| **Nextra** | `nextra` / `nextra-theme-docs` 4.6.1 | **2025-12-04** | shuding/nextra 13.9k, 2026-07-31 | Next.js (peer `next >=14`) |
| **Astro Starlight** | `@astrojs/starlight` 0.42.4 (astro 7.3.5) | 2026-09-24 | withastro/starlight 9.3k, 2026-09-28 | Astro (static by default) |
| **Docusaurus** | `@docusaurus/core` 3.10.2 | 2026-09-25 | facebook/docusaurus 66.4k, 2026-09-25 | React 18/19 SPA + SSG |
| **VitePress** | `vitepress` 1.6.4 (2.0.0-alpha.20 on `next`) | 2026-09-04 | vuejs/vitepress 18.4k, 2026-09-26 | **Vue** (`vue ^3.5.13` dependency) |
| **Mintlify** | `mint` CLI 4.2.949 | 2026-09-29 | hosted SaaS | Hosted; self-hosting is Enterprise only (below) |

## 2. Capability comparison

| | Fumadocs | Nextra 4 | Starlight | Docusaurus | VitePress | Mintlify |
|---|---|---|---|---|---|---|
| **i18n** | Yes: i18n routing per framework; `hideLocale`; `fallbackLanguage` for missing translations; official UI **language packs** [VERIFIED docs]. "Fumadocs is not a full-powered i18n library" for the rest of the app [VERIFIED] | Yes via Next i18n + optional middleware; **"will not work for i18n sites that are statically exported with `output: 'export'`"** [VERIFIED] | Strongest: `locales` + `defaultLocale`; falls back to default-language content; built-in UI strings for 30+ languages incl. Arabic, Hindi, Chinese, Japanese, Spanish, French [VERIFIED] | Yes; each locale "builds as a separate site"; Crowdin flow; no auto locale detection [VERIFIED] | Yes (built-in `locales`) [not re-verified here] | Yes: "How to set up multi-language documentation"; "AI translations" are a paid line item [VERIFIED llms.txt + pricing] |
| **RTL** | Yes: "RTL (Right-to-left) layout is supported", `dir="rtl"` on body + RootProvider [VERIFIED ui/theme]. Past RTL bugs fixed (#3243 closed 2026-05, #2603 closed 2025-11) [VERIFIED] | `direction: 'rtl'` [VERIFIED] | "full right-to-left (RTL) language support" via `dir: 'rtl'` [VERIFIED] | Yes [VERIFIED] | [not checked] | [not checked] |
| **Search** | Built-in (ZBSearch/Orama): `multilingual` mode "works with every language out of the box", "all locales (including Chinese and Japanese) share a single search database"; no stemming unless you add a tokenizer. Static mode or server API. Also Algolia, Typesense, Orama Cloud, Mixedbread, Trieve [VERIFIED] | Built-in (engine not stated on the i18n page) [UNKNOWN] | Pagefind (static), localized UI [VERIFIED] | Algolia DocSearch or community local plugin (`@easyops-cn/docusaurus-search-local` 0.55.3) [VERIFIED npm] | built-in local search [not re-verified] | Hosted search |
| **MDX + React components** | MDX; any React component (so 21st/shadcn components render in docs natively) [INFERENCE from Next/React] | MDX, React | MDX + Astro; React via `@astrojs/react` 7.0.0 islands [VERIFIED npm] | MDX, React | Markdown + **Vue** components (21st React components don't drop in) [INFERENCE] | MDX with Mintlify's built-in components; custom React is limited ("Custom component" row varies by plan) [REPORTED pricing page] |
| **OpenAPI** | `fumadocs-openapi` 12.1.0: `generateFiles()`, `createOpenAPIPage()`, plus AsyncAPI and GraphQL [VERIFIED] | [not found] | `starlight-openapi` 0.26.3 [VERIFIED npm] | `docusaurus-plugin-openapi-docs` 5.2.0 [VERIFIED npm] | [not found] | Native OpenAPI + API playground [VERIFIED llms.txt] |
| **AI / llms.txt** | First-party: `llms.txt`, `llms-full.txt`, per-page `*.md`, `Accept` negotiation, page actions, an **MCP server** ("Expose documentation search and Markdown content as MCP tools"), WebMCP, "Ask AI" [VERIFIED `fuma-integrations-llms.mdx`] | [not found first-party] | `starlight-llms-txt` 0.12.0 plugin [VERIFIED npm] | `docusaurus-plugin-llms` 0.6.0 (community) [VERIFIED npm] | `vitepress-plugin-llms` 1.14.0 [VERIFIED npm] | Built-in llms.txt / llms-full.txt and an MCP server [VERIFIED llms.txt] |
| **Theming with the app** | `fumadocs-ui` is Tailwind v4 only. **"For Shadcn UI, you can use the `shadcn` preset instead. Fumadocs UI will adopt colors from your Shadcn UI theme."** (`@import 'fumadocs-ui/css/shadcn.css'`) [VERIFIED ui/theme] | Own theme | Tailwind via `@astrojs/starlight-tailwind` 5.0.0 [VERIFIED npm] | Infima CSS vars | Vue theme | Mintlify theme config |
| **Self-host on Coolify** | Node server (default "server-first") or `output: 'export'` static build with static search index [VERIFIED `deploying/static`] | Node server; static export breaks i18n [VERIFIED] | Static files | Static files | Static files | **Self-hosting: Enterprise only**; static export "is in private beta and requires an enterprise agreement" [VERIFIED] |

## 3. Recommendation [INFERENCE]

**Fumadocs 16 on Next.js 16**, deployed to Coolify as a Node container (keeps i18n middleware, the search API, and the llms/MCP routes). Static export is the fallback if a container isn't wanted.

Why:
1. **Visual consistency with D19.** It is the only candidate whose UI consumes the **shadcn theme tokens directly** (the `shadcn` preset). The docs, landing page and web app can share one token CSS file and render the same 21st/shadcn components inside MDX. That includes live genUI-card previews in developer docs, rendered from the web registry.
2. **Multilingual.** i18n routing + fallback language + official language packs + RTL + multilingual search in one index.
3. **Developer docs.** First-party OpenAPI generation for the backend API, TypeScript docgen, and AI surfaces (`llms.txt`, `llms-full.txt`, `.md` twins, an MCP server) that judges' and users' agents can read.
4. **Showcase can live in the same Next app** (landing + docs in one deployable), built with premium-ui / 21st sections.
5. **Actively maintained**: published today (2026-09-29).

Why not the others:
- **Starlight** is the strongest pure-i18n choice (30+ built-in UI languages, content fallback, Pagefind). It is the **runner-up**, and the right pick if the team wants a zero-server static site above all. Cost: an Astro stack beside the React stack, and theming only via the Tailwind plugin, not the shadcn tokens directly.
- **Nextra 4**: no npm release since 2025-12-04, and i18n doesn't work with static export.
- **Docusaurus**: mature, but per-locale separate builds, own CSS system (Infima), and no shadcn token path.
- **VitePress**: Vue, so the React/21st components can't be reused.
- **Mintlify**: hosted; self-hosting and static export are Enterprise-only. That conflicts with D18.

## 4. Build notes [INFERENCE]
- One `@repo/tokens` CSS (see `recommendation.md` §3) imported by the docs app before `fumadocs-ui/css/shadcn.css` and `preset.css`.
- Locales: start with `en`, `fr`, `es`; add the other D4 languages as translations land (fallback covers gaps). The app and docs should share the language list constant (D21: no magic values).
- Split sections: Product docs (users: getting started, network toggle, contacts, automations, limits, voice) and Developer docs (architecture, API via `fumadocs-openapi`, agent tools and genUI catalog reference).
- Enable `llms.txt` + `llms-full.txt` + MCP routes. They are cheap and match the "agent-readable" theme of the hackathon.
- Coolify specifics (Dockerfile vs Nixpacks, domains, HTTPS) belong to `../13-deployment-coolify/`.

## 5. Gaps
- VitePress and Mintlify RTL and search details were not re-verified.
- Nextra's current search engine was not confirmed from its docs.
- No hands-on build of Fumadocs + i18n + static search was done.
