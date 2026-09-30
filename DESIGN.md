# Kawase design system: Koe (声, "voice")

Purpose: the single source for every visual decision. Every colour, font, radius and motion value in the apps resolves to a token defined here. The values live in `packages/ui-tokens/tokens.json`; `node packages/ui-tokens/build.mjs` generates `native.css` (Uniwind), `web.css` (docs and landing) and `tokens.ts` from it.
Last updated: 2026-09-30 (fonts, native package and gallery added)
Decision: Abu chose Direction C, Koe, on 2026-09-30 and said he likes its colours (`context/08-product-research/ABU-BRIEF-VERBATIM.md`). The two other candidates are described in `plan/design/DIRECTIONS.md`.
Sources: `plan/MASTER-PLAN.md` §21st.dev sourcing workflow; `context/08-product-research/14-ui-and-docs/recommendation.md`; the premium-ui skill (`design-md-template.md`, `blocklist.md`); 21st.dev theme "Amber Mono" (@serafimcloud) as the palette seed; Google Fonts subset lists (checked 2026-09-30).

## Direction
- One line: a voice-first money agent on a dark stage. The orb is the home screen; you talk, captions show what was heard, and cards rise from the bottom to be confirmed.
- Anchor: the Koe home screen as built, `plan/design/gallery/ios-home-dark-mainnet-en.png` (route `/dev/home-sample`, sample content). The earlier mock-up in `plan/design/directions/koe-dark-mainnet.png` predates the Face ID decision (D33) and still shows a hold button for a payment.
- Typing is always available (the keyboard button opens the conversation), so nothing depends on a microphone.

## Palette
Default mode: **dark**. Light is a full second theme, not an afterthought.

| Token | Dark | Light | Used for |
|---|---|---|---|
| background | `#0A0A0B` | `#FAF8F3` | the stage |
| card / popover | `#151517` | `#FFFFFF` | sheets and cards |
| foreground | `#F5F1E8` | `#141312` | primary text |
| muted-foreground | `#9A968C` | `#625E56` | secondary text |
| secondary / muted | `#1D1D20` | `#EFECE4` | quiet buttons, chips |
| border / input | `#29292D` | `#DEDACF` | hairlines |
| primary | `#FFB224` (lantern amber) | `#141312` (ink) | the one main action per screen |
| primary-foreground | `#1A1200` | `#FAF8F3` | text on primary |
| accent | `#FFB224` | `#965A00` | the state label, active nav |
| destructive | `#FF6369` | `#C4262E` | errors and irreversible actions only |
| destructive-foreground | `#2A0507` | `#FFFFFF` | text on destructive |
| success | `#4CC38A` | `#1A7F56` | confirmed and received |
| network | `#FFB224` | `#141312` | the network chip and the confirm button |
| network-surface | `#2E2208` | `#EFECE4` | the chip's background |

**Testnet layer** (changes only `network`, `network-foreground`, `network-surface` and `ring`): sky `#4CC2FF` on `#0D2A3A` in dark, `#0A6AAB` on `#DDF0FB` in light. It is never the error colour, and the words "Testnet · no real money" are always shown with it.

**The orb** takes three colours from `tokens.json`: amber `#FFB224`, `#FFE2A8`, `#B54A00` on mainnet; sky `#4CC2FF`, `#C7ECFF`, `#0A4A7A` on testnet. So the orb itself tells you which network you are on.

Contrast: every text pair is at least 4.5:1 (WCAG AA) in all four themes, checked by script.

