# S1 — Brand + design system

**Goal:** one token source for web and mobile, the Senryo 千両 / Kinpaku 金箔 brand assets, and the web shell with the D2 21st components re-tokenized.
- **Plan:** `00-plan.md` §1 D-003/D-004/D-033/D-049, §2.4. **Open first:** `design/DIRECTIONS.md` (D2), `design/preview/components/directions/d2.tsx`, `design/preview/app/directions.css`, `docs/plan/specs/client.md` (component mapping), skills `21st-cli-use` / `21st-ui-build` / `21st-ui-review`.
**D-number range:** D-060…D-069.

## Steps
- [x] `packages/tokens`: D2 palette dark + light (single TS source), type/space/radius/motion scales, generated `tokens.css` (shadcn/Tailwind 4 variable names; adds `--chart-up`, `--chart-candle-down`, `--surface`)
- [x] Brand: 千 square seal mark (SVG, inverse), wordmark, app icon 1024, splash, logo ≤ 3 MB PNG, Kinpaku card art → `brand/`
- [x] `apps/web` shell: Next 16 static export, Tailwind 4 + shadcn `components.json`, fonts Inter + JetBrains Mono, tokens.css, D2 top bar + tabs
- [x] `21st add` the D2 set (per specs/client.md mapping), re-tokenize (no hex/px), split files > 400 lines, `framer-motion` → `motion/react`
- [x] `apps/web/.21st/design.json` + `apps/mobile/.21st/design.json` (colors, type, radius, motion, must/avoid, installed components, RN port sources)
- [ ] Sounds (fill, deposit, send, unlock, liquidation) — **[OK?]** ElevenLabs credits
- [x] Visual check vs `design/screens/d2-*` at 390/768/1440, both themes (chrome-devtools screenshots)
- [x] Domain senryo.xyz registered (D-100; $2.20)

## Gate
`design-literals-web` + `design-json-present` pass; logo exists; D2 screens match the approved screenshots.

## Findings
- The preview's Candle Chart read three undefined tokens (`--chart-up`, `--chart-candle-down`, `--surface`) and always fell back to its own colours — now defined in `packages/tokens`.
- Screens without explicit grid columns let the implicit track grow to min-content (Markets overflowed to 484 px at 390) — every screen grid now uses `grid-cols-1` (minmax(0,1fr)).
- Partition Bar used percent flex-basis plus gaps (overflowed its row); segments now flex-grow by value.
- Candle Chart `fill` mode drew at the default viewBox until the ResizeObserver fired; the SVG stays invisible until measured. Full-page DevTools captures resize the viewport and race that observer — capture tall pages with a tall viewport instead.
- `21st review apps/web/src`: 2 focus-outline removals (swap) and 4 `transition-all` + 1 700 ms animation fixed; 33 "hardcoded colour" infos are the `#id` numbers in 21st header comments (false positives); 2 disabled-pointer warnings accepted (both controls state why they're disabled).
- Gauge now draws a true half arc (the source faked it; the approved screenshot shows a lopsided ¾ arc). Card flip stays 500 ms (a 3D flourish outside the 120–200 ms UI rule).
- Visual evidence: `design/screens/web-s1/{portfolio,markets,trade,card,fund}-{390,768,1440}-{dark,light}.png`.

## Handoff
S5 (mobile) consumes `@senryo/tokens` (`PALETTES`, `TYPE`, `SPACE`, `RADIUS`, `MOTION`). Web consumes `@senryo/tokens/tokens.css`. Regenerate CSS with `pnpm --filter @senryo/tokens emit` after any palette change.
Web (S6–S8): every screen reads `apps/web/src/lib/sample.ts` behind the PREVIEW DATA badge — replace per screen with `packages/query` hooks and drop the badge when a screen is fully live. `/` has a disabled "Continue with passkey" (S6). Sounds and the domain remain [OK?] items.
