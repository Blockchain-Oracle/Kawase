// Web: Privy's React SDK behind the shared sign-in core (email code, Google, Apple as enabled on the Privy app).
// Privy's own modals are never used: the app drives the headless hooks, and `showWalletUIs: false` keeps signatures
// silent (privy-provider.tsx).
import * as React from "react";
import {
  getIdentityToken,
  useCreateWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
  usePrivy,
  useWallets,
  type User,
} from "@privy-io/react-auth";

import { useSession } from "@/session/session-provider";
import { usePrivyAccountCore, type PrivyKit } from "./privy-account-core";
import { usePrivyLoginMethods } from "./privy-login-methods";
import type { SocialProvider, TurnkeyAccount } from "./turnkey-account-core";

/** Set just before the page leaves for Google or Apple; read when it comes back signed in. */
const OAUTH_RETURN_KEY = "kawase.privy.oauth";

const browserStorage = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

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
  const { initOAuth } = useLoginWithOAuth();
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
    oauth: async (provider) => {
      browserStorage()?.setItem(OAUTH_RETURN_KEY, provider);
      await initOAuth({ provider });
    },
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

/**
 * Google and Apple on the web leave the page and come back to it signed in at Privy. Mounted once at the root: when
 * the page returns from one, it finishes what the sign-in sheet started (the Kawase account, then the wallet).
 */
export function usePrivyOAuthReturn() {
  const account = usePrivyAccount();
  const { user } = useSession();
  const started = React.useRef(false);
  const returning = browserStorage()?.getItem(OAUTH_RETURN_KEY) as SocialProvider | null | undefined;
  React.useEffect(() => {
    if (!returning || started.current || !account.signedIn || !user) return;
    started.current = true;
    browserStorage()?.removeItem(OAUTH_RETURN_KEY);
    if (!user.isGuest) return;
    void account
      .linkSession()
      .then(() => account.ensureWallet())
      .catch(() => undefined);
  }, [returning, account, user]);
}
