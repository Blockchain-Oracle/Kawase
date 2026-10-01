/**
 * Versioned consent texts. The api refuses a network switch to mainnet until the user has accepted the current
 * version of the real-money consent; the app asks with the consent sheet. Bump the version when the wording
 * changes in a way that needs a fresh acceptance (the text itself lives in the catalogs, `wallet.mainnetConsent*`).
 */
export const MAINNET_CONSENT_VERSION = "1";

/** The terms the person accepts on the completion screen ("By continuing you agree…"). */
export const TERMS_VERSION = "1";
