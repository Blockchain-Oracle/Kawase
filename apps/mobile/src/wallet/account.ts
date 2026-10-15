// The person's sign-in and wallet as the sign-in sheet, Settings and sign-out use it (D41): Privy on every platform
// (privy-account.ts, privy-account.native.ts), the throwaway dev key in local development (dev-account.ts), or nothing
// on a build without the Privy ids (the app still runs as a guest). use-wallet-account.ts picks one per build.
import type { ApiUser } from "@kawase/api-client";

export type SocialProvider = "apple" | "google";

export type WalletAccount = {
  available: boolean;
  /** Which social providers can be used on this platform. */
  providers: readonly SocialProvider[];
  signedIn: boolean;
  email: string | undefined;
  /** Emails the sign-in code (the provider keeps the pending code; the sheet's next step only needs the email). */
  sendCode: (email: string) => Promise<void>;
  /** Completes the code, then signs in to Kawase: a new account, the existing one, or the guest upgraded in place. */
  verifyCode: (input: { email: string; code: string }) => Promise<ApiUser>;
  /** Runs the provider's own sign-in (Google, Apple), then signs in to Kawase like `verifyCode`. */
  signInWith: (provider: SocialProvider) => Promise<ApiUser>;
  /** With a provider session already on the device: sign in to Kawase without a new code. */
  linkSession: () => Promise<ApiUser>;
  /** The account's wallet, created and registered when missing. */
  ensureWallet: () => Promise<{ address: string; walletId: string }>;
  /** Ends the provider's session on this device (Kawase's own session is the session provider's to end). */
  signOutWallet: () => Promise<void>;
};

const unavailable = () => Promise.reject(new Error("Sign in is not configured on this build"));
/** What sign-in offers on a build without the provider's ids: the app still runs as a guest. */
export const UNCONFIGURED_ACCOUNT: WalletAccount = {
  available: false,
  providers: [],
  signedIn: false,
  email: undefined,
  sendCode: unavailable,
  verifyCode: unavailable,
  signInWith: unavailable,
  linkSession: unavailable,
  ensureWallet: unavailable,
  signOutWallet: () => Promise.resolve(),
};
