// Settings → Account's ways in and the key export (cards/access.md "Link methods / change email", "Export wallet"), as
// the account, devices and export screens use them. Privy is the provider (D41): use-account-methods-privy-core.ts,
// over each platform's SDK (use-account-methods.ts, use-account-methods-privy.native.ts). Signing a device out is the
// api's (it refuses that device's Privy session from then on), so nothing here touches devices.

export type LinkProvider = "google" | "apple";
/** A way into the account: the email code, Google or Apple. */
export type LoginMethod = "email" | LinkProvider;

export type SignInMethods = { email: string | null; google: boolean; apple: boolean };

/** How many ways in the account has; the last one is never removed (the person would be locked out). */
export function methodCount(methods: SignInMethods): number {
  return (methods.email ? 1 : 0) + (methods.google ? 1 : 0) + (methods.apple ? 1 : 0);
}

/** How this platform exports the key: Privy's own window here (web), or that window opened on the web app (phone). */
export type WalletExport = "privyWindow" | "privyOnWeb";

export type AccountMethods = {
  /** The provider session that manages the methods is on this device. */
  manageable: boolean;
  methods: SignInMethods;
  /** Whether this method can be removed now (it is linked, and it is not the last way in). */
  removable: (methods: SignInMethods, method: LoginMethod) => boolean;
  unlink: (method: LoginMethod) => Promise<void>;
  refresh: () => Promise<SignInMethods>;
  /** Opens Google or Apple and adds that login (the provider refuses one that belongs to another account). */
  link: (provider: LinkProvider) => Promise<void>;
  /** A code to the new address: to replace the email, or to add one to an account without. */
  sendEmailCode: (email: string) => Promise<void>;
  /** Checks the code, sets the address, and has Kawase follow it. */
  confirmEmail: (input: { email: string; code: string }) => Promise<{ email: string | null }>;
  walletExport: WalletExport;
  /** Opens Privy's export window (web) or the web app's export page (phone). */
  exportKey: () => Promise<void>;
};

const notConfigured = () => Promise.reject(new Error("Sign in is not configured on this build"));
/** A build without the Privy ids (or dev mode, whose key is local): nothing is linked and every action says so. */
export const UNCONFIGURED_METHODS: AccountMethods = {
  manageable: false,
  methods: { email: null, google: false, apple: false },
  removable: () => false,
  unlink: notConfigured,
  refresh: notConfigured,
  link: notConfigured,
  sendEmailCode: notConfigured,
  confirmEmail: notConfigured,
  walletExport: "privyWindow",
  exportKey: notConfigured,
};
