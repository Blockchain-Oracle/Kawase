// Public wallet configuration, read once. Every id here is safe to ship in the app.

/**
 * Dev mode (local development only, EXPO_PUBLIC_WALLET_PROVIDER=dev against an api started with KAWASE_DEV_AUTH=1):
 * sign-in takes any `@kawase.test` email and any code, the wallet is a throwaway testnet key kept in this browser, and
 * approvals pass by themselves — so every flow (budget, automations, contacts, sends, swaps) can be tried end to end.
 * Every other build signs in with Privy (D41).
 */
export const isDev = process.env.EXPO_PUBLIC_WALLET_PROVIDER === "dev";

/** Privy: the app id and, for the native app, the app client id (dashboard → App clients). */
export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";
/** The web's own app client, when the dashboard has one (its allowed origins); unset = the app's default settings. */
export const PRIVY_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_WEB_CLIENT_ID ?? "";
/** The web app: where a phone opens Privy's key export (Privy shows the key only in its own web window). */
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.getkawase.xyz";

/** Sign-in works: dev mode, or a build with the Privy app id; without it the app still runs (guest look-around). */
export const isWalletConfigured = isDev || PRIVY_APP_ID !== "";
