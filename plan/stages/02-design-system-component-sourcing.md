# Stage 2: Design system + component sourcing

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: exit criteria met on iOS and web (2026-09-30). Android has not been run (no emulator on this Mac).

## Scope (from the master plan)
- `DESIGN.md` and the 3 directions → **Abu picks one**.
- `packages/ui-tokens`: tokens.json → web and native CSS + TS; light, dark, and the testnet layer; RTL-safe logical spacing.
- For every surface in the shortlist: search, pick, install into `ui-web`, then build the native twin in `ui-native`. Record every pick (component · author · URL · why) in `plan/stages/02-*.md`.
- **Exit:** a gallery route (`/dev/gallery`, internal) renders every base component on web and native in light, dark, testnet and Arabic RTL; `21st review` is clean.

## Docs to read first (Context7 / official docs)
- The premium-ui skill (pipeline, `design-md-template.md`, `blocklist.md`), the 21st-ui-explore and 21st-cli-use skills.
- `context/08-product-research/14-ui-and-docs/recommendation.md` (token contract, theming, RTL, accessibility).
- Uniwind theming reference and the RNR `minimal-uniwind` template (from spike 8).
- Google Fonts subset lists for every candidate font (checked 2026-09-30).

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
Installed into `packages/ui-web/src/components/ui/` (searched 2026-09-30, 18 queries, judged by preview and code):
- Composer · Prompt Input · @ibelick · https://21st.dev/r/ibelick/prompt-input · plain, slots for attach/mic/send, pulls shadcn textarea + tooltip.
- Messages · Chat Bubble Thread · @bundui · https://21st.dev/r/bundui/bubble6 · small, token-only bubble primitives (the demo file is not kept).
- Suggestions · AI Suggested Actions · @elements- · https://21st.dev/r/elements-/suggested-actions · two-column prompt chips, no dependencies.
- Receipt · Order Confirmation Card · @kavikatiyar · https://21st.dev/r/kavikatiyar/order-confirmation-card · the receipt/confirmation card (from spike 8); now takes rows, a badge and a compact mode.
- Balance · Wallet Card 2 · @beratberkayg · https://21st.dev/r/beratberkayg/wallet-card-2 · balance block + action row + account rows. The published source had malformed JSX and fixed pink/purple gradients; structure kept, content and colours now from props and tokens.
- Activity · Activity Feed (item-19) · @felipemenezes098 · https://21st.dev/r/felipemenezes098/item-19 · clean rows on shadcn `item`; now takes events and an amount column.
- Network toggle · Segmented Control · @ddoemonn · https://21st.dev/r/ddoemonn/segmented-control · sliding thumb with keyboard support; fixed stone colours replaced by tokens.
- Navigation · Bottom Menu · @0xUrvish · https://21st.dev/r/0xUrvish/bottom-menu · toolbar with animated pop-up lists; items now come from props.
- Voice · Voice Powered Orb · @isaiahbjork · https://21st.dev/r/isaiahbjork/voice-powered-orb · WebGL ring (ogl); ring colours are now props so it follows the tokens.
- Captions · Response Stream · @ibelick · https://21st.dev/r/ibelick/response-stream · fade/typewriter text for live captions.
- Hold to confirm · Hold to Confirm · @ddoemonn · https://21st.dev/r/ddoemonn/hold-to-confirm · press-and-hold with a sweeping fill, keyboard and screen-reader support, same author as the segmented control. Colours now from tokens; the sweep follows the reading direction. Used for irreversible actions that do not go through Face ID (not for payments).
- Palette seeds (themes, @serafimcloud): Vintage Paper, Vermilion Clay, Indigo Mono, Graphite Mono, Amber Mono.

Kawase compositions of those parts (glue, no 21st equivalent; `packages/ui-web/src/components/`): `confirm-sheet.tsx`, `composer.tsx` (built on Prompt Input), `network-chip.tsx` (chip and testnet strip).

Native twins (`packages/ui-native`, React Native Reusables on Uniwind):
- Base parts installed with the RNR CLI (`--styling-library uniwind`) into `src/components/ui/`: text, button, card, badge, input, textarea, separator, avatar, skeleton, switch, label, icon.
- Twins in `src/components/`, each naming the web component it copies and keeping its props: `voice-orb` (the same shader, ported to Skia), `caption` (Response Stream, fade mode), `hold-to-confirm`, `confirm-sheet`, `receipt-card`, `wallet-card`, `activity-feed`, `segmented-control`, `bubble`, `suggested-actions`, `composer`, `network-chip`, `amount`.
- No native twin for Bottom Menu: the native apps use the platform's own navigation.

