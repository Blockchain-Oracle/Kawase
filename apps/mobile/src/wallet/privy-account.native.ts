// iOS and Android: Privy's Expo SDK behind the shared sign-in core (email code, Google, Apple as enabled on the Privy
// app). Apple runs Privy's web flow on every platform: the Privy app's one Apple client is the Services ID the web needs
// (xyz.kawase.app.signin), so iOS uses it too rather than the native sheet (which would need the bundle id instead). Typed data and raw hashes have no built-in UI in the Expo SDK, so signing is
// silent; our own Face ID gate stays where the budget asks for it.
import "./privy-polyfills.native";

import {
  getAccessToken,
  useEmbeddedEthereumWallet,
  useIdentityToken,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
  type User,
} from "@privy-io/expo";

import { usePrivyAccountCore, type PrivyKit } from "./privy-account-core";
import { usePrivyLoginMethods } from "./privy-login-methods";
import type { WalletAccount } from "./account";

/** The verified email on a Privy user: the email-code login first, then Google's or Apple's. */
export function privyEmail(user: User | null | undefined): string | undefined {
  const accounts = user?.linked_accounts ?? [];
  const email = accounts.find((account) => account.type === "email");
  if (email && "address" in email) return email.address;
  for (const account of accounts)
    if ((account.type === "google_oauth" || account.type === "apple_oauth") && account.email) return account.email;
  return undefined;
}

/** Apple through the web flow on iOS too (see the header): the same client id as the web app. */
export const APPLE_WEB_FLOW = { isLegacyAppleIosBehaviorEnabled: true } as const;

function usePrivyKit(): PrivyKit {
  const { isReady, user, logout, refreshUser } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { login } = useLoginWithOAuth();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const { getIdentityToken } = useIdentityToken();
  return {
    ready: isReady,
    authenticated: Boolean(user),
    email: privyEmail(user),
    walletAddress: wallets[0]?.address,
    sendCode: async (email) => {
      await sendCode({ email });
    },
    loginWithCode: async (email, code) => {
      await loginWithCode({ code, email });
    },
    oauth: async (provider) => {
      await login({ provider, ...(provider === "apple" ? APPLE_WEB_FLOW : {}) });
    },
    createWallet: async () => {
      await create();
    },
    getAccessToken,
    getIdentityToken,
    refreshUser: async () => {
      await refreshUser();
    },
    logout,
  };
}

export function usePrivyAccount(): WalletAccount {
  return usePrivyAccountCore(usePrivyKit(), { providers: usePrivyLoginMethods("native") });
}
