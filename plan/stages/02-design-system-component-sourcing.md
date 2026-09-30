# Stage 2: Design system + component sourcing

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: in progress (three directions ready; waiting for Abu's choice)

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
- Palette seeds (themes, @serafimcloud): Vintage Paper, Vermilion Clay, Indigo Mono, Graphite Mono, Amber Mono.

Install notes:
- Two manifests (`bundui/bubble6`, `felipemenezes098/item-19`) list their base parts as `shadcn/avatar` and `shadcn/item`, which the shadcn CLI cannot resolve. Workaround: `npx shadcn add avatar item separator dropdown-menu`, then write the author's file from the registry JSON.
- The `ui` alias in `packages/ui-web/components.json` must be `@kawase/ui-web/components/ui`, or base shadcn parts land one folder up.
- `packages/ui-web/tsconfig.json` turns off three strict flags that community components are not written for.
- `apps/mobile/src/global.css` now sets the default border colour to the `border` token (the shadcn convention these components rely on) and has a `success` token.

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: `DESIGN.md` drafted with three candidate token sets (`packages/ui-tokens/directions.json`; every text pair ≥ 4.5:1 in all four themes, checked by script). Ten 21st.dev components installed and reskinned to tokens. Three directions built as real previews at `/dev/directions` (web) with screenshots in `plan/design/directions/`; write-up and recommendation in `plan/design/DIRECTIONS.md`. **Waiting for Abu to choose.** Typecheck 18/18; iOS bundle compiles.
