// What Privy's Expo SDK expects on the global before it loads (docs: basics/react-native/installation): TextEncoder and
// ethers' shims. `crypto.getRandomValues` is installed by the entry (src/polyfills.native.ts). Every native Privy module
// imports this file first, so the order holds whichever of them Metro evaluates first.
import "fast-text-encoding";
import "@ethersproject/shims";
