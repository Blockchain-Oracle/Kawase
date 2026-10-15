# Kawase desktop

Kawase for macOS, Windows and Linux. It is a [Tauri 2](https://v2.tauri.app) window around the live web app at
**https://app.getkawase.xyz**. Nothing is bundled, so the desktop app always runs the current web release; a new web
deploy updates every desktop install at once.

What the shell adds to the web app:

- **Window chrome.** On macOS the title bar is transparent with a hidden title, so it shows the app's own background
  (ink `#0B0C10` in dark mode, paper `#F7F8F4` in light). It follows the system appearance. The window opens at
  1280 × 820, wide enough for the desktop rail layout, and can shrink to 380 × 600, the phone layout.
- **Standard menus**, so copy, paste, undo and select all work in the page. ⌘+ and ⌘− zoom.
- **`kawase://` deep links** use the same scheme as the phone app. `kawase://r/abc` opens
  `https://app.getkawase.xyz/r/abc` in the window. On Windows and Linux a second launch hands its link to the running
  window (single-instance).
- **The window stays on the app.** Sign-in pages (Google, Apple, Privy) may load inside it. Pop-ups the app opens
  itself (the sign-in window, Buy) become child windows that share the session, so the sign-in completes as it does
  in a browser. Any other site (an explorer, the docs) opens in your browser.
- **No access to the computer.** The remote page gets no Tauri commands: `capabilities` is empty and there is no
  global `__TAURI__`.
- **The microphone, for voice.** `src-tauri/Info.plist` adds `NSMicrophoneUsageDescription` (macOS asks before the page
  can listen), and `Entitlements.plist` declares `audio-input` for a signed build with the hardened runtime. Voice inside
  the desktop window hasn't been checked yet.
- **The icon** is the real Kawase icon (`apps/mobile/assets/brand/icon.png`) on the macOS rounded-square grid:
  824 pt on a 1024 canvas with a 185 pt corner, in `assets/app-icon.png`.

## Build

You need Rust (stable, via [rustup](https://rustup.rs)) and, on macOS, the Xcode command-line tools. The Tauri CLI is
a dev dependency of this package.

```bash
pnpm install                              # from the repo root
pnpm --filter @kawase/desktop desktop:dev     # a window on the live app (debug build)
pnpm --filter @kawase/desktop desktop:build   # release: .app + .dmg on macOS, .msi/.exe on Windows, .deb/.AppImage/.rpm on Linux
```

On macOS, set `CI=true` for `desktop:build` when building headless. The DMG script then skips its Finder window
styling.

The outputs land in `src-tauri/target/release/bundle/`:

- `macos/Kawase.app` (about 3 MB);
- `dmg/Kawase_1.0.0_aarch64.dmg` (about 2 MB).

Other commands:

- `pnpm --filter @kawase/desktop desktop:icons` rebuilds `src-tauri/icons/` from `assets/app-icon.png`.
- `cargo test` in `src-tauri/` checks the deep-link mapping and the navigation rules.

### Download

The landing serves the latest local build at `https://getkawase.xyz/download/Kawase-mac.dmg`
(`apps/landing/public/download/Kawase-mac.dmg`; `PUBLIC_LINKS.desktopMac`). After a rebuild, copy
`src-tauri/target/release/bundle/dmg/Kawase_1.0.0_aarch64.dmg` over it. Every link to it says it isn't notarized yet.

### Signing

A local build is ad-hoc signed. It runs on the machine that built it; on other Macs Gatekeeper asks the user to allow
it (System Settings → Privacy & Security → Open Anyway).

To ship it signed and notarized, set these before `desktop:build`:

- `APPLE_SIGNING_IDENTITY` (a "Developer ID Application" certificate);
- `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.

Tauri signs and notarizes the build itself.

## Changing the URL

The app URL is `APP_URL` in `src-tauri/src/lib.rs`, plus `build.frontendDist` / `build.devUrl` in
`src-tauri/tauri.conf.json`. To point a dev build at a local web server, change both, for example to
`http://localhost:8081`.
