# Kawase design system: Lime on Ink

Purpose: the single source for every visual decision. Every colour, font, radius and motion value in the apps resolves to a token defined here. The values live in `packages/ui-tokens/tokens.json`; `pnpm --filter @kawase/ui-tokens build` generates `native.css` (Uniwind), `web.css` (docs and landing) and `tokens.ts`, then `check-contrast.mjs` fails the build if any text pair drops below 4.5:1.
Last updated: 2026-09-30 (the revamp, D34/D35)
Decision: Abu chose Koe (amber orb on a dark stage) on 2026-09-30, then, after seeing it built, rejected its colours and design intention and asked for a revamp from Codex's reference study of Solflare, Phantom and Fomo (`docs/design/reference-study-2026-09-30/`). The plan and the per-screen fidelity ledger are in `plan/design/REVAMP-PLAN.md`; the old system is tagged `koe-v0`.
Sources: the reference study (screen IDs S/P/F, motion M, components C, identity LG); `context/08-product-research/DECISIONS-FROM-ABU.md` (D15, D33, D35); the premium-ui skill (`blocklist.md`); Google Fonts axes (checked 2026-09-30).

## Direction
- One line: **electric lime on ink, silver objects that catch light, and real logos — money that moves when you speak.**
- The app is an ink stage with textured black cards, a floating glass dock and blur overlays. Lime is the one loud colour and is rationed to the primary action, the active dock item and live voice state. Real entity marks (USDC, Arc, Ethereum, Apple, Google…) keep their own colours; nothing is tinted.
- The orb is the voice symbol, not the home: it lives in the dock centre and rises over a blurred page when the user speaks.
- Onboarding is a story on colour fields with layered, stippled-silver objects; the app itself stays ink.
- Typing is always available; nothing depends on a microphone.

## Palette
Default mode: **dark** (ink). Light (paper) is a full second theme with its own relationships, not an inversion.

| Token | Dark | Light | Used for |
|---|---|---|---|
| background | `#0B0C10` ink | `#F7F8F4` paper | the stage |
| card | `#14161C` | `#FFFFFF` | cards and sheets |
| popover | `#171A21` | `#FFFFFF` | menus, the language sheet |
| foreground | `#F4F5F7` | `#101210` | primary text |
| muted-foreground | `#A0A6B4` | `#5C6158` | secondary text |
| secondary / muted | `#1C1F27` | `#ECEEE7` | quiet buttons, chips, input fills |
| border / input | `#262A34` | `#D9DCD2` | hairlines (deliberately faint; fills carry the shape) |
| primary | `#D4FF3A` lime | `#101210` ink | the one main action per screen |
| primary-foreground | `#0B0C10` | `#D4FF3A` | text on primary (lime is never text on white: 1.9:1) |
| accent | `#D4FF3A` | `#3F6600` olive | links, the active dock item, the live state |
| accent-foreground | `#0B0C10` | `#FFFFFF` | text on accent |
| destructive | `#FF5C5C` | `#C4262E` | errors and irreversible actions only; never lime |
| destructive-foreground | `#2A0505` | `#FFFFFF` | text on destructive |
| success | `#35D39B` mint | `#1A7F56` | confirmed, received, "available" — mint so lime stays exclusive |
| network | `#D4FF3A` | `#101210` | the network pill and the confirm button on mainnet |
| network-foreground | `#0B0C10` | `#D4FF3A` | text on the pill |
| network-surface | `#1E2A0A` | `#E6F5C2` | the pill's quiet background |
| glass | `#14161CA6` | `#FFFFFFB8` | the dock and blur overlays (over a blur) |
| glass-border | `#FFFFFF1F` | `#00000014` | the glass rim |
| scrim | `#000000A6` | `#0B0C1099` | behind sheets (dim, not blur) |
| texture | `#FFFFFF14` | `#0000000F` | the wave/stipple lines of the textured card |
| silver / silver-deep | `#C9CDD3` / `#6E7279` | `#9AA0A8` / `#5B6067` | the silver objects' light and shade |

**Testnet layer** (changes only `network`, `network-foreground`, `network-surface` and `ring`): sky `#4CC2FF` on `#0D2A3A` in dark, `#0A6AAB` on `#DDF0FB` in light. Sky is far from both lime and red, so the three states never blur into each other. The words "Testnet · no real money" are always shown with it; on mainnet, money cards carry a REAL MONEY eyebrow instead.

**The orb** takes three colours from `tokens.json`: lime `#D4FF3A`, `#F0FFC4`, `#5A7A12` on mainnet; sky `#4CC2FF`, `#C7ECFF`, `#0A4A7A` on testnet — the orb itself tells you which network you are on.

**Story fields** (`tokens.story.fields`, onboarding panels only, ink text on each): lime `#D4FF3A`, periwinkle `#7C8CFF`, mint `#8CF2C9`, coral `#FF7D6B`, ice `#DCE4F5`.

Contrast: every text pair is at least 4.5:1 (WCAG AA) in all four themes, plus ink on every story field, checked by `packages/ui-tokens/check-contrast.mjs` on every build. Hairlines are reported, not enforced.

