# Stage 15: Landing / showcase + judge kit

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: built on a branch (2026-10-02), not deployed

## Scope (from the master plan)
- `apps/landing`: sections built from the 21st/premium registries (hero, bento of capabilities, live demo embed, network toggle demo, voice demo, trust section, "the agent you don't have to bring").
- `/demo`: the video + a dated evidence table of real Arc tx links on both networks.
- `/live`: real action counts.
- A public status page link.
- **Exit:** landing is live; a judge can go landing → web app (guest) → docs without help.

## Docs to read first (Context7 / official docs)
- Next 16: `output: "standalone"` with `outputFileTracingRoot` for a monorepo (the server lands at `apps/landing/server.js`; `.next/static` and `public/` are copied next to it), `fetch(..., { next: { revalidate } })` for ISR, metadata routes (`icon.svg`, `sitemap.ts`, `robots.ts`).
- Docker BuildKit per-Dockerfile ignore files (`Dockerfile.dockerignore` next to the Dockerfile replaces the root `.dockerignore`).

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
Queries: "bento grid features", "bento grid dark minimal", "animated number counter", "stats counter section", "minimal navbar header", "floating header navigation", "minimal footer", "data table simple", "resource link cards grid". Code is in `apps/landing/src/components/ui/`; each file's header says what changed for Kawase.
- **Header:** Floating Header · efferd · https://21st.dev/@efferd/components/floating-header · a sticky glass pill matches DESIGN.md's glass chrome; the shadcn Sheet became an inline disclosure so there is no dialog dependency.
- **Capabilities bento:** Bento Grid · kokonutd · https://21st.dev/@kokonutd/components/bento-grid · a status slot per card (the registry state) and tags (partner names) map one-to-one onto capability cards; the hover dot pattern became the `texture` stipple. Rejected: avanishverma4/bento-grid-01 (fixed demo animations, not data-driven).
- **Animated counters (/live):** Count Up · unlumen · https://21st.dev/@unlumen/components/count-up · springs to its value when in view, with an odometer digit slide; reduced motion now shows the final value at once.
- **Judge-kit link cards:** Cards Grid · kavikatiyar · https://21st.dev/@kavikatiyar/components/cards-grid · icon + title + subtitle + arrow per link is the judge kit's shape; the icon slot takes real marks, and a card with no link yet shows "Invite only".
- **Evidence table (/demo):** Table · coss.com · https://21st.dev/@coss.com/components/table · plain semantic table primitives that scroll horizontally on phones; header cells align to the reading start for RTL.
- **Footer:** Minimal Two-Column Footer · ln-dev7 · https://21st.dev/@ln-dev7/components/footer-17 · brand + tagline + one link list is all the landing needs.
- **Reused from ui-web (already sourced):** the hero/network orb (isaiahbjork/voice-powered-orb, driven by a page level, never the microphone), SegmentedControl (ddoemonn/segmented-control) for the network toggle, Mark for every real logo. GitHub and Android marks are Simple Icons v16 (CC0) because `packages/identity` has none yet; brands without a mark (Aave, Across, Relay, Hibachi, edgeX) are text.

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: The revamp adds the brand mark/wordmark, `packages/identity` (real marks with provenance) and the Lime on Ink web components; the landing and `/demo` reuse them.
- 2026-10-02: Built `apps/landing` (Next 16.3.8, standalone) and `GET /public/stats` in the api.
  - `/`: hero with the orb; "what it does" presents the approved scope (everything on Arc: any token, meme coins, long/short, Apple Pay buying via Circle Onramp Kit, earn and borrow across Aave V4 and Morpho, bridges compared, withdraw anywhere, x402, automations, export). Each card's state comes from `CAPABILITIES`; areas with no registry id yet (tokens, meme_coins, perps, buy, borrow, withdraw, export_wallet) read "Coming", and shipped cards quote `CAPABILITY_SCOPE`'s first "today" and "not yet" lines. Safety model with `DEFAULT_LIMITS` figures, the ten languages with STT/TTS from `VOICE_SPEECH`, the mainnet/testnet toggle (`data-network` testnet layer), and the judge kit.
  - `/demo`: the video slot (`NEXT_PUBLIC_DEMO_VIDEO_URL`; an honest placeholder until set) and 34 dated testnet transactions in `src/data/evidence.ts`, extracted by script from stages 06 and 08 and spikes 15 and 16, each matched by prefix + suffix to exactly one full hash in its log. Stage 06's display text for the vault withdraw reads `0x0d88…dfc8`; its link (the full hash) ends `…fdc8`, which is what the page uses.
  - `/live`: reads `/public/stats` with a 60 s revalidate; shows "Counts unavailable right now" while the deployed api has no such route.
  - Verified: `@kawase/landing` build and typecheck pass; `next start` served `/`, `/demo` and `/live` (200), and `/demo` carries 34 distinct full-hash explorer links (31 Arc testnet, 3 Base Sepolia). `apps/api/test/public-stats.test.ts` passes against the local database. Not deployed.
  - Env: build-time `NEXT_PUBLIC_WEB_APP_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_LANDING_URL`, `NEXT_PUBLIC_TESTFLIGHT_URL`, `NEXT_PUBLIC_DEMO_VIDEO_URL`; run-time `KAWASE_API_URL`. Defaults come from `PUBLIC_LINKS`.
