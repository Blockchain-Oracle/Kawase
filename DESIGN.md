# Kawase design system: Senryo

Purpose: the single source for every visual decision. Every colour, font, radius, space, elevation, motion and spring value in the apps resolves to a token in `packages/ui-tokens/tokens.json`. `pnpm --filter @kawase/ui-tokens build` generates `native.css` (Uniwind), `web.css` (docs and landing) and `tokens.ts`, then `check-contrast.mjs` fails the build if any text pair in any of the four themes drops below 4.5:1.
Last updated: 2026-10-14 (D40, Stage 2 look lane)
Decision: D40, Abu on 2026-10-14: "Exactly Senryo, magenta"; every component from 21st.dev; designed loading, empty, error and offline states everywhere; no mocks. This replaces "Lime on Ink" (D35); the orb stays as the voice symbol. Token **names** did not change; their values did.
Sources: Senryo (`/Users/abu/dev/hackathon/metropolis`: `packages/tokens/src/{palette,scale,fonts,sound}.ts`, `apps/mobile/src/components`), Mitoshi (`crypto-world-fair/web/src/components/{states,tx}`), `plan/research/2026-10-14/03-senryo-design.md` and `05-21st-components.md`, the look docs pack (`plan/docs-packs/look.md`). Component provenance: `apps/mobile/.21st/design.json`.

## Direction
- One line: **quiet light plates, black actions, one magenta for the moment that matters, money in condensed black figures that roll.**
- The agent is the front door (D37): the shell is calm so the agent's work (venues lighting up, steps, receipts) is what moves.
- Light is the default; dark is an adaptation, not an inversion. Depth is one step lighter fill, never a border or a shadow (shadows only on the dock, sheets, the primary plate and a receipt).
- Real marks keep their own colours (packages/identity); nothing is tinted.

## Palette (light / dark)
| Token | Light | Dark | Used for |
|---|---|---|---|
| background | `#F5F5F5` | `#111111` | the page |
| card | `#FFFFFF` | `#1C1C1C` | a group on a page (level 1) |
| raised-2 / secondary / muted / input | `#ECECEC` | `#292929` | a group inside a sheet (level 2), quiet plates, inputs |
| row-pressed | `#E2E2E2` | `#363636` | pressed rows, the segmented plate |
| foreground | `#000000` | `#F5F5F5` | text 1 |
| muted-foreground (text 2) / text-3 | `#666666` / `#6E6E6E` | `#B8B8B8` / `#A0A0A0` | secondary and tertiary text (both ≥ 4.5:1) |
| primary / primary-foreground | `#000000` / `#FFFFFF` | `#F5F5F5` / `#000000` | the one main action; pressed `#252525` / `#DEDEDE` |
| accent / accent-foreground | `#FA00FF` / `#000000` | same | trade, publish, selected controls, the focus ring (`ring`), badges. Black label always |
| selected-row / link | `#FCE3FC` / `#99009C` | `#3C203C` / `#FF75FF` | a selected row, links |
| up / down | `#2F7A00` / `#C8283F` | `#B5F543` / `#FF647C` | direction only (P&L, price change, swap outcome) |
| up-fill / down-fill (+ `-edge`, `on-fill`) | `#B5F543` / `#FF647C` | same | vivid direction plates with black labels and a darker 3 px edge |
| up-, down-, warn-, destructive-surface | washes | washes | change chips, error panels, warnings |
| warn / destructive | `#8A5800` / `#C83225` | `#F2B85C` / `#FF5A48` | warnings; destructive actions and failures (never the accent) |
| glass / glass-border / glass-opaque | `#ECECECEB` / `#FFFFFFB3` / `#ECECEC` | `#292929EB` / `#FFFFFF24` / `#292929` | the dock and capsule material; opaque under Reduce Transparency |
| scrim / sheet-handle / skeleton | `#000000B3` / `#999999` / `#DEDEDE` | `#000000B3` / `#999999` / `#363636` | sheets and loading geometry |
| network / network-foreground / network-surface | neutral | neutral | the mode capsule |

**Testnet** is a layer over light or dark that changes only the mode capsule's plates (`network`, `network-surface`): neutral greys, never a hue wash. The mode is in the words ("Testnet") and in the shape (a dashed rim and a hollow switch), never in colour alone. Four themes: `light`, `dark`, `testnet`, `testnet-dark`.

## Typography
- **Inter** 400/500/600/700 for the interface; **Roboto Condensed Black** (900) for money and page titles. Both embedded by the expo-font plugin on native and loaded from Google Fonts on the web. Arabic, Urdu, Hindi, Bengali and Chinese use the Noto families on the web and the system fonts on native.
- Roles (`tokens.scale.type`, read as `TYPE.*` in the kit): `displayBalance` 52/56 and `displayMargin` 64/68 (money, condensed), `pageTitle` 32/38 (condensed), `sheetTitle` 24, `rowTitle` 17/600, `row` 16, `rowDetail` 14, `buttonLabel` 17/600, `meta` 12. Display tracking −0.02 em; everything else 0. Sentence case; no tracked uppercase labels.
- Every money figure is tabular with lining figures. Dynamic Type caps: hero 1.3, controls 1.35.

## Shape, space, elevation
- Radius: 8 / 12 / 16 / 24 / 32 / pill (`--radius-s-*`). Buttons 56 high (48 secondary, 44 compact) with 28 / 22 corners; groups and sheet rows 20; sheet tops and the desktop stage 24; chips 32 high.
- Space: a 4 grid, 2 / 4 / 8 / 12 / 16 / 20 (gutter) / 24 / 32 / 48. Touch targets ≥ 44.
- Elevation: dock `0 8 24 #0003`, sheet `0 −4 16 #0000001F`, primary plate `0 2 4`, receipt. Everything else is flat.

