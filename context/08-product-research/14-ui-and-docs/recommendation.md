# Recommendation: cross-platform UI architecture that honors D19 (21st.dev)

Purpose: one opinionated UI architecture for web, iOS, Android and desktop (PWA) that uses 21st.dev wherever it can run, keeps one design language on native, renders the genUI card catalog on both, and covers theming (dark/light + testnet hue), i18n/RTL and accessibility. **Everything in this file is [INFERENCE]** built on the [VERIFIED] facts in the sibling files.

Sources: `21st-dev.md`, `component-sourcing.md`, `docs-site.md` (each with its primary sources); `../DECISIONS-FROM-ABU.md` (D3, D4, D10, D15–D22); `../05-voice-language-genui/generative-ui.md`; `../06-mobile-desktop-platform/recommended-stack.md`, `cross-platform-options.md`; `../12-network-toggle/recommendation.md`; `../09-voice-decision/README.md`; Expo docs (DOM components, platform extensions, Tailwind, localization); Uniwind docs (themes, ScopedTheme, LayoutDirection).
Verified: 2026-09-29

---

## 1. The one-paragraph answer

21st.dev is React DOM + Tailwind + shadcn, with no React Native support. So **"use 21st.dev" is honored literally on every web surface and by design-spec on native.** The web app, the landing/showcase page and the docs site install real 21st (and Aceternity / Magic UI / KokonutUI / Motion-Primitives) components. The Expo native app uses **React Native Reusables (shadcn's RN port) on Uniwind**, plus curated native specialists (HeroUI Native, gorhom bottom sheet, sonner-native, victory-native, LiveKit visualizers). Each native component is built to match the 21st component chosen for the same slot. Both sides read **one shadcn-named token set in Tailwind v4 CSS**. Hand-rolling is limited to thin glue, and it is declared when used (premium-ui rule).

## 2. Surfaces and which component system renders them

| Surface | Runtime | Component system | 21st used? |
|---|---|---|---|
| iOS / Android app | Expo SDK 57, Expo Router, Hermes | RNR (Uniwind variant) + HeroUI Native (sheets, toasts, OTP, list groups) + specialists (§2a) | As **design spec** (pick in 21st → match natively). DOM-component escape hatch only for non-critical visuals |
| Web app (the iPhone path, D10) + desktop PWA | Same Expo app, `expo export -p web` | **`.web.tsx` platform files** render real 21st/shadcn TSX (react-dom + Tailwind v4) for high-visibility components; shared routes/logic stay universal | **Yes, literally** (install via `21st add` / `shadcn add`) |
| Landing / showcase (D20) | Next.js 16 app (same deployable as the docs) | 21st + premium registries via the premium-ui pipeline | **Yes, fully** |
| Docs (D20) | Fumadocs 16 (`docs-site.md`) with the `shadcn` preset | Fumadocs UI + the same shadcn/21st components in MDX | **Yes** |

**Why `.web.tsx` in one Expo app, not a second Next.js web app.** Expo Router supports platform extensions in `src/app` when a universal file also exists, and on web "you can use React DOM directly" [VERIFIED]. That keeps one router, one deploy and one state layer, which `06/recommended-stack.md` asked for ("Don't … add Solito/Next.js next to Expo"). It still lets the web app use real 21st code. Most leaf components are two files anyway (`Card.tsx` native, `Card.web.tsx` web) because the genUI plan already needs "two registries" (`05/generative-ui.md` §4).
**Fallback if the day-1 spike fails** (shadcn/21st under Expo web is untested, see §9): use RNR on web too. It renders through react-native-web with the same tokens. Keep 21st for landing + docs + marketing-grade web-only pieces. This still satisfies D19 on web surfaces.

### 2a. Native specialists (versions [VERIFIED] npm 2026-09-29)
- Primitives: RNR components (30, shadcn names) via `@react-native-reusables/cli` 0.7.1 (`--styling-library uniwind`); RN Primitives underneath.
- Styling engine: **Uniwind 1.12.0** (Tailwind v4; custom themes; `ScopedTheme`; `LayoutDirection`). Chosen over NativeWind because stable NativeWind 4.2.7 targets Tailwind v3 and v5 is still `5.0.0-rc.0`. Uniwind is also what RNR, HeroUI Native and assistant-ui RN support. Free tier is enough; Pro (C++ engine, className animations) is optional.
- Sheets: `@gorhom/bottom-sheet` 5.2.14 (or HeroUI Native `BottomSheet`, which peers on it). Toasts: `sonner-native` 0.27.0, which mirrors web `sonner` 2.0.8 so toast calls look the same on both sides. Charts: `victory-native` 42.0.1 (Skia). Lists: `@shopify/flash-list` 2.3.2. Keyboard: `react-native-keyboard-controller` 1.22.5. Motion: Reanimated 4.7.0. Icons: `lucide-react-native` 1.48.0 (21st components mostly use `lucide-react`, so it's the same icon set).
- Voice visuals: `@livekit/react-native` 3.0.0 `BarVisualizer` / `useMultibandTrackVolume`, optionally a Skia shader orb (`@shopify/react-native-skia` 2.13.1). Web: a 21st orb (`ogl`/`three`) or LiveKit Agents UI visualizers.
- Settings: `@expo/ui` Universal `List` / `FieldGroup` / `Switch` / `Picker` (SwiftUI/Compose-backed) where platform-native feel beats a ported design.
- Chat shell: `@assistant-ui/react-native` 0.1.44 is optional. It is young, so adopt it only if the spike shows it saves real work over RNR + FlashList.

## 3. Shared design tokens (one source of truth)

```
packages/tokens/
  tokens.css        # Tailwind v4 CSS: shadcn semantic names in :root/.dark (web) and @variant light/dark/… (Uniwind)
  tokens.ts         # generated TS constants for non-className needs (Skia shaders, charts, status bar)
```

- **Names = shadcn's contract** (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--radius`). 21st components, Fumadocs' `shadcn` preset and RNR all read these, so a 21st component reskins by token, not by edit (the 21st registry rules forbid hard-coded brand colors).
- Add product tokens beside them with the same names in every theme: `--testnet`, `--testnet-foreground`, `--mainnet` (plus `--success`/`--warning` if needed). Uniwind warns in dev if a theme misses a variable [VERIFIED docs].
- **Seed** the palette from a 21st theme (`21st search "<mood>" --type theme` → `21st theme <id>`), then finalize by hand in `DESIGN.md` (premium-ui Phase 0: non-Inter font, spacing, radius, motion, blocklist). Record decisions in `.21st/design.json`.
- **Web** imports `tokens.css` into Tailwind v4 (`@theme inline` mapping). **Native** imports the same file into Uniwind's `global.css` (`@import 'tailwindcss'; @import 'uniwind';`). Whether one file serves both unchanged, or needs a tiny build step that emits the `:root/.dark` form and the `@variant` form from one JSON, is a spike item. If a build step is needed, keep it a ~50-line script, not a framework.
- Fonts: one brand pairing (non-Inter per the blocklist) that covers every script shipped under D4 (Latin, Cyrillic, Arabic, Devanagari, CJK as applicable), loaded with `expo-font` on native and `next/font` / CSS on web.

## 4. Theming: dark/light + the testnet hue

- Light/dark follow the OS by default, with an override in Settings (FEATURE-INVENTORY P). Uniwind switches themes without a ThemeProvider; web uses the `.dark` class.
- **Testnet is a token layer, not a theme fork.** It changes only the network accents (pill, bar, eyebrows) in both light and dark. It never touches the base palette, so the "like dark mode" toggle (D15) stays a single, instant variable flip. The hue is distinct from `--destructive` (per `12-network-toggle/recommendation.md`: "keep it distinct from error red") and has a contrast-checked foreground in each theme.
- Use Uniwind `ScopedTheme` / web `data-network="testnet"` scoping so money cards render their own network eyebrow correctly even in mixed lists (e.g. an activity feed showing both networks).
- Never rely on hue alone. The bar and eyebrows carry the words "Testnet · no real money" / "REAL MONEY" as fixed localized copy (≥2 indicators, `12-network-toggle`).

## 5. How the genUI card catalog renders on native and web

```
server tool output ──► validated spec {component, version, props}   (Zod, shared package; amounts/addresses from tools only)
                          │
            ┌─────────────┴──────────────┐
   web registry (*.web.tsx)          native registry (*.tsx)
   21st/shadcn components            RNR/HeroUI/specialists
   (json-render/react or             (json-render/react-native or
    in-house switch)                  in-house switch)
```

- Keep `05/generative-ui.md` §4 unchanged: `ai@7` `useChat` on both, one Zod catalog (`SwapQuoteCard`, `BridgeRouteComparison`, `ContactPicker` + `AddContactForm`, `ConfirmationSheet`, `AutomationEditor`, `Chart`, `Receipt`, `ErrorCard`, plus inventory L1/L6/L8/L9/L12), two registries, and writes only via `{planId, planHash}` → server re-validation.
- Per card: pick the 21st candidate (`component-sourcing.md` §3) → install on web → strip any data fetching (e.g. the CoinGecko call in Crypto Swap Card) so the card is pure props → build the native twin in RNR to the same spec. Both files export the same props type, inferred from the catalog Zod schema. That type is the compile-time guarantee that the twins stay in sync.
- The `ConfirmationSheet` is always native on mobile (biometric + reliability). It is never a DOM component and never model-rendered HTML.
- The same web registry renders cards in the docs (Fumadocs MDX) and on the showcase page, so screenshots and docs can't drift from the product.

## 6. i18n and RTL

- Strings: one message catalog shared by app (native + web) and docs UI, with `expo-localization` 57.0.2 for the device locale and an i18n library (`i18next` 26.4.2 / `react-i18next` 17.0.15 are current on npm; the library choice belongs to the plan). Components must take **all** text as props: strip hard-coded English from every installed 21st component during reskin (premium-ui Phase 4). Network copy, amounts and dates come from locale-aware formatters, never model text (`SMART-PRECONDITIONS.md` §5.9 per `12-network-toggle`).
- RTL (if Arabic/Urdu/Persian/Hebrew ship under D4): Expo's `I18nManager` handles native layout [VERIFIED localization guide; its note: on pre-58 SDKs RTL was "enabled by default, except in Expo Go"]. On iOS the language must also be in `supportedLocales` [VERIFIED]. Use logical Tailwind utilities (`ms-/me-/ps-/pe-`, `start-/end-`) and `rtl:` variants everywhere. Uniwind supports `rtl:`/`ltr:` and a `LayoutDirection` scope [VERIFIED]. Mirror directional icons (send arrows, chevrons). Keep numbers, amounts and addresses LTR inside RTL text. Fumadocs supports `dir="rtl"` [VERIFIED].
- Expect text expansion (FR/ES run longer than EN). Pills and segmented controls must wrap or truncate gracefully; check this in `21st review` and on device.

## 7. Accessibility

- Web: prefer 21st components built on Radix / Base UI (focus management, ARIA). Run `21st review` (semantic controls, accessible names, focus, touch targets, reduced motion, token drift) on every changed path [VERIFIED skill priorities].
- Native: set `accessibilityRole`/`accessibilityLabel`/`accessibilityState` on every interactive element. RNR's primitives and HeroUI Native ("built-in accessibility" [VERIFIED]) cover most of it. Voice is itself an accessibility path, but every voice action needs a tap equivalent (D5 + the voice-safety files).
- Motion: respect reduced-motion on both platforms (web `prefers-reduced-motion`; Reanimated's reduced-motion handling). The orb falls back to a static state indicator.
- Contrast: validate the testnet hue and eyebrows against AA in both themes, and never color-only (§4).
- Money amounts: screen-reader labels spell out currency and network ("12 USDC on Arc Testnet").

## 8. The 21st.dev workflow inside the build

1. **Setup (once):** upgrade CLI 1.15.0 → 1.17.1. `API_KEY_21ST` lives in env only (403 without it). `21st init --design-context` in the web workspace. Write `DESIGN.md` (premium-ui Phase 0). Register the premium namespaces in `components.json`.
2. **Direction:** `21st-ui-explore`. Three named directions for the chat + genUI + network surfaces, each differing on ≥2 axes. Abu picks. Record it in `.21st/design.json`.
3. **Per surface:** `21st search "<need>" --context auto` → shortlist from `component-sourcing.md` → visually compare → `21st add` (web) → reskin to tokens, port Tailwind v3-isms, fix `whileInView`, externalize strings → build the native twin in RNR/HeroUI to the same spec → report `component · author · URL · why` (premium-ui reporting rule).
4. **No catalog match** (e.g. bridge route comparison): compose from installed primitives. 21st AI `generate` needs a Builder + AI plan, which is **not enabled** on Abu's account today [VERIFIED `usage.txt`]. Ask Abu before relying on it.
5. **Review:** `21st review <paths>` on web files. For native files the tool's coverage is [UNKNOWN], so review against the same priorities by hand and on device. The 21st Design Bug Bot (PR reviews, 5 free) is optional for the repo.
6. **Optional:** publish our token theme with `21st publish-theme` (always public) or our cards to a private team library (`21st publish --private`). Not required.

## 9. Day-1 spikes (small, decisive)
1. **21st under Expo web:** in an Expo SDK 57 app, add one Radix-based and one Base-UI-based 21st component in a `.web.tsx` file with Tailwind v4 (PostCSS) alongside Uniwind. Pass: renders, portals work, dark mode token flip works, `expo export -p web` builds. Fail → fallback in §2.
2. **One token file, two engines:** the same `tokens.css` drives a web shadcn `Card` and a native RNR `Card` in light, dark and testnet.
3. **One genUI card twin** (`SwapQuoteCard`) through json-render or the in-house switch on both platforms (closes the gap in `05/generative-ui.md` §5).

## 10. What not to do
- Don't wrap the whole native app in DOM components to "use 21st on mobile". Expo recommends native views; DOM components can't host native views, don't share global state, and "do not support OTA updates" [VERIFIED].
- Don't mix NativeWind and Uniwind, or two component kits with different token names, without a single mapping layer.
- Don't adopt Tamagui or gluestack as the native base. They don't speak the shadcn token contract as directly as RNR, so 21st's reskin-by-token benefit is lost.
- Don't paste 21st AI sketch HTML (the skill forbids it). Rebuild in the real stack.
- Don't ship any installed component's placeholder copy, fake data or English-only strings (blocklist).
