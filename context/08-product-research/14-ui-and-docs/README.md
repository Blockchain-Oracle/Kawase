# 14 · UI (21st.dev) and documentation site

Purpose: index and summary for D19 (UI uses 21st.dev: curated components, never mediocre, never hand-rolled) and D20 (docs site + showcase are deliverables).

Sources: the four files below, each with its own primary sources. Raw evidence is in `.firecrawl/product/14/` (CLI help/usage, CLI 1.17.1 source excerpt, 21st llms.txt/changelog/pricing, search JSON per surface in `search/`, registry probes, npm versions/peers, Expo/Uniwind/RNR/HeroUI docs, docs-framework pages in `docs-fw/`).
Verified: 2026-09-29

## Files
| File | Read it for |
|---|---|
| [21st-dev.md](21st-dev.md) | What 21st is, the CLI, install/auth, themes, 21st AI, the skill workflow, and **how 21st relates to React Native** (it doesn't run there) plus the options for sharing a design language across web and native |
| [component-sourcing.md](component-sourcing.md) | Concrete 21st candidates (id · name · author · URL) and native equivalents for chat, voice, genUI cards, the network pill, onboarding, settings, activity, toasts, sheets and the landing page; premium registries' web/native status |
| [docs-site.md](docs-site.md) | Fumadocs vs Nextra 4 vs Starlight vs Docusaurus vs VitePress vs Mintlify: versions, i18n/RTL, search, MDX, OpenAPI, llms.txt, theming, Coolify fit |
| [recommendation.md](recommendation.md) | [INFERENCE] The cross-platform UI architecture: tokens, which system renders where, the genUI twin registries, testnet hue, i18n/RTL, a11y, the 21st workflow in the build, day-1 spikes |

## Key findings
- **21st.dev is web-only** [VERIFIED]: React + Tailwind + shadcn TSX. CLI 1.17.1 has no Expo/RN detection. Catalog searches for RN return nothing native. The only native export is **icons**.
- **Abu's 21st account: paid tier with unlimited search/code, but "21st AI generation: not enabled"** [VERIFIED `21st usage`]. The installed CLI is 1.15.0; npm latest is 1.17.1.
- **21st install URLs now require an API key** (403 without one) [VERIFIED]. This corrects the premium-ui skill's "no auth" note. Aceternity, KokonutUI, Motion-Primitives and Magic UI registries are open, and all are web-only (`motion` deps).
- **Native path:** React Native Reusables ("Bringing shadcn/ui to React Native", NativeWind **or Uniwind**, shadcn CLI under the hood) is the closest native twin. It has 30 components and no sheet, toast or chart. Fill those with HeroUI Native (Uniwind; BottomSheet/Toast/Dialog), `@gorhom/bottom-sheet`, `sonner-native`, `victory-native` and the LiveKit RN `BarVisualizer`.
- **Styling engine:** Uniwind 1.12.0 (Tailwind v4, custom/scoped themes, RTL scope). NativeWind stable 4.2.7 is Tailwind v3 and v5 is `5.0.0-rc.0`. gluestack-ui is now **v5**, not v3.
- **Expo DOM components** can host 21st components on native, but they are webviews: slower start, no native children, and **no OTA updates**. Use them as an escape hatch only.
- **Docs:** Fumadocs 16 is recommended [INFERENCE]. It is the only option that adopts the app's shadcn tokens directly, and it has i18n + RTL + multilingual search + OpenAPI + llms.txt/MCP. It self-hosts on Coolify. Starlight is the runner-up. Mintlify self-hosting is Enterprise-only.

## Recommendation in one line [INFERENCE]
Use 21st literally on every web surface (the web app via `.web.tsx` files in the same Expo app, plus the landing page and docs). On native, use it as the design spec, rebuilt with RNR on Uniwind plus curated native specialists. One shadcn-named token file drives everything, and the testnet accent is a token layer.

## Open questions for Abu
1. Enable **21st Builder + AI** (from $15/mo yearly, 500 credits) so `21st generate/iterate` can draft bespoke cards such as the bridge route comparison? Otherwise we compose from catalog parts.
2. Does D4's "most widely spoken languages" include **RTL languages** (Arabic, Urdu, Persian)? That decides how much RTL work the app and docs need on day 1.
3. Is it acceptable that the **native** UI is a faithful RNR rebuild of 21st picks rather than 21st code? No native 21st code exists to install.
