// The app's entry: globals first, then Expo Router. Turnkey's key generation (@noble/hashes) reads
// `globalThis.crypto` once, when its module first runs, and keeps what it saw. In Release builds a module that pulls
// in Turnkey ran before the old polyfill import in the wallet provider, so every email-code sign-in failed with
// "crypto.getRandomValues must be defined". Installing the globals here, before any other module, rules that out.
import "./src/polyfills";
import "expo-router/entry";