## Motion
- Press 100 ms in / 160 ms out to 0.97 scale; selection 170 ms; number change 160 ms; sheet enter 480 / exit 240 on the drawer curve `(0.32, 0.72, 0, 1)`; stagger 40 ms, items rise 10 pt over 320 ms; default ease `(0.2, 0.8, 0.2, 1)`.
- Springs (mass 1): selector 260/30, detail 240/30, dock bubble 420/30 (overshoot), dock and rail active pill 500/36, sheet release 320/32 (slight overshoot).
- Reduced motion: travel becomes a 100 ms crossfade; skeletons and shimmer stand still; rolling digits swap.
- Live numbers roll (Skia odometer on the phone, NumberFlow on the web), and a sparkline sits beside every price and balance.

## Sound and haptics
- One call site: `fire(event, { sound?, identity? })` (`apps/mobile/src/feedback/fire.ts`). Haptic words: tick (selection), press (light), snap (rigid), confirm (soft), filled (success), warn, fail (error), close (medium), surge (heavy), agentStep (selection), agentDone (success).
- **No sound for ticks or navigation**; a sound is for money arrived, sent, confirmed, failed, and the agent finishing a step or its run. Outcome sounds play once per identity (a remount never replays them). Cues obey the silent switch and the person's Sound and touch switches; hot cues have a two-player pool; players load at launch.
- Synthesised interface cues are defined once in `packages/ui-tokens/sound.json` and rendered to WAV by `render-sounds.mjs`.

## The kit (apps/mobile/src/components)
Every lane builds from these; `/dev/gallery` shows each in every state.
- **kit/**: Button, Surface (Panel, SectionLabel, KeyValue, Rule), ListRow, Segmented, Switch, SearchField, FilterChips, Keypad, AmountPad (viem base units, 1/4 1/2 3/4 All), HoldButton, SlideToConfirm, DisclosureRow, QuietLine, ProgressBar, ChangeChip, ActionCircle, CountdownRing, LiveOdometer / RollingFigure, Sparkline, GlassPlate, the states (Skeleton, LoadingState with shaped skeletons, EmptyState, ErrorState, StaleTick, OfflineStrip, ReadView) and the waits (useHeldLoading, useWaitClock, WaitingText). Colours, sizes and motion come from `kit/theme.ts`, a thin shim over the tokens.
- **tx/**: BlockedCta, TxCta, TxSteps, TxMorph, TxFailureCard, useTxLifecycle, and the intent journal with recovery.
- **sheet/**: the root sheet host (detents 0.62 / 0.88 / 1, closes past 25 % or on a flick, the page steps back to 0.96, the dock hides), and the same API as a 384 px right drawer on a desktop window.
- **shell/**: the Dock, the desktop Rail (248 / 88 px, springing active pill), the ModeCapsule, the live region.
- **toast/**: ToastHost and `notify` (a toast with its cue).
- Skia parts have `.web.tsx` twins (NumberFlow, SVG) so the web build never loads CanvasKit.

## Page grammar
- **One hero figure per surface**; detail behind one disclosure; at most four facts at rest; no explainer sentence under controls.
- **Inputs and the CTA fit 375 × 812**; the action is a 56 pt plate pinned above the keyboard.
- **Sheets** open at their content size or at 0.62 for lists; the heading is centred under the handle; the scrim and Back close it.
- **Desktop**: a floating rail and one stage with 24 px corners, 16 px off the window; sheets become right drawers.

## States (every surface, designed)
- **Loading**: a skeleton shaped like the real layout, held at least 300 ms, never a spinner page, never a fake $0.
- **Empty**: says why and names the next action.
- **Error**: says what still works, plus one action (the fix, or Retry); technical text behind a disclosure.
- **Offline**: cached values stay at full ink, marked stale with their time.
- **Waits**: a short verb that shimmers ("Pricing", "Bridging"), elapsed seconds after 3 s, "Still waiting · Retry" at about 15 s.

## Money lifecycle
- A blocked CTA names its fix ("Add money", "Set a budget") and does it. Never "Soon", never a grey ghost.
- In flight the CTA never looks disabled: the face names the phase, a bar fills its edge, Signing → Sent → Confirmed run under it.
- It morphs into its receipt. A failure card always says whether money moved; a lost answer is "waiting on the chain" and is never re-sent.
- The intent is journalled after the signature and before the send, survives a kill, and recovery only reads its status.

## Rules
- Magenta only for trade, publish, selected controls, badges and focus. Never for errors, never as text on white.
- Up and down only for direction. Never colour alone: a sign, a word or a mark goes with it.
- The mode capsule is one tap (like dark/light) on Home and the desktop rail; the first switch to mainnet raises the consent sheet.
- No hex outside `packages/ui-tokens` and `kit/theme.ts`; no hard-coded strings (the `shell`, `feedback` and `network` catalogues, in all ten languages).
- Real marks for every token, chain, venue and pay method; generic icons are utility glyphs only.
- Motion on wrappers, colour on inner views.

## Banned
- Borders on content, shadows on groups, gradients, glow.
- Tracked uppercase section labels, explainer sentences under controls, text dumps.
- A spinner where a skeleton or an inline error belongs; "Soon", "Quote only" or a placeholder figure anywhere outside `/dev/gallery`.
- Colour as the only signal for network, direction, success or error.
- Tinting a logo or drawing a letter disc where a real mark exists.
