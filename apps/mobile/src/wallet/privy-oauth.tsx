// Web: the one place Privy's headless Google/Apple login lives. `useLoginWithOAuth` finishes a returning login from
// an effect in every instance that is mounted; two instances would both spend the same one-time code, and the loser
// would publish an error over a login that worked. So it is called once, here inside PrivyProvider, and the sign-in
// kit (privy-account.ts) and the return surface (privy-oauth-return.tsx) read it through this context.
import { useLoginWithOAuth, type OAuthFlowState } from "@privy-io/react-auth";
import * as React from "react";

import type { SocialProvider } from "./turnkey-account-core";

/** Set just before the page leaves for Google or Apple; read when it comes back. Cleared once the outcome was shown. */
export const OAUTH_RETURN_KEY = "kawase.privy.oauth";
/** The query parameter Privy's redirect carries back (Privy strips it once it has spent the code). */
const OAUTH_CODE_PARAM = "privy_oauth_code";

export const browserStorage = () => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};

/**
 * Read once when the bundle loads, before Privy can strip the parameters: did this page load come back from the
 * provider with an answer? Coming back without one (the person used the browser's back button) is a cancel.
 */
const answeredAtLoad = (() => {
  try {
    return new URLSearchParams(globalThis.location?.search ?? "").has(OAUTH_CODE_PARAM);
  } catch {
    return false;
  }
})();

/** The provider this page load is returning from with an answer, if any. A stale marker is dropped here. */
export function takeOAuthReturn(): SocialProvider | undefined {
  const storage = browserStorage();
  const saved = storage?.getItem(OAUTH_RETURN_KEY);
  if (saved !== "google" && saved !== "apple") {
    if (saved) storage?.removeItem(OAUTH_RETURN_KEY);
    return undefined;
  }
  if (!answeredAtLoad) {
    storage?.removeItem(OAUTH_RETURN_KEY);
    return undefined;
  }
  return saved;
}

type PrivyOAuth = {
  /** Remembers the provider, then sends the page to it. */
  start: (provider: SocialProvider) => Promise<void>;
  state: OAuthFlowState;
};

const PrivyOAuthContext = React.createContext<PrivyOAuth | null>(null);

export function PrivyOAuthBridge({ children }: { children: React.ReactNode }) {
  const { initOAuth, state } = useLoginWithOAuth();
  const value = React.useMemo<PrivyOAuth>(
    () => ({
      start: async (provider) => {
        browserStorage()?.setItem(OAUTH_RETURN_KEY, provider);
        try {
          await initOAuth({ provider });
        } catch (error) {
          // The page never left: the sign-in sheet shows this failure itself.
          browserStorage()?.removeItem(OAUTH_RETURN_KEY);
          throw error;
        }
      },
      state,
    }),
    [initOAuth, state],
  );
  return <PrivyOAuthContext.Provider value={value}>{children}</PrivyOAuthContext.Provider>;
}

export function usePrivyOAuth(): PrivyOAuth {
  const context = React.useContext(PrivyOAuthContext);
  if (!context) throw new Error("usePrivyOAuth must be used inside PrivyWalletProvider");
  return context;
}
