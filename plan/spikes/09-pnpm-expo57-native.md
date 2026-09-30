# Spike 9: pnpm isolated installs + Expo SDK 57 native builds

Purpose: prove the Expo app builds and runs natively from inside the pnpm/Turborepo monorepo.
Date: 2026-09-29
**Result: PASS on iOS. Android: pending (no Android SDK/emulator on this Mac; use an EAS cloud build).**

## Evidence
- `apps/mobile` generated with the official `create-expo-app@latest --template default` (SDK 57).
- `npx expo-doctor`: **21/21** after one fix (below).
- `npx expo run:ios --device "iPhone 17 Pro"`: CocoaPods installed, **0 errors, 4 warnings**, app `xyz.kawase.app` installed.
- Metro bundled `expo-router/entry.js` (1684 modules) from the pnpm store; the app rendered (screenshot `09-ios-simulator.png`).

## Findings (these change the plan)
1. **Expo SDK 57 pins React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, worklets 0.10.1**, not RN 0.87.1 / Reanimated 4.7 from the research. Always install native packages with `npx expo install` (Expo's own rule; `plan/EXPO-RULES.md`).
2. **Duplicate native module:** the isolated linker installed `expo-constants` 57.0.19 (via expo-asset) and 57.0.20. Expo allows one version per native module. Fixed with a pnpm `overrides` entry in `pnpm-workspace.yaml`. **Run `expo-doctor` after every dependency change.**
3. The template's **TypeScript is ~6.0.3**, so the whole repo uses TS 6.0.3 (spike 14).
4. Isolated linking (no `nodeLinker: hoisted`) works; no fallback needed.
5. The first launch after `run:ios --no-bundler` shows "No script URL provided". That's expected: start Metro, then relaunch.
6. The template has no `expo-dev-client`. Add it (`npx expo install expo-dev-client`) with the first native SDK (LiveKit/Circle) so the app gets the dev launcher.
7. `ios/` and `android/` are generated (Continuous Native Generation) and git-ignored.

## Decision
Keep pnpm isolated + Expo 57. Android build to be verified through EAS (Stage 1/3).
