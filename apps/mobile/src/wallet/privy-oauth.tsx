// Web: the one place Privy's headless Google/Apple login lives. `useLoginWithOAuth` finishes a returning login from
// an effect in every instance that is mounted; two instances would both spend the same one-time code, and the loser
// would publish an error over a login that worked. So it is called once, here inside PrivyProvider, and the sign-in
// kit (privy-account.ts) and the return surface (privy-oauth-return.tsx) read it through this context.
import { useLoginWithOAuth, usePrivy, type OAuthFlowState } from "@privy-io/react-auth";
import * as React from "react";

import type { SocialProvider } from "./account";

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

/** Every parameter Privy's redirect brings back (the code, its state, the provider), as this page load got them. */
const OAUTH_PARAMS = ["privy_oauth_code", "privy_oauth_state", "privy_oauth_provider"] as const;
const returnedAtLoad: [string, string][] = (() => {
  try {
    const query = new URLSearchParams(globalThis.location?.search ?? "");
    return OAUTH_PARAMS.flatMap((name) => {
      const value = query.get(name);
      return value ? [[name, value] as [string, string]] : [];
    });
  } catch {
    return [];
  }
})();
let restored = false;

/**
 * Privy reads the provider's answer from the address bar only once it is ready, which is after the router has had its
 * say: a fully signed-out visitor is redirected to /welcome first, and that redirect drops the query. So, exactly once,
 * the parameters this page load came back with are put back on whatever page the person is on now, just before Privy
 * looks (Privy removes them itself after spending the code). Exported for the parameter rule in the deep link too.
 */
function restoreOAuthReturn() {
  if (restored || returnedAtLoad.length !== OAUTH_PARAMS.length) return;
  restored = true;
  try {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.has(OAUTH_CODE_PARAM)) return;
    for (const [name, value] of returnedAtLoad) url.searchParams.set(name, value);
    globalThis.history.replaceState(globalThis.history.state, "", url.toString());
  } catch {
    // No history API (not a browser): nothing to restore.
  }
}

/** A path with Privy's one-time parameters taken out (a link remembered during the redirect must not carry them). */
export function withoutOAuthParams(path: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  for (const name of OAUTH_PARAMS) params.delete(name);
  const rest = params.toString();
  return rest ? `${base}?${rest}` : (base ?? path);
}

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
  const { ready } = usePrivy();
  // A layout effect runs before every passive effect of the same commit, so the parameters are back on the page
  // before useLoginWithOAuth's own effect (declared below, keyed on the same `ready`) reads them.
  React.useLayoutEffect(() => {
    if (ready) restoreOAuthReturn();
  }, [ready]);
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
