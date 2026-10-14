// Privy behind the sign-in shape the screens already use (D41), shared by the native (@privy-io/expo) and the web
// (@privy-io/react-auth) SDK: after the email code, Google or Apple, the app hands Privy's access and identity tokens to
// the api (one sign-in; the api verifies them and reads the email and the wallet from the signed identity token),
// creates the embedded wallet when the account has none, and registers it. Each platform passes a small kit over its
// own SDK's hooks (privy-account.ts, privy-account.native.ts); everything else lives here.
import * as React from "react";
import { randomUUID } from "expo-crypto";

import { ApiError, type ApiUser } from "@kawase/api-client";

import { deviceInfo, useSession } from "@/session/session-provider";
import { sessionStorage } from "@/session/storage";
import { authStage } from "./auth-stage";
import { privyApi, type PrivyTokens } from "./privy-api";
import type { SocialProvider, TurnkeyAccount } from "./turnkey-account-core";

/** Privy publishes a new login, wallet and tokens through React state; a step waits this long for them. */
const STATE_WAIT_MS = 15_000;
const STATE_POLL_MS = 50;
const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
/** The api's answer when the identity token names no wallet yet (privy auth service, linkPrivyWallet). */
const WALLET_NOT_IN_TOKEN = "wallet_not_registered";
const REGISTER_ATTEMPTS = 4;
const REGISTER_BACKOFF_MS = 600;

