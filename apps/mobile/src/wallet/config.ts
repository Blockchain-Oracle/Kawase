// Public wallet configuration, read once. These two ids are safe to ship in the app.
export const TURNKEY_ORGANIZATION_ID = process.env.EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID ?? '';
export const TURNKEY_AUTH_PROXY_CONFIG_ID = process.env.EXPO_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID ?? '';
/** A passkey is tied to this domain for life, so it stays empty until a real domain is chosen. */
export const PASSKEY_RP_ID = process.env.EXPO_PUBLIC_PASSKEY_RP_ID ?? '';
export const APP_SCHEME = 'kawase';

export const isWalletConfigured = TURNKEY_ORGANIZATION_ID !== '' && TURNKEY_AUTH_PROXY_CONFIG_ID !== '';
