// The app's entry: globals first, then Expo Router. Key and nonce code (@noble/hashes, under viem and Privy) reads
// `globalThis.crypto` once, when its module first runs, and keeps what it saw; in a Release build a module loaded
// before a later polyfill made every sign-in fail with "crypto.getRandomValues must be defined". Installing the globals
// here, before any other module, rules that out.
import "./src/polyfills";
import "expo-router/entry";