/** The few things each SDK gives this module. */
export type PrivyKit = {
  /** Privy has loaded (it includes the embedded wallet's own start-up); nothing is signed before it. */
  ready: boolean;
  authenticated: boolean;
  /** The verified email on the Privy user: the email-code login, or the Google/Apple account's. */
  email: string | undefined;
  /** The embedded Ethereum wallet's address, once it exists. */
  walletAddress: string | undefined;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (email: string, code: string) => Promise<void>;
  /** Native: the provider's sheet, then resolves. Web: the page leaves for the provider and comes back signed in. */
  oauth: (provider: SocialProvider) => Promise<void>;
  createWallet: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getIdentityToken: () => Promise<string | null>;
  /** Re-reads the Privy user and mints a fresh identity token (one cached from before the wallet existed lacks it). */
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

export function usePrivyAccountCore(kit: PrivyKit, options: { providers: readonly SocialProvider[] }): TurnkeyAccount {
  const { adoptToken } = useSession();
  const { providers } = options;

  // A step's continuation runs after Privy has re-rendered with the new login or wallet, so it reads the latest values
  // through this ref instead of the ones captured when it started.
  const latest = React.useRef(kit);
  latest.current = kit;

  const pendingToken = React.useRef<string | undefined>(undefined);
  const active = React.useRef<Promise<ApiUser> | undefined>(undefined);
  const activeWallet = React.useRef<Promise<{ address: string; walletId: string }> | undefined>(undefined);
  const attemptId = React.useRef(randomUUID());

  const waitFor = React.useCallback(async (done: (current: PrivyKit) => boolean, what: string) => {
    const deadline = Date.now() + STATE_WAIT_MS;
    while (!done(latest.current)) {
      if (Date.now() > deadline) throw new Error(`Privy: no ${what}`);
      await new Promise((resolve) => setTimeout(resolve, STATE_POLL_MS));
    }
    return latest.current;
  }, []);

  /** Fresh tokens for the signed-in Privy user (the access token refreshes itself; about an hour of life). */
  const tokens = React.useCallback(async (): Promise<PrivyTokens> => {
    const current = await waitFor((state) => state.ready && state.authenticated, "session");
    const [accessToken, identityToken] = await Promise.all([
      current.getAccessToken(),
      current.getIdentityToken().catch(() => null),
    ]);
    if (!accessToken) throw new Error("Privy: no access token");
    return { accessToken, ...(identityToken ? { identityToken } : {}) };
  }, [waitFor]);

  /**
   * Registers the embedded wallet. "No wallet in the token" right after creating one means the identity token is still
   * the old one: the user is re-read (a fresh token) and the registration tried again, a few times with a short wait.
   */
  const registerFresh = React.useCallback(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await privyApi.registerWallet(await tokens(), attemptId.current);
      } catch (error) {
        // A 409 is another registration of the same wallet finishing at this moment: the next try reads its row.
        const again =
          error instanceof ApiError && (error.code === WALLET_NOT_IN_TOKEN || error.status === HTTP_CONFLICT);
        if (!again || attempt >= REGISTER_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, REGISTER_BACKOFF_MS * attempt));
        await latest.current.refreshUser().catch(() => undefined);
      }
    }
  }, [tokens]);

  const proveSession = React.useCallback(async (): Promise<ApiUser> => {
    if (pendingToken.current) {
      const user = await authStage("account", attemptId.current, async () => {
        try {
          return await adoptToken(pendingToken.current!, attemptId.current);
        } catch (error) {
          // A rejected Kawase token needs a fresh exchange; outages keep the successful one.
          if (error instanceof ApiError && error.status === HTTP_UNAUTHORIZED) pendingToken.current = undefined;
          throw error;
        }
      });
      pendingToken.current = undefined;
      return user;
    }
    const proof = await authStage("session", attemptId.current, tokens);
    const { token } = await authStage("link", attemptId.current, async () =>
      privyApi.signIn({ ...proof, device: await deviceInfo() }, await sessionStorage.getToken(), attemptId.current),
    );
    pendingToken.current = token;
    const user = await authStage("account", attemptId.current, () => adoptToken(token, attemptId.current));
    pendingToken.current = undefined;
    return user;
  }, [tokens, adoptToken]);

  const once = React.useCallback((action: () => Promise<ApiUser>) => {
    if (active.current) return active.current;
    const pending = action().finally(() => {
      if (active.current === pending) active.current = undefined;
    });
    active.current = pending;
    return pending;
  }, []);

  const fresh = () => {
    attemptId.current = randomUUID();
    pendingToken.current = undefined;
  };

  return React.useMemo<TurnkeyAccount>(
    () => ({
      available: true,
      providers,
      signedIn: kit.ready && kit.authenticated,
      email: kit.email,
      async sendCode(email) {
        await waitFor((state) => state.ready, "start-up");
        // A Privy login left over from a sign-in that never reached Kawase (the app closed in between) would make
        // Privy refuse a new code; it is ended first, so the person simply starts again.
        if (latest.current.authenticated) await latest.current.logout();
        await latest.current.sendCode(email.trim());
        // Privy keeps the pending code on its side; the sheet's step only needs the email.
        return { otpId: "", otpEncryptionTargetBundle: "" };
      },
      verifyCode({ email, code }) {
        return once(async () => {
          fresh();
          await authStage("code", attemptId.current, () => latest.current.loginWithCode(email.trim(), code.trim()));
          return proveSession();
        });
      },
      signInWith(provider) {
        return once(async () => {
          fresh();
          await authStage("provider", attemptId.current, async () => {
            await waitFor((state) => state.ready, "start-up");
            if (latest.current.authenticated) await latest.current.logout();
            await latest.current.oauth(provider);
          });
          return proveSession();
        });
      },
      linkSession: () => once(proveSession),
      async ensureWallet() {
        if (activeWallet.current) return activeWallet.current;
        const pending = authStage("wallet", attemptId.current, async () => {
          const current = await waitFor((state) => state.ready && state.authenticated, "session");
          // Do not rely on create-on-login: an account that signed in before it had a wallet gets one here.
          const created = !current.walletAddress;
          if (created) await current.createWallet();
          const { walletAddress } = await waitFor((state) => Boolean(state.walletAddress), "wallet");
          // The identity token the SDK cached at login predates a wallet created just now; a fresh one names it.
          if (created) await latest.current.refreshUser().catch(() => undefined);
          // The api reads the address from the signed identity token, never from this body.
          const { wallet } = await registerFresh();
          if (wallet.address.toLowerCase() !== walletAddress!.toLowerCase())
            throw new Error("Privy: the registered wallet differs");
          return { address: wallet.address, walletId: wallet.id };
        }).finally(() => {
          if (activeWallet.current === pending) activeWallet.current = undefined;
        });
        activeWallet.current = pending;
        return pending;
      },
      async signOutTurnkey() {
        pendingToken.current = undefined;
        if (latest.current.authenticated) await latest.current.logout();
      },
    }),
    [providers, kit.ready, kit.authenticated, kit.email, waitFor, once, proveSession, registerFresh],
  );
}
