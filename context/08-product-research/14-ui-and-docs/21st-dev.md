# 21st.dev: what it is, how it works, and how it maps to React Native / Expo

Purpose: explain 21st.dev (catalog, CLI, registry, themes, 21st AI, the skill workflow) and answer the key question for D19: **21st components are React DOM + Tailwind + shadcn. How do they reach iOS/Android (Expo) as well as web?**

Sources:
- 21st CLI help and account state, run 2026-09-29: `.firecrawl/product/14/cli-help.txt`, `.firecrawl/product/14/usage.txt`
- 21st CLI 1.17.1 source (npm pack), stack-detection excerpt: `.firecrawl/product/14/cli-1.17.1-stack-detection.txt`
- 21st machine-readable docs: https://21st.dev/llms.txt (`.firecrawl/product/14/21st-llms.txt`), https://21st.dev/ai.md, https://21st.dev/mcp.md, https://21st.dev/pricing.md, https://21st.dev/changelog.md (all saved under `.firecrawl/product/14/`)
- 21st repo README: https://github.com/serafimcloud/21st (`.firecrawl/product/14/21st-repo-README.md`)
- 21st searches (JSON): `.firecrawl/product/14/search/*.json`; registry probes: `.firecrawl/product/14/registry-probe.txt`; component import summaries: `.firecrawl/product/14/component-imports-summary.txt`
- Skills: `~/.claude/skills/{21st-cli-use,21st-ai,21st-ui-build,21st-ui-explore,21st-ui-review,21st-registry,21st-design-sync,premium-ui}/SKILL.md`
- React Native Reusables: https://github.com/founded-labs/react-native-reusables (`rnr-README.md`, `rnr-docs.txt`, `rnr-catalogs.mdx`, `rnr-tree.txt`), https://reactnativereusables.com/docs
- Expo docs (saved `.md`): https://docs.expo.dev/guides/dom-components/, https://docs.expo.dev/guides/tailwind/, https://docs.expo.dev/router/advanced/platform-specific-modules/, https://docs.expo.dev/workflow/web/, https://docs.expo.dev/versions/latest/sdk/ui/universal/, https://docs.expo.dev/guides/localization/
- NativeWind v5: https://www.nativewind.dev/v5 · Uniwind: https://docs.uniwind.dev/llms.txt (`uniwind-*.md`) · HeroUI Native: https://www.heroui.com/docs/native/getting-started (`heroui-native-llms.txt`) · gluestack-ui: https://gluestack.io/ui/docs/home/overview/introduction
- npm registry, 2026-09-29: `.firecrawl/product/14/npm-versions-2026-09-29.tsv`, `npm-disttags-peers.txt`, `npm-native-peers.txt`

Verified: 2026-09-29

---

## 1. What 21st.dev is

- "Community catalog of 12,000+ hand-crafted React and Tailwind CSS components, templates, and component libraries" [VERIFIED, 21st llms.txt].
- "21st is one product with two actions — Find and Generate — available on three surfaces: the web app, the 21st MCP server, and the 21st CLI" [VERIFIED, llms.txt].
- "Components are React + Tailwind CSS + TypeScript, shadcn/ui-compatible, with live interactive previews and full copyable TSX source" [VERIFIED, llms.txt]. The repo README calls it a registry for "React UI components … powered by **Tailwind CSS** and **Radix UI**" [VERIFIED, README].
- It also hosts whole libraries: Aceternity UI, Magic UI, ReUI, Kokonut UI, Origin UI, Motion Primitives, HextaUI [VERIFIED, llms.txt "Component libraries on 21st"].
- Renames: "Magic MCP" is now the **21st MCP**, "Magic Chat" is now **21st AI**. The `@21st-dev/magic` package still proxies [VERIFIED, llms.txt].
- A REST API with an OpenAPI 3.0 spec at https://21st.dev/openapi.json is "the same surface the 21st CLI and MCP server call" [VERIFIED, llms.txt].
- New in Sept 2026: a **Design Bug Bot** that reviews pull requests for design issues and can block merges on Team plans [VERIFIED, changelog 2026-09-07 and 2026-09-14].

