// Web: Privy's React SDK behind the shared sign-in core (email code, Google, Apple as enabled on the Privy app).
// Privy's own modals are never used: the app drives the headless hooks, and `showWalletUIs: false` keeps signatures
// silent (privy-provider.tsx).
import {
  getIdentityToken,
  useCreateWallet,
  useLoginWithEmail,
  usePrivy,
  useWallets,
  type User,
} from "@privy-io/react-auth";

import { usePrivyAccountCore, type PrivyKit } from "./privy-account-core";
import { usePrivyLoginMethods } from "./privy-login-methods";
import { usePrivyOAuth } from "./privy-oauth";
import type { TurnkeyAccount } from "./turnkey-account-core";

/** The verified email on a Privy user: the email-code login first, then Google's or Apple's. */
export const privyEmail = (user: User | null | undefined) => user?.email?.address ?? user?.google?.email ?? user?.apple?.email ?? undefined;

/** The embedded (Privy) Ethereum wallet among the connected ones. */
export function useEmbeddedWallet() {
  const { wallets, ready } = useWallets();
  return { ready, wallet: wallets.find((wallet) => wallet.walletClientType === "privy") };
}

function usePrivyKit(): PrivyKit {
  const privy = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  // Google and Apple leave the page; privy-oauth-return.tsx finishes the sign-in when it comes back.
  const oauth = usePrivyOAuth();
  const { createWallet } = useCreateWallet();
  const { ready: walletsReady, wallet } = useEmbeddedWallet();
  return {
    ready: privy.ready && walletsReady,
    authenticated: privy.authenticated,
    email: privyEmail(privy.user),
    walletAddress: wallet?.address ?? privy.user?.wallet?.address,
    sendCode: (email) => sendCode({ email }),
    loginWithCode: async (_email, code) => {
      await loginWithCode({ code });
    },
    oauth: oauth.start,
    createWallet: async () => {
      await createWallet();
    },
    getAccessToken: privy.getAccessToken,
    getIdentityToken,
    logout: privy.logout,
  };
}

export function usePrivyAccount(): TurnkeyAccount {
  return usePrivyAccountCore(usePrivyKit(), { providers: usePrivyLoginMethods("web") });
}