## Typography
- Display: **Bricolage Grotesque** (500–700). The agent's spoken line, screen titles.
- Body: **Manrope** (400–700, Latin + Cyrillic). Everything else.
- Mono: **JetBrains Mono** (400–600). Amounts, addresses, anything numeric; tabular figures; always left-to-right.
- Other scripts fall back to Noto: Noto Sans Arabic, Noto Nastaliq Urdu, Noto Sans Devanagari, Noto Sans Bengali, Noto Sans SC.
- Scale (px): 12 / 14 / 16 / 20 / 26 / 32 / 48. The agent's line is 26 on the stage.
- Classes: `font-sans` (body), `font-display`, `font-mono`, with the normal weight classes (`font-medium`, `font-semibold`, `font-bold`). The family names come from `tokens.json`.
- How the fonts load:
  - **Native:** the three brand fonts are embedded at build time by the `expo-font` plugin in `apps/mobile/app.json` (one family name per font, weights picked by `fontWeight`). Adding or removing a weight needs a native rebuild.
  - **Web:** one Google Fonts stylesheet, linked from `apps/mobile/src/app/+html.tsx`; the address is generated into `tokens.ts` (`fonts.googleFontsHref`) from `tokens.json`.
  - **Other scripts on native (Claude's proposal, not reviewed by Abu):** React Native takes one font per text style and has no fallback list, so Arabic, Urdu, Hindi, Bengali and Chinese use the fonts that ship with iOS and Android instead of embedded Noto files (Noto Sans SC alone is several megabytes). The Noto list above applies to web. The gallery's "Type" section shows the result on each platform.

## Spacing and shape
- Base unit 4px; scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- Radius: 20px cards and sheets (28px on the top corners of a bottom sheet), full pills for buttons and chips.
- Shadow: none. Depth comes from the card colour and hairline borders. The only glow is the orb.
- Density: very low. One thing on screen at a time.
- Logical spacing only (`ps-`/`pe-`/`ms-`/`me-`), so Arabic and Urdu mirror without per-screen work. Right-to-left is set per screen with `Direction` (ui-native) or `dir` (web), so the language can change without restarting the app. On native, text alignment comes from the `Text` component (never `text-start`, which React Native ignores), and anything moved with a transform needs an `rtl:` class.
- Uppercase and letter-spacing are for scripts that have capitals. Use `StateLabel`; never letter-space Arabic, Urdu, Hindi, Bengali or Chinese.
- No `dark:` classes: there are two dark themes (dark, testnet-dark) and `dark:` reaches only one. Colours come from tokens.

## Motion
- Presses and hovers: 150ms ease-out.
- Sheets and cards rising: 250ms.
- The orb reacts to voice level; with reduced motion it becomes a still ring and the state is carried by the label ("Listening", "Thinking", "Speaking").
- Captions fade in by word.
- Money-moving confirmations never auto-dismiss.

## Interaction states
Every interactive component has hover, a visible focus ring (`ring`), active, disabled, loading, empty and error states.

## Rules specific to this direction
These are Claude's proposals that follow from the direction; Abu has not reviewed them one by one and can change any of them.
- **One primary action per screen.** Amber is for that action and the current state label, nothing else.
- **Voice is never the only way.** Every voice action has a tap equivalent, and the keyboard button is always visible.
- **What was heard is always shown** before anything is confirmed, and the confirm card shows the exact amount, asset and recipient.
- **No prompt inside the allowance; Face ID above it.** Inside the user's allowance the agent just sends and says so. Above it, the confirm card shows the exact amount, asset and recipient, and one Face ID (the wallet's passkey) approves. A spoken "yes" alone never approves a payment above the allowance.
- **Hold-to-confirm is for actions that cannot be undone and do not go through Face ID** (for example cancelling an automation or removing a contact). Payments use the Face ID button, not a hold. The hold time is never shortened by the reduced-motion setting, and a screen reader's double tap counts as the deliberate gesture.
- **Quiet states are grey, not amber.** Hover and pressed states of secondary, outline and ghost buttons use `muted`.

## Components
- Web: 21st.dev and the premium registries, installed into `packages/ui-web/src/components/ui` and reskinned to these tokens (picks listed in `plan/stages/02-design-system-component-sourcing.md`). Small Kawase compositions of those parts (confirm sheet, composer, network chip) sit one folder up, in `packages/ui-web/src/components`.
- Native: React Native Reusables on Uniwind in `packages/ui-native/src/components/ui`, and the native twins of the web components one folder up, built to match them prop for prop. Never AI-generated designs (D28): each twin names the web component it copies.
- The orb is the same shader on both platforms: WebGL on web, Skia on native. Its three colours come from `tokens.json`, and the voice level is a prop (the app owns the microphone).
- Every state of every base component can be seen at the internal route `/dev/gallery` (and the home composition at `/dev/home-sample`), with `?mode=light|dark&network=mainnet|testnet&lang=en|ar`.

## Banned (on top of the premium-ui blocklist)
- Inter, Roboto, Arial or the system font as the brand font.
- Purple or blue-to-pink gradients; gradient text.
- Amber for anything that is not the primary action or the current state.
- The same colour for brand accent and for errors.
- Placeholder people, amounts or copy from installed components.
- Colour as the only signal for network, success or error.
