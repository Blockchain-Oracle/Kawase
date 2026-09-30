# Spike 8: UI stack (Uniwind + React Native Reusables on native, a 21st.dev component on web, one token file)

Code: `plan/spikes/code/08-ui-stack/` (`mobile/` holds the temporary screen, the card spec and both card twins; `shoot-web.mjs` screenshots the web build and reads back computed colours). Screenshots in the same folder: `ios-light.png`, `ios-testnet-dark.png`, `ios-testnet-rtl.png`, `web-dev-testnet-dark.png`, `web-dev-testnet-rtl.png`, `web-export-testnet-dark.png`.
Date: 2026-09-30
**Result: PASS.** One card spec renders as a native card (RNR + Uniwind) on the iOS simulator and as a web card (a 21st.dev DOM component) in Chrome, both coloured by the same token file, in light, dark, testnet, testnet-dark and Arabic RTL. The production web export under `web.output: "server"` also works. Android not run (no emulator on this Mac).

Docs read first: Uniwind setup + theming references (github.com/uni-stack/uniwind `skills/uniwind/references/`), the RNR `minimal-uniwind` template and CLI source (github.com/founded-labs), Expo SDK 57 `router/web/server-rendering` and `api-routes`, the 21st CLI skill.

## What is now in the repo (kept)
- `apps/mobile`: `uniwind` 1.12.0 + `tailwindcss` 4.3.3, `metro.config.js` (`withUniwindConfig`, `extraThemes: ['testnet','testnet-dark']`), tokens in `src/global.css`, `components.json`, RNR `card`, `button`, `text`, `badge` (installed with `npx @react-native-reusables/cli add … --styling-library uniwind`), `<PortalHost />` in the root layout, `web.output: "server"`.
- `packages/ui-web` (new, as planned): shadcn `components.json` with `@kawase/ui-web/*` aliases, and the 21st component `kavikatiyar/order-confirmation-card` (id 9038) installed with the shadcn CLI, plus its shadcn `button`.
- The temporary screen and tabs are removed from the app.

## Results
- **Native:** the RNR card renders from the spec; `Uniwind.setTheme()` switches all four themes at runtime; `direction: 'rtl'` flips the rows and `text-start` follows it.
- **Web (Expo web, dev server and production export):** the 21st card (DOM + Tailwind + framer-motion + lucide-react + Radix Slot) renders inside the Expo app from a `.web.tsx` twin. Computed colours change per theme (the button is neutral on light/dark and violet on testnet/testnet-dark), RTL moves the row label from x=49 to x=367, and the button press returns the spec's action id.
- **`web.output: "server"`:** `npx expo export --platform web` prerendered 6 routes, including the 21st card, and `npx expo serve` served them.
- **One token file:** `apps/mobile/src/global.css` feeds both. `@source '../../../packages/ui-web/src'` makes Tailwind scan the shared package.

## Findings (these shape Stage 2)
1. **Pin `react-native-web` to 0.21.2 for now.** Uniwind 1.12.0's web build fails on 0.21.3 (`Unable to resolve module ./exports/InputAccessoryView`). Upstream: uni-stack/uniwind#695, fixed on main by #697 (merged 2026-09-29), not released. The pin is in `pnpm-workspace.yaml` with a note to remove it.
2. **Web and native components cannot share a folder.** shadcn/21st installs write `components/ui/button.tsx`, the same path RNR uses. Web installs go to `packages/ui-web`, native ones stay in the app (later `packages/ui-native`), and a `.web.tsx` twin picks the web one.
3. **Use package-name aliases in `packages/ui-web`, not `@/`.** With `@kawase/ui-web/components` and `@kawase/ui-web/lib/utils` as the shadcn aliases plus matching `exports` in its `package.json`, Metro resolves the installed files as written. `@/` would resolve to the app's own folder and pick the native button.
4. **Third-party components ignore `className` until wrapped.** `SafeAreaView` from `react-native-safe-area-context` kept a light background in dark themes; `withUniwind(SafeAreaView)` fixed it (verified). Wrap such components once in `ui-native`.
5. **A testnet layer means two extra themes.** Uniwind themes are flat, so testnet needs `testnet` and `testnet-dark`, and every theme must define every variable. The spike adds three `network` tokens (`network`, `network-foreground`, `network-surface`) that are neutral on mainnet and tinted on testnet; the violet is a placeholder, the real palette is Abu's Stage 2 choice.
6. **In SDK 57, `web.output: "server"` means prerendered pages + API routes, not per-request rendering** (that needs `unstable_useServerRendering`; Expo docs). So web components must render without `window`, and anything that differs between the prerender and the browser (the active theme, the locale) must be applied with CSS classes, not by rendering different text: the spike's debug line caused a React hydration warning (#418) for exactly that reason.
7. **21st installs need a short review pass** (the plan's "reskin" step, confirmed): the card had fixed order fields and labels, framer-motion types that no longer compile against framer-motion 13 (fixed with `Variants`), and a bare `border` class that relies on shadcn's base rule for the border colour. None of it blocked.
8. The docs and landing apps (plain Tailwind, no Uniwind) cannot import the Uniwind-flavoured `global.css` directly, so `packages/ui-tokens` should still generate a plain `web.css` from the same source, as planned.
9. The build machine ran out of disk during the iOS rebuild (DerivedData + pods). Keep a few GB free before native builds.

## Decision
Keep the planned stack: Uniwind + RNR on native, 21st/shadcn DOM components on web through `.web.tsx` twins, one token source. No fallback needed.
