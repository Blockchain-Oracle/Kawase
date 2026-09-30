# Kawase design system (DRAFT: waiting for Abu to choose one of three directions)

Purpose: the single source for every visual decision. Every colour, font, radius and motion value in the apps must resolve to a token defined here. The token values live in `packages/ui-tokens/directions.json` (three candidate sets) until Abu chooses; then the chosen set becomes `tokens.json` and the other two are deleted.
Last updated: 2026-09-30
Sources: `plan/MASTER-PLAN.md` §21st.dev sourcing workflow; `context/08-product-research/14-ui-and-docs/recommendation.md`; the premium-ui skill (`design-md-template.md`, `blocklist.md`); 21st.dev themes used as palette seeds (named per direction); Google Fonts subset lists (checked 2026-09-30).

## Fixed for every direction (not up for choice)
- **Product:** Kawase (為替, "money order / exchange"), a voice-first, multilingual AI agent for money on Arc, for consumers and small businesses.
- **Token names:** shadcn's contract (`background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`) plus `success` and three network tokens (`network`, `network-foreground`, `network-surface`).
- **Themes:** light, dark, and a testnet layer over each (four Uniwind themes). Testnet changes only the three network tokens and `ring`; it never uses the error colour. Testnet is never signalled by colour alone: the words "Testnet · no real money" are always shown.
- **Contrast:** every text pair in `directions.json` is at least 4.5:1 (WCAG AA), checked by script for all four themes of all three directions.
- **Languages:** en, zh, hi, es, fr, ar, bn, pt, ru, ur. The brand fonts cover Latin (and Cyrillic for body text). Other scripts use Noto: Noto Sans SC, Noto Sans Devanagari, Noto Sans Bengali, Noto Sans Arabic, Noto Nastaliq Urdu. Numbers, amounts and addresses stay left-to-right and use the mono font with tabular figures.
- **Layout:** logical spacing only (`ps-`/`pe-`/`ms-`/`me-`, `text-start`), so Arabic and Urdu mirror without per-screen work.
- **Spacing:** 4px base; scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- **Type scale (px):** 12 / 14 / 16 / 20 / 24 / 32 / 48.
- **States:** every interactive component has hover, visible focus ring (`ring`), active, disabled, loading, empty and error states.
- **Motion:** 150ms ease-out for presses and hovers; 250ms for sheets and cards entering; money-moving confirmations never auto-dismiss; all motion respects reduced-motion.
- **Components:** web from 21st.dev and the premium registries (installed, never generated); native twins from React Native Reusables on Uniwind.

## Direction A: Tegami (手紙, "letter"). Conversation-first, calm paper
- One line: the home screen is the conversation; money appears inside it as receipts, like letters kept in a drawer.
- Palette seed: 21st themes "Vintage Paper" and "Vermilion Clay" (@serafimcloud), finalised by hand. Default mode: light.
- Light: background `#F5F0E6`, card `#FFFCF5`, text `#1E1A15`, secondary text `#6A6153`, border `#DDD3BF`, primary (ink) `#1E1A15`, accent (pine) `#2C6650` for confirm actions and success only, destructive `#B3261E`.
- Dark: background `#171411`, card `#201C17`, text `#F2EBDD`, secondary text `#A79C88`, border `#352F26`, primary `#F2EBDD`, accent `#6FBF9F`, destructive `#F2867D`.
- Testnet layer: violet `#5B3FC0` (light) / `#B3A0F7` (dark).
- Fonts: Newsreader (display, headings and amounts), Golos Text (body, Latin + Cyrillic), IBM Plex Mono (addresses).
- Shape: 14px cards, 10px inputs, full pills; hairline borders, almost no shadow.
- Density: low. One column, generous line height.

## Direction B: Chōba (帳場, "the counter where the ledger is kept"). Wallet-first, dense
- One line: the home screen is your money (balance, actions, activity); the agent is a command bar that is always one tap away.
- Palette seed: 21st themes "Indigo Mono" and "Graphite Mono" (@serafimcloud), finalised by hand. Default mode: dark.
- Dark: background `#0D1014`, card `#141920`, text `#E7EBF0`, secondary text `#8C97A6`, border `#242D38`, primary (indigo) `#8290FF`, destructive `#FF6B5E`, success `#3DD68C`.
- Light: background `#F3F5F8`, card `#FFFFFF`, text `#10151C`, secondary text `#566171`, border `#D6DCE4`, primary `#3B47D6`, destructive `#C62F22`, success `#0F7A57`.
- Testnet layer: amber `#F5B038` (dark) / `#8A5200` (light).
- Fonts: IBM Plex Sans (display and body, Latin + Cyrillic), IBM Plex Mono (all numbers).
- Shape: 8px cards and inputs; 1px borders, no shadow.
- Density: high. Tables, tabular numbers, more per screen.

## Direction C: Koe (声, "voice"). Voice-first stage
- One line: the home screen is the orb; you talk, captions show what was heard, and cards rise from the bottom to be confirmed.
- Palette seed: 21st theme "Amber Mono" (@serafimcloud) on a near-black base, finalised by hand. Default mode: dark.
- Dark: background `#0A0A0B`, card `#151517`, text `#F5F1E8`, secondary text `#9A968C`, border `#29292D`, primary (lantern amber) `#FFB224`, destructive `#FF6369`, success `#4CC38A`.
- Light: background `#FAF8F3`, card `#FFFFFF`, text `#141312`, secondary text `#625E56`, border `#DEDACF`, primary (ink) `#141312`, accent `#965A00`, destructive `#C4262E`, success `#1A7F56`.
- Testnet layer: sky `#4CC2FF` (dark) / `#0A6AAB` (light).
- Fonts: Bricolage Grotesque (display), Manrope (body, Latin + Cyrillic), JetBrains Mono (numbers).
- Shape: 20px cards and sheets, full pills; soft glow only around the orb.
- Density: very low. One thing on screen at a time, large type.

## Banned (on top of the premium-ui blocklist)
- Inter, Roboto, Arial or the system font as the brand font.
- Purple or blue-to-pink gradients; gradient text.
- The same red for brand accent and for errors.
- Placeholder people, amounts or copy from installed components ("John Doe", "$1,234.56", "Lorem ipsum").
- Colour as the only signal for network, success or error.
- AI-generated components (D28).
