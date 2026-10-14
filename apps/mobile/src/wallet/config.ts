// Public wallet configuration, read once. Every id here is safe to ship in the app.

/**
 * Which wallet provider signs people in and holds their key (D41): Privy, with Turnkey kept as the fallback for one
 * build. Set at build time with EXPO_PUBLIC_WALLET_PROVIDER (the api's WALLET_PROVIDER turns its side on).
 */
export const WALLET_PROVIDER: "privy" | "turnkey" | "dev" =
  process.env.EXPO_PUBLIC_WALLET_PROVIDER === "privy" ? "privy" : process.env.EXPO_PUBLIC_WALLET_PROVIDER === "dev" ? "dev" : "turnkey";
export const isPrivy = WALLET_PROVIDER === "privy";
/**
 * Dev mode (local development only, EXPO_PUBLIC_WALLET_PROVIDER=dev against an api started with KAWASE_DEV_AUTH=1):
 * sign-in takes any `@kawase.test` email and any code, the wallet is a throwaway testnet key kept in this browser, and
 * approvals pass by themselves — so every flow (budget, automations, contacts, sends, swaps) can be tried end to end.
 */
export const isDev = WALLET_PROVIDER === "dev";

/** Privy: the app id and, for the native app, the app client id (dashboard → App clients). */
export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";
/** The web's own app client, when the dashboard has one (its allowed origins); unset = the app's default settings. */
export const PRIVY_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_WEB_CLIENT_ID ?? "";

export const TURNKEY_ORGANIZATION_ID = process.env.EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID ?? "";
export const TURNKEY_AUTH_PROXY_CONFIG_ID = process.env.EXPO_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? "";
/** A passkey is tied to this domain for life, so it stays empty until a real domain is chosen. */
export const PASSKEY_RP_ID = process.env.EXPO_PUBLIC_PASSKEY_RP_ID ?? "";
export const APP_SCHEME = "kawase";
/** Sign in with Google: the web client id the Turnkey OAuth proxy uses on every platform. */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
/** Sign in with Apple: the app's bundle id (native iOS) and the Services ID (the web flow on Android). */
export const APPLE_IOS_BUNDLE_ID = process.env.EXPO_PUBLIC_APPLE_IOS_BUNDLE_ID ?? "";
export const APPLE_SERVICES_ID = process.env.EXPO_PUBLIC_APPLE_SERVICES_ID ?? "";
/** The web app: where a phone opens Privy's key export (Privy shows the key only in its own web window). */
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.getkawase.xyz";

export const isTurnkeyConfigured = TURNKEY_ORGANIZATION_ID !== "" && TURNKEY_AUTH_PROXY_CONFIG_ID !== "";
export const isPrivyConfigured = PRIVY_APP_ID !== "";
/** The chosen provider has its ids; without them the app still runs (guest look-around). */
export const isWalletConfigured = isDev || (isPrivy ? isPrivyConfigured : isTurnkeyConfigured);