Install notes:
- Two manifests (`bundui/bubble6`, `felipemenezes098/item-19`) list their base parts as `shadcn/avatar` and `shadcn/item`, which the shadcn CLI cannot resolve. Workaround: `npx shadcn add avatar item separator dropdown-menu`, then write the author's file from the registry JSON.
- The `ui` alias in `packages/ui-web/components.json` must be `@kawase/ui-web/components/ui`, or base shadcn parts land one folder up.
- `packages/ui-web/tsconfig.json` turns off three strict flags that community components are not written for.
- `apps/mobile/src/global.css` now sets the default border colour to the `border` token (the shadcn convention these components rely on) and has a `success` token.

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: `DESIGN.md` drafted with three candidate token sets (`packages/ui-tokens/directions.json`; every text pair ≥ 4.5:1 in all four themes, checked by script). Ten 21st.dev components installed and reskinned to tokens. Three directions built as real previews at `/dev/directions` (web) with screenshots in `plan/design/directions/`; write-up and recommendation in `plan/design/DIRECTIONS.md`. **Waiting for Abu to choose.** Typecheck 18/18; iOS bundle compiles.
- 2026-09-30: **Abu chose Direction C, Koe**, and likes its colours. `packages/ui-tokens/tokens.json` is now the single source (22 tokens × 4 themes, all text pairs ≥ 4.5:1); `build.mjs` generates `native.css`, `web.css` and `tokens.ts`; `apps/mobile/src/global.css` imports `native.css`. `DESIGN.md` finalised for Koe. The temporary `/dev/directions` route and tab are removed; the preview source is kept at `plan/design/reference/directions-preview.web.tsx`.
- 2026-09-30: **Fonts, native twins and the gallery are done; exit criteria met on iOS and web.**
  - Fonts: Bricolage Grotesque, Manrope and JetBrains Mono are embedded in the native app by the `expo-font` plugin (one family name each, weight by `fontWeight`; checked on the simulator) and loaded from Google Fonts on web (`+html.tsx`; the address is generated from `tokens.json`). `font-sans`, `font-display` and `font-mono` come from the token build.
  - `packages/ui-native` (new): 12 React Native Reusables base parts and 13 twins (list above). The orb is the web shader ported to Skia (`@shopify/react-native-skia` 2.6.2).
  - Gallery: `/dev/gallery` and `/dev/home-sample` on both platforms, with `?mode=&network=&lang=&scroll=`. Screenshots and scripts in `plan/design/gallery/` (`shoot-ios.sh`, `shoot-web.mjs`; 13 iOS and 8 web images; `results.web.json`: fonts loaded, no horizontal overflow, no console errors in all 8 web states). The production web export prerenders all 6 routes.
  - `21st review`: 0 errors and 0 warnings in both packages. Remaining notes are informational: the shader helper names `yiq2rgb`/`hexToRgb` are mistaken for colours, and the stock dropdown hides overflow.
  - `pnpm lint` and `pnpm typecheck` pass for the whole workspace (21/21) for the first time. Installed registry components are exempt from the style-only rules (`eslint.config.mjs`); code written for Kawase is not.
  - The Expo starter template (tabs, explore screen, themed components) is removed; `/` is a temporary build index.
  - Found by looking at the screenshots, and fixed:
    1. A theme change during an entering animation left the animated view with the old theme's colours (white card in dark mode). Motion now sits on a wrapper and colours on a plain view inside it.
    2. Right-to-left: Uniwind's `LayoutDirection` alone did not mirror the layout on iOS; `Direction` in ui-native sets the layout direction on a real view as well. React Native has no "start" text alignment (it mirrors an explicit `left`), text fields are not mirrored at all (`rtl:text-right`), and transforms are not mirrored (the switch thumb).
    3. Caption words: a trailing space is dropped from right-to-left text and lands on the wrong side of a number inside an Arabic sentence, so the gap is a margin on the word's trailing side.
    4. Letter-spacing broke the Arabic state label; `StateLabel` spaces only scripts that have capitals (`hasUncasedScript` in `@kawase/i18n`, tested).
    5. The web segmented control's thumb always moved from the left, so in Arabic it highlighted the wrong option. It and the arrow keys now follow the reading direction.
    6. The web orb had a grey halo on light backgrounds (premultiplied colour blended as straight alpha).
    7. White text on the dark theme's light red was about 2.9:1. New token `destructive-foreground` (5.7:1 light, 6.5:1 dark).
    8. `dark:` classes applied in only one of the two dark themes; removed, colours come from tokens.
    9. The native segmented control wrapped long labels; segments now size to the longest label.
  - Tested on the simulator with real touches (`idb`): a short press on hold-to-confirm does nothing ("hold released early"), a full hold confirms.
  - Open, for later stages: Android run; Arabic display text on native uses the system's Arabic font (embedding Noto Sans Arabic and switching family by language is an i18n-stage choice); amounts inside translated sentences should be wrapped in direction isolates by the i18n layer; the app icon and splash image are still the Expo defaults.
- 2026-09-30 (later): **Revamp (D34/D35).** Koe is superseded by "Lime on Ink" (`plan/design/REVAMP-PLAN.md`): the tokens, `DESIGN.md`, the base parts and the twins are being rebuilt in Phase A, a `packages/identity` registry with real marks is added, and the art objects (koban, hanko seal, paper plane, glass orb, QR tile, silver flag, brand mark) are drawn in the stipple/engraving technique. The old UI is tagged `koe-v0`. New 21st.dev picks for the new surfaces are recorded here as they are made; `wallet-card-2` and `bottom-menu` are removed. Progress continues below.
