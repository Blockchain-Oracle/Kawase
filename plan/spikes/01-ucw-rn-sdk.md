# Spike 1: Circle user-controlled wallet SDK in the app (closed without the PIN steps)

Purpose: record what spike 1 found before it was closed.
Code: `plan/spikes/code/01-ucw-rn-sdk/` (`server.mjs`; the device screen is `circle-screen.native.tsx` in the same folder).
Date: 2026-09-30
**Result: closed, superseded by D33.** Abu rejected a PIN for every action, so the Circle PIN wallet was replaced (Turnkey-held EOA + EIP-7702 limits). The SDK was removed from `apps/mobile`.

## What was learned
- `@circle-fin/w3s-pw-react-native-sdk` 2.2.5 **builds and initialises** on Expo 57 / RN 0.86.3 (iOS simulator): `WalletSdk.init` returned `{native: "1.4.3 (15)", rn: "2.2.5"}`. Circle's README lists RN 0.76–0.81 as the recommended range.
- Its Podfile plugin forces **static frameworks** for every pod. The iOS build then compiles all native libraries from source: about 30 minutes instead of about 8.
- Its Podfile plugin also adds the full CocoaPods git spec repo as a source (a 1.3 GB clone on a fresh machine). Using `https://cdn.cocoapods.org/` instead works.
- The SDK has **no web build**: importing it on Expo web throws `Cannot find native module 'ProgrammablewalletRnSdk'`. It must only be imported from `.native.tsx` files.
- `expo-doctor` cannot be satisfied with it installed: it wants `expo-modules-core` as a direct dependency (the SDK's peer) and also forbids installing it directly.
- Android needs a GitHub token for Circle's Maven registry; not run.

## Not done
The PIN set-up, the typed-data signature and the transfer through the native PIN sheet were never run. They are only needed if the project returns to Circle's PIN method.
