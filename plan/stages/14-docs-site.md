# Stage 14: Docs site

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: built (2026-10-02), not deployed — `apps/docs` on branch `lane-c/docs-landing`

## Scope (from the master plan)
- `apps/docs`: Fumadocs 16 + Next 16, i18n for the 10 locales (content in en, fr, es first, then the rest), `llms.txt`, a user guide (every feature and flow), a safety/trust model, a network availability matrix (generated from the registry), architecture, an API overview, and a self-hosting/Coolify guide.
- Screenshots come from the shared `ui-web` components, so they can't drift from the product.
- Deploy.
- **Exit:** the docs are live on the Coolify domain, in multiple languages, with `/llms.txt` served.

## Docs read (2026-10-02)
- Fumadocs, current template: `create-fumadocs-app@16.2.12 --template +next+fuma-docs-mdx` scaffolded and read (Macro API
  `fumadocs-mdx/macro` in `lib/source.ts`, no `source.config.ts`; `fumadocs-ui` = `npm:@fumadocs/base-ui`; `proxy.ts`
  Markdown negotiation; llms routes).
- fumadocs.dev (as Markdown): internationalization/next, headless/internationalization/config, page-conventions (i18n
  routing, `parser: "dir"`), headless/search/orama (multilingual default), ui/translations, ui/theme (RTL), integrations/llms,
  mdx/macro. Installed sources: `llms()` (`index(lang)`, `full(lang)`), `createI18nMiddleware`, `createGetUrl(base, i18n)`,
  `uiTranslations()` keys, `default-colors.css` (base-ui 16.15.17 has no `shadcn.css`; the fd colours are re-pointed at
  the Lime on Ink tokens in `app/global.css`).
- OpenAI Responses API (`text.format: json_object` needs the word "json" in the input).

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- **2026-10-02 — built (Lane C).** `apps/docs`: Fumadocs 16.15.17 + Next 16.3.8, 10 locales from `SUPPORTED_LOCALES`
  (English unprefixed, `/<lang>/docs` for the rest, Arabic/Urdu RTL), 20 pages: what Kawase is (everything on Arc, per the
  2026-10-02 product plan), getting started, 12 feature pages, safety model, **Withdraw without Kawase**, networks,
  availability, architecture (+ public API), FAQ. Registry-driven MDX blocks (`AvailabilityMatrix`, `Status`, `ScopeList`,
  `LimitsTable`) import `CAPABILITIES` / `CAPABILITY_SCOPE` / `DEFAULT_LIMITS`; plan areas without a registry id (tokens,
  meme_coins, perps, buy, borrow, withdraw, export_wallet in `apps/docs/lib/product.ts`) show "coming" until
  `capabilities.ts` adds and ships them. Capability names come from the app's catalogs. `/llms.txt`, `/llms-full.txt` and a
  `.md` twin per page, with the blocks expanded to Markdown tables. `scripts/translate.ts` (gpt-5.6-luna, app glossary,
  structure check, source hashes) wrote all nine other languages (216/216 jobs). `next build` (416 pages), typecheck and
  lint pass. Dockerfile: standalone, `HOSTNAME=::`, port 3000, own `Dockerfile.dockerignore`.
- Not done: screenshots from `ui-web` (the plan's idea), a self-hosting guide page, an OpenAPI reference; deploy (lead).