## 2. The CLI (`@21st-dev/cli`, bin `21st`)

- npm latest is **1.17.1** (modified 2026-09-09). **Abu's installed copy is 1.15.0** (`package.json` beside the binary) [VERIFIED]. Upgrade before the build [INFERENCE].
- Account state (`21st whoami` / `21st usage`, 2026-09-29): logged in as `blockchain-oracle`, "Tier: paid", "Unlimited search and component-code retrieval", and **"21st AI generation: not enabled. Do not call generate or iterate_generation."** [VERIFIED, `usage.txt`]. So on Abu's plan `21st generate` / `iterate` are unavailable. Search, `get` and install are unlimited.

| Group | Commands (from `21st help`) [VERIFIED `cli-help.txt`] |
|---|---|
| Auth | `login`, `logout`, `whoami`, `usage` |
| Find | `search <q> [--type c\|theme\|template] [--context auto\|path] [--tag] [--author] [--json]`, `logo <q>` |
| Pull | `get <id>` (component code + demo), `theme <id>` (theme CSS) |
| Install | `add <user>/<slug> [--print]` ("shadcn under the hood" per the `21st-cli-use` skill) |
| Generate (21st AI) | `generate <prompt> [--context] [--variants N]`, `generation <projectId>`, `iterate <projectId> "<change>" --take N`, `take <projectId> [--take N] [--code] [--select]` |
| Design context | `init --design-context [--check\|--refresh]` → `.21st/design.json` + `.21st/DESIGN.md`; `review <path…> [--fix] [--json] [--strict]` (deterministic local rules) |
| Publish / manage | `publish`, `render`, `submit`, `edit`, `delete`, `publish-theme`, `publish-template`, `components`, `open`, `draft`, `library`, `profile` |
| Collections | `bookmarks`, `bookmark`, `lists`, `list`, `list-new`, `list-add`, `teams`, `team-*` |
| Agent setup | `init --client cursor\|claude\|codex\|vscode\|windsurf [--write]`, `skills install\|list\|check\|update\|remove` |

## 3. How components install (shadcn-compatible)

- Every search result carries an install line of the form `npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"` [VERIFIED, `.firecrawl/product/14/s-chat-input.json`].
- **Correction to the premium-ui skill.** That skill says 21st raw URLs are "free, no credits, no auth". Today `GET https://21st.dev/r/Alwurts/chat-input` without a key returns **403** `{"error":"Authentication required"}` [VERIFIED, `registry-probe.txt`]. The free plan allows "2 component code retrievals, copies, or installs per day"; paid plans are unlimited [VERIFIED, llms.txt pricing]. In CI, read the key from `API_KEY_21ST` and never commit it [INFERENCE].
- Other premium registries still serve open shadcn JSON: Aceternity `hero-highlight.json` 200, KokonutUI `ai-voice.json` 200, Motion-Primitives `text-effect.json` 200, and Magic UI (308 → `/r/<name>.json`, 200) [VERIFIED, `registry-probe.txt`].
- Quality bar for featuring: "Use CSS variables from shadcn's theme system", "Support both light and dark modes" [VERIFIED, README]. The 21st-registry skill tells publishers to use semantic tokens (`bg-primary`, `var(--color-primary)`) and never assume raw variable formats [VERIFIED, skill]. **So components re-skin through the shadcn token contract.** This matters for §6.

## 4. Themes, templates, registry publishing

