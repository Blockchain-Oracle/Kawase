# Docs pack: desktop and web layouts (Expo Router + RNW + Uniwind), trading terminal, Tauri, Margin TradePanel

Written 2026-10-14. node_modules is NOT installed in this checkout, so nothing below was checked against installed `.d.ts` files; signatures come from the vendor docs (Context7) and from the repo source. Marked UNVERIFIED where unconfirmed.

## 1. Versions
- Pinned, no install needed: expo-router ~57.0.24, react-native-web 0.21.2 (0.21.4 exists, don't bump), uniwind 1.12.0, react-native-gesture-handler ~2.32.0, react-native-svg 15.15.4 (already used by `packages/ui-native/src/components/{candle-chart,area-chart}.tsx`), reanimated 4.5.1, worklets 0.10.1, Skia 2.6.2.
- Already in `apps/desktop`: Tauri CLI 2.12.1, `tauri` 2.12.1 (2.12.3 is current), deep-link 2.6.1, opener 2.7.0.
- To add for desktop polish: `cargo add tauri-plugin-window-state` (2.5.0 current) in `apps/desktop/src-tauri`. No new npm packages for the lane.
- Do NOT add: `lightweight-charts` 5.2.1 (web-only canvas), Skia web (CanvasKit). See section 4.

## 2. Layout
**Breakpoints.** Uniwind is mobile-first with Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536; custom ones go in CSS `@theme { --breakpoint-tablet: 820px; }` and are used as `tablet:p-4` ([Uniwind variants](https://docs.uniwind.dev/class-names), Context7 `/uni-stack/uniwind`). `useWide()` (>= 1024, web only) is the structural switch; use `lg:` classes only for spacing. Do not use `useWide` for a third tier; add `xl` (1280) for the terminal's right column via `useWindowDimensions` locally.

**Gotcha, SSR.** `web.output: "server"` renders on Node, where `useWindowDimensions` has no real window: the server pass is the phone layout and the client flips to wide at hydration. Kawase's `(app)/_layout.tsx` returns `null` while the session loads, so signed-in pages mostly dodge it. For any page that renders for guests on the server (`/markets`, token pages) prefer CSS-driven visibility (`hidden lg:flex` / `flex lg:hidden`) over a JS branch for the first paint. UNVERIFIED on this build.

**Hover and focus.** Uniwind lists `hover:*` under "unsupported" pseudo-classes in the docs, and its own group variants support only `group-active`/`group-focus` (not `group-hover`). `WEB_PRESSABLE` in `wide.ts` relies on `hover:` inside `Platform.select({web})`; UNVERIFIED whether Uniwind's web build passes it to CSS. Safe path that is documented in react-native-web: `Pressable` exposes `hovered`, `focused`, `pressed` to `style`/`children` callbacks; "hover is only activated by mouse" ([RNW Pressable](https://necolas.github.io/react-native-web/docs/pressable/), Context7 `/necolas/react-native-web`):
```tsx
<Pressable onHoverIn={prefetch} className="rounded-2xl p-3"
  style={({ hovered, focused }) => (hovered || focused) && Platform.OS === "web" ? { backgroundColor: tokens.muted } : null}>
```
Use that wherever `hover:` doesn't render; check once in the browser with `hover:bg-muted/60` before touching anything.

**Floating rail + one stage + right drawers.** Kawase already has this skeleton: `DesktopFrame` in `apps/mobile/src/app/(app)/_layout.tsx` (sidebar + `flex-1` stage, pushed pages capped at `WIDE_COLUMN_PX` 720 / `WIDE_PAGE_PX` 1180). Senryo's shell (`metropolis/apps/web/src/components/shell/{AppShell,Rail,DrawerHost}.tsx`, `lib/shell/drawer-param.ts`) adds: rail hides < 768; active pill moved by a CSS transform `--rail-i`; digit keys 1..9 jump to places; `?d=<name>` drawers. Port only the drawer idea:
```tsx
// (app)/_layout.tsx, inside DesktopFrame, next to <OverlayHost />
const { d, id } = useGlobalSearchParams<{ d?: string; id?: string }>();
const open = (name: string, extra?: Record<string, string>) => router.setParams({ d: name, ...extra });
const close = () => router.setParams({ d: undefined, id: undefined });
// <Drawer open={!!d} onClose={close} width={420}>{DRAWERS[d]?.({ id })}</Drawer>
```
`router.setParams` updates the URL without adding a history entry, so Back does NOT close the drawer, and it won't remount the page (Expo docs: [url-parameters](https://docs.expo.dev/router/reference/url-parameters/)). `router.push` to the same pathname with a new `d` would give Back-to-close but stacks a duplicate screen in a Stack (UNVERIFIED). Take `setParams` plus Escape (the overlay provider already closes on `Escape`). Drawer = absolute right column, `w-[420px]`, no scrim on `xl`, `role="dialog"`; phone keeps `@gorhom/bottom-sheet`.

**Keyboard shortcuts (web).** There's no hotkey library installed; copy Senryo's guard (`shortcutBlocked`: ignore when meta/ctrl/alt, in INPUT/TEXTAREA/SELECT/contentEditable, or a `[role="dialog"]` / `[aria-modal="true"]` is open, as `send/keypad.tsx` already does):
```tsx
export function useHotkeys(map: Record<string, () => void>) {
  React.useEffect(() => {
    if (Platform.OS !== "web") return;
    const on = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); return map["mod+k"]?.(); }
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[aria-modal="true"],[role="dialog"]')) return;
      map[e.key]?.();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [map]);
}
```
Suggested map: `mod+k` agent/search, `1..5` tabs, `b` buy, `s` sell, `l` long, `?` shortcuts help, `Esc` close. Mount once in `DesktopFrame`; memoize `map`.

## 3. Trading terminal (one component, two layouts)
Reference screens (Refero, from `08-references.md`): Kraken Pro 240a832f-54ad-4bda-978f-65c0fd1aa85f (ticket | book | chart), Coinbase Advanced 10b9ce87-5585-4fe7-8e34-f3fd0e350645 (chart | book | ticket, blocker inside the ticket), Wealthsimple 513dc9aa-2d88-474d-a505-be5bb6760045 (table left, ticket right).

One `Terminal` in `apps/mobile/src/margin/` composes three slots and flips only the container (`useWide`):
```tsx
function Terminal({ chart, ticket, positions }: { chart: ReactNode; ticket: ReactNode; positions: ReactNode }) {
  const wide = useWide();
  return wide ? (
    <View className="flex-1 flex-row gap-3 p-4">
      <View className="flex-1 gap-3"><View className="min-h-[360px] flex-[2]">{chart}</View><View className="flex-1">{positions}</View></View>
      <View className="w-[360px]">{ticket}</View>
    </View>
  ) : (
    <ScrollView>{chart}{positions}</ScrollView> /* ticket opens as a bottom sheet from a pinned Long/Short bar */
  );
}
```
The ticket is the same `TradePanel` in both: inline column on desktop, inside `Sheet` (`packages/ui-native/src/components/sheet.tsx`) on phone. Keep it mounted once per breakpoint (don't render both; hooks would double-poll). The blocker (not signed in / mainnet only) replaces the CTA label inside the panel.

## 4. Charts: pick react-native-svg
Decision: keep **react-native-svg** (`candle-chart.tsx` + `area-chart.tsx` already exist, run on iOS, Android and web through react-native-svg's web build, no WASM, SSR-safe). Reject Skia-on-web: needs `canvaskit.wasm` served from `public/` via `npx setup-skia-web` after every upgrade, a `LoadSkiaWeb()` / `WithSkiaWeb` async load before first render, and does not render on the server ([Skia web guide](https://shopify.github.io/react-native-skia/docs/getting-started/web), Context7 `/shopify/react-native-skia`). Reject 21st ssychui candle-chart and lightweight-charts as the shared path: web-only, a second implementation to keep in sync. Skia stays for the orb only.

Wiring (`api.tokens.chart(chainId, address, range)` returns `Candle[] = {t,o,h,l,c,v}`; Arc mainnet chainId 5042):
```tsx
const { candles } = await api.tokens.chart(5042, market.asset, "1D");
<CandleChart candles={candles} colors={{ up, down, muted, grid, scrub }} formatValue={usd} accessibilityLabel={t("margin.chartLabel")} height={wide ? 420 : 240} onScrub={setBar} />
```
Gaps to fix on web: the chart scrubs with `Gesture.Pan()` only, so a mouse needs a click-drag. Add hover crosshair: `Gesture.Hover()` composed with the Pan (`Gesture.Simultaneous(hover, pan)`), or the RNW fallback `onPointerMove`/`onMouseMove` on the wrapper `View` (UNVERIFIED which works on RNGH 2.32 web; RNGH docs only show the newer `useHoverGesture` hook with `onUpdate` giving `x`, `y`). Performance knobs: cap at <= 150 candles (`candles.slice(-150)`), one `Rect`/`Line` pair per bar is fine below that; above it, merge all wicks into a single `Path` `d` string and bodies into two (up/down). Memoize the scale (already done) and don't re-render the chart on every position poll (`POSITIONS_REFRESH_MS = 15_000`); pass stable `candles`. Add a live last-price line from the markets poll instead of refetching candles.

## 5. Tauri desktop (`apps/desktop`)
Current: a window on `https://app.getkawase.xyz` (`frontendDist`/`devUrl` both the URL), empty `capabilities` and no `__TAURI__` (remote pages get no IPC; Tauri only grants it via a capability with `"remote": {"urls": [...]}`, and not safely on Linux/Android iframes: [capabilities](https://v2.tauri.app/security/capabilities/), Context7 `/tauri-apps/tauri-docs`). Keep that: all shortcuts are page-level JS, so no IPC is needed.
- **Remember the window:** add `.plugin(tauri_plugin_window_state::Builder::default().build())` in `run()` (desktop only), and `"window-state:default"` in a capability. The plugin needs a capability file only for JS calls; the Rust-side plugin works without (UNVERIFIED; the docs show the permission for the JS API). Windows are created in code (`"windows": []`), which the plugin handles by label `main`.
- **Menu accelerators steal keys.** Tauri menu accelerators fire before the page. `Menu::default` already owns ⌘C/V/X/Z/A/W/Q/M. Don't add accelerators that the page handles (⌘K, ⌘B); if a menu item must trigger app UI, use `window.eval("window.dispatchEvent(new CustomEvent('kawase:cmd',{detail:'palette'}))")` from `on_menu_event` and listen in the page.
- **Layout:** default 1280x820 stays above the 1024 `lg` cutoff; min 380x600 is the phone layout. Dragging under 1024 flips the whole UI, which is intended.
- **Gotchas:** `CSP null` is fine for a remote page but means no CSP help; `zoom_hotkeys_enabled(true)` makes ⌘+/⌘- change `devicePixelRatio`, so chart canvases/SVG just rescale. Headless macOS builds need `CI=true`. Auto-update needs `tauri-plugin-updater` 2.13.3 plus signing keys (not needed: the app is the live URL).

## 6. Kawase Margin: TradePanel contract
API (`apps/api/src/margin/routes.ts`, types in `packages/api-client/src/rails.ts`; client `api.margin.*`):
- **Read, public (guests too):** `GET /margin/markets?network=` -> `MarginMarketsView {network, venue:"Aave V4", available, reason, minOpenHealth:1.1, leverageStep:0.5, presets:[10,50,100], markets: MarginMarketView[]}`. Per market: `market` (symbol), `asset` (address), `decimals`, `price` (USD, 8 decimals string), `long|short: {available, reason, maxLeverage}` (capped by `MARGIN.maxLeverage` 5 and the route's `LEVERAGE_MAX` 10), `borrowAprUsdc` (long pays), `borrowAprAsset` (short pays), `liquidity` (base units, a short's ceiling). `available:false` with `reason: "mainnet_only"` on testnet.
- **Positions (auth):** `GET /margin/positions` -> `{positions: MarginPositionView[]}`: `side`, `leverage`, `notionalUsd`, `equityUsd`, `pnlUsd`, `pnlPercent`, `pnlSplit {price, borrow}`, `health`, `liquidationPrice`, `liquidationDistance` (fraction), `borrowApr`, `entryPrice`/`markPrice` (8-dec USD strings), `takeProfit`/`stopLoss`/`protection ("armed"|"closing"|"unavailable")`. Refresh every 15 s.
- **Order (intent) lifecycle:** `POST /margin/orders` `MarginRequest {action:"open"|"close", market, side, margin (decimal USDC string), leverage, positionId, fraction (0.25|0.5|0.75|1)}` -> `{intent: MarginIntent}` with `draft: MarginDraftView` (`notionalUsd`, `size`, `debtDelta`, `collateralDelta`, `returnedMin`, `healthAfter`, `liquidationPrice`, `liquidationDistance`, `markPrice`, `borrowApr`, `loops`, `venues`, `fees.network`, `quotedAt`), `results` (policy), `blocking`. `PATCH /orders/:id` revises (new `version`); `POST /orders/:id/approve {version, override?}` -> `{status:"executing"|"changed"|"final"}` or `{status:"sign", approvalId, transaction}` then `POST /orders/:id/signature {approvalId, signedTransaction}`. `changed` means a new version: show it again first, never auto-confirm. Hook: `useMarginOrder()` (wraps `useWalletIntent`), `useMarginMarkets()`, `useMarginPositions()` in `apps/mobile/src/margin/use-margin.ts`.
- **TradePanel inputs:** market, side, margin (presets 10/50/100 + AmountPad), leverage slider step 0.5 from 1 to `maxLeverage` of the chosen side (disable a side whose `available` is false and say `reason` in the CTA slot). **Outputs shown live from the draft, not computed locally:** notional, size, entry (`markPrice`), liquidation price and distance, health after (warn below 1.5, push thresholds 1.5/1.2), borrow APR, network fee, venues, price-impact note when slippage was widened (up to 400 bps, `maxSlippageBps`).
- **Money-path defaults:** open leverage 2x if unset; open floor health 1.1; slippage 50 bps shown, 25 bps in calldata; the `brake` requires `override: true` for a risky draft (explicit user action on the card); approve carries `version` so a stale card cannot execute; quotes expire (`expiresAt`); Take-profit/stop-loss need per-position grants signed once and revocable (`/margin/protection/*`), mainnet only (Uniswap v3 route).
- **Close:** a `closeShares` row (25/50/75/All) calls `POST /orders {action:"close", positionId, fraction}`; a full close of a protected position also switches protection off in the same signature (`draft.protectionOff`).

## Sources
- Uniwind: https://docs.uniwind.dev/class-names, https://github.com/uni-stack/uniwind (Context7 `/uni-stack/uniwind`, `/websites/uniwind_dev`)
- Expo Router: https://docs.expo.dev/router/reference/url-parameters/, https://docs.expo.dev/router/web/server-rendering/ (Context7 `/expo/expo`)
- react-native-web: https://necolas.github.io/react-native-web/docs/pressable/ (Context7 `/necolas/react-native-web`)
- RNGH hover: https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/use-hover-gesture (Context7 `/software-mansion/react-native-gesture-handler`)
- Skia web: https://shopify.github.io/react-native-skia/docs/getting-started/web (Context7 `/shopify/react-native-skia`)
- Tauri: https://v2.tauri.app/security/capabilities/, https://v2.tauri.app/plugin/window-state/, https://v2.tauri.app/learn/window-menu/ (Context7 `/tauri-apps/tauri-docs`)
- Repo: `packages/ui-native/src/lib/wide.ts`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/dock/desktop-sidebar.tsx`, `packages/ui-native/src/components/candle-chart.tsx`, `apps/desktop/src-tauri/src/lib.rs`, `apps/api/src/margin/{routes,service}.ts`, `packages/api-client/src/rails.ts`, `packages/config/src/rails.ts`; Senryo `metropolis/apps/web/src/components/shell/*`, `lib/shell/drawer-param.ts`.