## Typography
- Display: **Space Grotesk** (500–700). Screen titles, the big amount on tickets, the agent's spoken line. Bold, plain and geometric like the references' hierarchy, without being Inter.
- Body: **Manrope** (400–700, Latin + Cyrillic). Everything else.
- Mono: **JetBrains Mono** (400–600). Amounts in lists, addresses, codes; tabular figures; always left-to-right.
- Other scripts fall back to Noto on web: Noto Sans Arabic, Noto Nastaliq Urdu, Noto Sans Devanagari, Noto Sans Bengali, Noto Sans SC. Native uses the system fonts for those scripts (React Native takes one family per text style).
- Scale (px): 12 / 14 / 16 / 20 / 26 / 32 / 48 / 64 (64 is the amount on a ticket).
- Classes: `font-sans` (body), `font-display`, `font-mono`, with the normal weight classes. The family names come from `tokens.json`.
- How the fonts load: **native** — embedded at build time by the `expo-font` plugin in `apps/mobile/app.json` (a weight change needs a native rebuild); **web** — one Google Fonts stylesheet linked from `apps/mobile/src/app/+html.tsx`, generated into `tokens.ts` (`fonts.googleFontsHref`).

## Materials
- **Ink card**: `card` on `background` with a `border` hairline; no shadow.
- **Textured card**: black with a wave/stipple pattern in `texture` (Skia on native, an SVG pattern on web), for the balance card and receipts (Solflare S15's material).
- **Glass**: `glass` over a blur (`expo-glass-effect` on iOS 26+, `expo-blur` elsewhere, `backdrop-filter` on web) with a `glass-border` rim: the dock, the fan's backdrop, the voice overlay.
- **Scrim**: `scrim` behind sheets; sheets dim the page, overlays blur it.
- **Silver objects**: stippled/engraved monochrome vectors (dot size follows the light) — the koban coin, hanko seal, paper plane, glass orb, QR tile, silver flag, brand mark. Vector first (react-native-svg + Skia), one still frame each for reduced motion. Briefs in `plan/design/artwork/`.
- **Real marks**: from `@kawase/identity` only, with provenance; colour or mono variants; a labelled neutral disc when unknown; never a Lucide icon in a mark's place and never tinted lime.

## Spacing and shape
- Base unit 4px; scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- Radius: 24px cards and sheets (28px on the top corners of a bottom sheet), 16px inputs and rows, full pills for buttons, chips and the dock.
- Shadow: none. Depth comes from the card colour, hairlines, glass and blur. The only glow is the orb's core.
- Density: low. One primary action per screen; lists breathe (rows 56–64px, marks 44px).
- Logical spacing only (`ps-`/`pe-`/`ms-`/`me-`), so Arabic and Urdu mirror without per-screen work. Right-to-left is set per screen with `Direction` (ui-native) or `dir` (web), so the language can change without restarting the app. On native, text alignment comes from the `Text` component (never `text-start`, which React Native ignores), and anything moved with a transform needs an `rtl:` class.
- Uppercase and letter-spacing are for scripts that have capitals. Use `StateLabel`; never letter-space Arabic, Urdu, Hindi, Bengali or Chinese.
- No `dark:` classes: there are two dark themes (dark, testnet-dark) and `dark:` reaches only one. Colours come from tokens.

## Motion
Durations live in `packages/config/src/motion.ts` (no magic numbers). Starting points, declared as adaptations of the study's clips:
- Presses and hovers: 150ms ease-out. Sheets rising: 250ms with a dim scrim; nested child panels animate height; the parent is restored with its values.
- Story panel change (M01): the colour field and art travel horizontally inside the clipped canvas, the copy changes mid-travel, the footer never moves; ~900ms.
- Quick-action fan (M06): the plus becomes ×, the page blurs, four circles rise and scale with a 20–35ms stagger and a small overshoot into a vertical trailing column; 220–300ms.
- Voice overlay: the page blurs and darkens in 120–200ms; the orb rises from the dock to the centre; captions fade in by word; × restores the page.
- Page push (M11): native stack push with rounded moving corners.
- Dock (M09/M10): the active bubble slides with a spring; the header collapses on scroll.
- QR (M04): dots resolve from particles in ~700ms; a static dotted code with reduced motion.
- Completion (M18): the silver flag waves once, then the precise receipt.
- Ambient art (M05): slow float with independent phase; still with reduced motion.
- The orb reacts to voice level; with reduced motion it becomes a still ring and the state is carried by the label ("Listening", "Thinking", "Speaking").
- Money-moving confirmations never auto-dismiss. Reduced motion never shortens the hold time.

## Page grammar
- **Pushed page**: back chevron in a dim circle, a small illustration top-start, a large display heading, a muted one-line subtitle, content, the primary action fixed above the keyboard.
- **Method list**: full-width rounded rows, a leading functional icon or a trailing real provider mark, one dominant row, "or" before social options.
- **Amount ticket**: the amount alone in display type, dim while zero; preset chips; a custom keypad; the primary button carries the validation state.
- **Field with a state slot**: prefix inside the field, clear button, a fixed-height line under it for checking / error (×) / available (✓); the button dims until valid.
- **List row**: a 44px mark (real artwork; badges as separate overlays), title + muted sub-line, amount right-aligned in mono, status coloured with text; skeleton rows while loading; an inline error row with Retry on failure.
- **Sheet**: grab handle, title, optional subtitle, dim scrim, content-sized; tall sheets for detail; nested child with an explicit back chevron.
- **Context banner**: an info row at the top of the page — the testnet strip, "checking N pending…", a degraded dependency.

## Copy
- Short verbs, the amount first ("Send 20 USDC to Alex"), "network" not "chain", "your allowance" not "delegation".
- State names: Listening / Thinking / Speaking; money endings: pending / confirmed / reverted / unknown outcome.
- A disabled button names the first fixable reason ("Above your allowance — Face ID", "Not enough USDC for fees — top up", "Mainnet only — switch network"); the same words in UI, chat and voice.
- The product is Kawase (為替); the mark carries 為替, the wordmark is "Kawase".
- Every string exists in all ten catalogs; each language is listed in its own name and script.

## Interaction states
Every interactive component has hover, a visible focus ring (`ring`), active, disabled, loading, empty and error states. Every screen has its guest, loading, empty, error, offline, testnet, mainnet, light, dark, LTR and RTL states.

## Rules
- **One primary action per screen.** Lime is for that action, the active dock item and live state, nothing else. Never for errors.
- **The language pill is on the first onboarding panel** and every onboarding screen, guest home and Settings; a change is instant, including direction.
- **The network pill in the header is the toggle** (D15): one tap, instant both ways; the first mainnet switch raises the consent sheet; strip + pill + eyebrow are the three indicators, never colour alone.
- **Voice is never the only way.** Every voice action has a tap equivalent, and the keyboard button is always visible.
- **What was heard is always shown** before anything is confirmed, and the confirm card shows the exact amount, asset, recipient and network.
- **No prompt inside the allowance; Face ID above it** (D33). Inside the allowance the agent just sends and says so. Above it, the confirm card shows the exact amount, asset and recipient, and one Face ID approves. A spoken "yes" alone never approves a payment.
  - In chat the person's message is the request: a proposal that the policy routes inside the allowance is approved as it is made, and the card opens on the moving plane. After a fix made on a card (a saved contact, a chosen currency, a sign-in) the same request carries on by itself. Anything routed to Face ID (above what is left of the allowance, EURC, a first payment above the new-recipient threshold, a lookalike address) waits on the card.
  - On the send screen the Send button is not a prompt: it is the person's request itself (they typed the amount and chose the recipient there).
  - The button names the device's real check (Face ID, Touch ID, face unlock, fingerprint, passcode). Only an explicit approval continues; a device with nothing to check with cannot approve and says how to fix that.
- **Hold-to-confirm is for actions that cannot be undone and do not go through Face ID** (revoking the agent, removing a contact). Payments use the Face ID button. The hold time is never shortened by reduced motion, and a screen reader's double tap counts as the deliberate gesture.
- **Quiet states are grey, not lime.** Hover and pressed states of secondary, outline and ghost buttons use `muted`.
- **Real marks, distinct roles.** Asset mark ≠ chain badge ≠ status chip ≠ avatar. Generic icons never stand in for a known entity.
- **Motion on wrappers, colour on inner views**, so a theme change during an animation cannot leave stale colours.

## Components
- Web: 21st.dev and the premium registries, installed into `packages/ui-web/src/components/ui` and reskinned to these tokens (picks listed in `plan/stages/02-design-system-component-sourcing.md`). Kawase compositions sit one folder up, in `packages/ui-web/src/components`.
- Native: React Native Reusables on Uniwind in `packages/ui-native/src/components/ui`, and the native twins one folder up, built to match the web components prop for prop. Never AI-generated designs (D28).
- Identity: `packages/identity` — the registry of real marks keyed by chain id / token address / provider slug, with `PROVENANCE.md`, and the `Mark` component for both platforms.
- The orb is the same shader on both platforms: WebGL on web, Skia on native. Its three colours come from `tokens.json`, and the voice level is a prop.
- Every state of every base component is visible at `/dev/gallery`, and the whole direction at `/dev/board`, with `?mode=light|dark&network=mainnet|testnet&lang=en|ar`.

## Banned (on top of the premium-ui blocklist)
- Inter, Roboto, Arial or the system font as the brand font.
- Purple or blue-to-pink gradients; gradient text.
- Amber accents (the previous direction), and lime for anything that is not the primary action, the active dock item or live state.
- The same colour for brand accent and for errors.
- Generic coin, dollar or wallet icons where a real entity mark exists; tinting a logo; taking marks from screenshots.
- Placeholder people, amounts or copy from installed components.
- Colour as the only signal for network, success or error.
- A spinner where a skeleton or an inline error belongs.