- Themes are CSS files with `:root` + `.dark` token blocks. `21st theme <id>` prints one. `publish-theme` makes one **public** (there is no private option) [VERIFIED, 21st-design-sync skill]. A search for dark themes returns e.g. "Darkmatter" by @serafimcloud (https://21st.dev/community/themes/darkmatter) [VERIFIED, `search/themes.json`].
- Templates are listings, some paid; buying and "verified templates" shipped in Aug 2026 [VERIFIED, changelog 2026-08-18, 2026-08-31].
- Publishing our own components to a team library (`21st publish --to <library>`) is possible. The registry skill notes "Expo / native demos get no panel at all" for live controls [VERIFIED, skill text], but I found no other evidence that 21st hosts native components (§6).

## 5. 21st AI

- Modes: `code` ("a full React/shadcn component with a live sandbox") and `sketch` ("fast, self-contained HTML/Tailwind drafts") [VERIFIED, https://21st.dev/ai.md].
- The skill's loop: `generate` → `generation` → `iterate --take N` → `take` (a copy-prompt spec to rebuild in the real stack, not paste) [VERIFIED, 21st-ai skill].
- Pricing: Builder "$6/mo billed yearly … No monthly 21st AI credits included"; Builder + AI 500/1,000/2,000 credits at $15/$30/$60 per month billed yearly [VERIFIED, pricing.md, temporal].
- **Abu's account: generation not enabled** [VERIFIED, `usage.txt`]. To use generate/iterate, Abu would need Builder + AI [INFERENCE].

## 6. The critical question: 21st and React Native / Expo

### Evidence that 21st is web-only
1. The docs define the product as React + Tailwind + shadcn with TSX source. The only native mention is **icons**, which can be copied "as a React component, SVG, Vue or React Native" [VERIFIED, llms.txt line 51, changelog 2026-08-14].
2. CLI 1.17.1 stack detection recognises next / nuxt / remix / astro / vite / react, tailwind v3/v4 and shadcn. The source contains **zero** occurrences of `react-native`, `nativewind` or `expo` as a word [VERIFIED, `cli-1.17.1-stack-detection.txt`]. The design-context CSS search only checks web `globals.css` paths [VERIFIED, same].
3. Searches for "expo react native" and "react native" return only web components (e.g. "Select (Native)" = a native HTML `<select>`) and one RN starter *template* by @flatlogic [VERIFIED, `search/expo.json`, `search/rn.json`].
4. Imports of sampled components: Voice Powered Orb → `ogl` (WebGL); ElevenLabs Orb → `three`, `@react-three/fiber`; Drawer @wensity → `@base-ui/react/drawer`; Agent Chat and Input Bar → DOM + `tailwind-merge` [VERIFIED, `component-imports-summary.txt`]. Premium registries depend on `motion` (web) [VERIFIED, `registry-probe.txt`].
5. A WebSearch summary likewise found no RN/Expo support [REPORTED, https://github.com/serafimcloud/21st via search results].

**Conclusion [VERIFIED facts → INFERENCE]:** 21st components render on **web as-is**. On **native** they render in only two ways: inside an Expo DOM component (a webview), or **re-implemented** with native primitives using the 21st design as the spec.

### The options for sharing a design language across web and native

| Option | Version (npm 2026-09-29) | What it is (quoted) | Tailwind | Web | Notes |
|---|---|---|---|---|---|
| **React Native Reusables (RNR)** | `@react-native-reusables/cli` 0.7.1; repo ~8.7k★, pushed 2026-09-27, MIT | "Bringing shadcn/ui to React Native" with "support for both Nativewind and Uniwind"; `add` "Uses the shadcn CLI under the hood"; RN Primitives = "A universal port of Radix UI primitives" [VERIFIED, docs index.mdx, cli.mdx] | NW or Uniwind | yes (universal) | Same component names and token names as shadcn. **30 components** (accordion … tooltip) plus auth blocks. **No sheet/drawer, toast, command, chart** [VERIFIED, `rnr-tree.txt`]. Registry JSON served per engine: `/r/nativewind/button.json`, `/r/uniwind/button.json` (200) [VERIFIED] |
| **Uniwind** | 1.12.0 (free, MIT) | "the fastest Tailwind CSS library for React Native — 2x faster than NativeWind, full Tailwind v4 support, works with Expo, iOS, Android, tvOS and Web" [VERIFIED, llms.txt] | v4 (peer `tailwindcss >=4`) | yes | Themes light/dark/**custom**, `ScopedTheme` (1.4.0+), `LayoutDirection` RTL scope (1.9.0+), `useCSSVariable`. Pro tier (C++ engine, Reanimated className animations) is paid [VERIFIED, `uniwind-pro.md`, `uniwind-scoped-themes.md`, `uniwind-rtl.md`] |
| **NativeWind** | latest **4.2.7** (peer `tailwindcss >3.3.0`, i.e. v3); **5.0.0-rc.0** on `preview`/`rc` (peer `tailwindcss >4.1.11`, `react-native-css 3.1.0-rc.0`) | "Nativewind v5 is a release candidate using Tailwind CSS v4 and react-native-css" [VERIFIED, npm + nativewind.dev/v5] | v3 stable / v4 RC | yes | Stable line is on Tailwind v3, while 21st/shadcn web is Tailwind v4 [INFERENCE: token-file mismatch] |
| **HeroUI Native** | 1.0.10; repo ~3.7k★, Apache-2.0 | "built on Tailwind v4 via Uniwind … built-in accessibility"; "production-ready" [VERIFIED] | v4 via Uniwind | mobile-focused (web is separate HeroUI v3) | Has what RNR lacks: **BottomSheet, Toast, Dialog, Popover, Tabs, ListGroup, InputOTP, Select** [VERIFIED, `heroui-native-llms.txt`]. Peers include `@gorhom/bottom-sheet ^5.2.9`, Reanimated 4 [VERIFIED npm]. Has its own token names [INFERENCE: needs mapping to shadcn names] |
| **gluestack-ui** | **v5** (`gluestack-ui` 5.0.3, `@gluestack-ui/core` 5.0.15; `v3-stable` 3.0.12) | copy-paste; "gluestack-ui and shadcn/ui are very similar, although gluestack-ui exists in the mobile and web world both!"; BottomSheet marked alpha [VERIFIED, docs] | NativeWind | yes | The brief said v3; current is v5 [VERIFIED npm] |
| **Tamagui** | 2.7.7 (3.0 beta) | universal RN + web kit with its own compiler (from `06/cross-platform-options.md`) | no (own style system) | yes | Doesn't speak shadcn/Tailwind tokens, so it's the furthest from 21st [INFERENCE] |
| **@expo/ui Universal** | 57.0.21 | "a single-API layer over the platform-native UI toolkits" (Compose on Android, SwiftUI on iOS, react-dom/RN-web on web); BottomSheet, Picker, Switch, List, FieldGroup … [VERIFIED, expo docs] | no | yes | Truly native controls. Good for settings lists and sheets; not a design-system look [INFERENCE] |
| **Expo DOM components (`'use dom'`)** | built in; `@expo/dom-webview` 57.0.1 | "work with modern web code directly in a native app"; "React, TypeScript, CSS, and all other Metro features are enabled" [VERIFIED] | Tailwind via per-module `global.css` import ("add this file import to each module using the `"use dom"` directive") [VERIFIED, tailwind guide] | renders as normal DOM on web | Limits: serializable props, async-only functions, "slower to parse and start up than optimized Hermes bytecode", no native views inside, no `children`, **"do not support OTA updates"**, no shared global state. Expo: "we recommend using truly native views whenever possible" [VERIFIED] |
| **Expo Router platform files** | expo-router 57.0.24 | `.web.tsx` / `.native.tsx` extensions, with a non-platform file required in `src/app` [VERIFIED]. On web "you can use React DOM directly" and "write web-only React DOM components such as `<div>`" [VERIFIED, workflow/web] | web: Tailwind v4 via PostCSS [VERIFIED, tailwind guide] | yes | Lets the **same Expo app** use real 21st/shadcn TSX on web and RNR on native, behind one import path [INFERENCE] |
| catalogs.dev (Founded Labs) | web service | "lists work from many teams, including shadcn, Expo, Vercel, HeroUI, and Magic UI … Components, blocks, screens, and themes" [VERIFIED, `rnr-catalogs.mdx`] | — | — | A curated picker for **native** components, the closest RN analogue to 21st. Not assessed hands-on [UNKNOWN beyond the docs page] |

### The honest best way to honor "use 21st.dev" everywhere [INFERENCE]

1. **Web surfaces use 21st literally**: the web app's UI (`.web.tsx` component files in the Expo app), the landing/showcase site and the docs site. Components are installed with `21st add` / `shadcn add`, from 21st and the premium registries.
2. **Native surfaces use the same design, built from shadcn-shaped native parts.** RNR primitives (the shadcn port, Uniwind variant) plus HeroUI Native or specialist libraries for what RNR lacks (sheets, toasts, charts, voice visualizer). Each native component is **built to the chosen 21st component as its visual spec**: same tokens, radii, motion intent, states and copy. This is "select, don't hand-roll" applied to native: select from RNR/HeroUI/catalogs.dev, and select the look from 21st.
3. **One token contract.** Use the shadcn semantic variable names (`--background`, `--primary`, `--card`, `--border`, `--radius`, plus our `--testnet` tokens) in Tailwind v4 CSS. The web reads it through Tailwind v4 + shadcn. Native reads the same names through Uniwind (Tailwind v4, custom themes). A 21st theme can seed the palette (`21st theme <id>`), and our final theme can be published back with `21st publish-theme` (public) or kept private.
4. **DOM components are a scoped escape hatch, not the native strategy**: e.g. the showcase-grade WebGL orb on a non-critical screen, or rich markdown. Never for money confirmation, and never where OTA fixes matter, because DOM components "do not support OTA updates" [VERIFIED].
5. **21st AI is optional.** It is not enabled on Abu's plan. Search + `get` + visual review (`21st-ui-explore`) is the workflow. If Abu enables Builder + AI, `generate --context auto --variants 3` can draft the bespoke money cards that the catalog lacks (bridge route comparison).

## 7. The workflow the skills prescribe (as written)

1. **Design context first**: `21st init --design-context` creates `.21st/design.json` + `.21st/DESIGN.md`. premium-ui Phase 0 also requires a per-project `DESIGN.md` (palette, **non-Inter** fonts, spacing, radius, motion, blocklist) before any install [VERIFIED, skills].
2. **Explore** (undecided look): search 21st, define three named directions differing on ≥2 axes ("Color-only variants do not count"), recommend one, record the choice in `.21st/design.json` [VERIFIED, 21st-ui-explore].
3. **Build**: reuse project primitives, `21st search "<need>" --context auto`, install only when it helps, then implement in the real framework ("Do not paste sketch HTML") and keep focus, keyboard, reduced motion, loading/empty/error states [VERIFIED, 21st-ui-build].
4. **premium-ui hard rule**: "Never hand-build a UI section that a premium author already built." Install fallback chain: `altInstall` → next candidate → another registry. Reskin everything to the tokens. Port Tailwind v3-isms. Check `whileInView` opacity traps [VERIFIED, premium-ui + blocklist].
5. **Review**: `21st review <paths>` first, `--fix` only for deterministic fixes; findings grouped by severity [VERIFIED, 21st-ui-review]. Whether `21st review` understands RN `.tsx` files is [UNKNOWN]: its rules and CSS discovery are web-oriented (`cli-1.17.1-stack-detection.txt`).

## 8. Gaps
- Not tested: installing a 21st component into an **Expo web** project (shadcn `components.json` aliases, Radix/Base UI portals under Expo Router web, Tailwind v4 PostCSS alongside Uniwind's Metro transform). Needs a day-1 spike [UNKNOWN].
- Whether Uniwind's web output also styles raw DOM `className`s in `.web.tsx` files, so one `global.css` serves both, is [UNKNOWN].
- catalogs.dev pricing and terms were not checked.
