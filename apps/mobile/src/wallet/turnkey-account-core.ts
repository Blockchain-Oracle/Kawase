// The Turnkey side of sign-in and wallet creation, bridged to the api, shared by the native and the web kit (both
// expose the same `useTurnkey()` methods from @turnkey/core): after the email code, Apple or Google, the app proves
// its Turnkey session to the api (one sign-in), creates the wallet if the account has none, and registers its
// address. Each platform passes its own kit's context and the providers it supports.
import * as React from "react";
import { randomUUID } from "expo-crypto";

import { ApiError, type ApiUser } from "@kawase/api-client";

import { api } from "@/session/api";
import { deviceInfo, useSession } from "@/session/session-provider";
import { sessionStorage } from "@/session/storage";
import { authStage } from "./auth-stage";

const ETHEREUM_FORMAT = "ADDRESS_FORMAT_ETHEREUM";
const WALLET_NAME = "Kawase";
/** The kit publishes the new session through React state; a sign-in waits this long for it to land. */
const SESSION_WAIT_MS = 10_000;
const SESSION_POLL_MS = 50;
const HTTP_UNAUTHORIZED = 401;

export type SocialProvider = "apple" | "google";

export type TurnkeyAccount = {
  available: boolean;
  /** Which social providers can be used on this platform. */
  providers: readonly SocialProvider[];
  signedIn: boolean;
  email: string | undefined;
  /** Sends the code; returns what `verifyCode` needs. */
  sendCode: (email: string) => Promise<{ otpId: string; otpEncryptionTargetBundle: string }>;
  /** Completes the code, then proves the session to the api and links or upgrades the Kawase user. */
  verifyCode: (input: {
    email: string;
    code: string;
    otpId: string;
    otpEncryptionTargetBundle: string;
  }) => Promise<ApiUser>;
  /** Runs the provider's own sign-in, then proves the session to the api like `verifyCode`. */
  signInWith: (provider: SocialProvider) => Promise<ApiUser>;
  /** With a Turnkey session already on the device: prove it to the api without a new code. */
  linkSession: () => Promise<ApiUser>;
  /** The account's wallet, created and registered when missing. */
  ensureWallet: () => Promise<{ address: string; walletId: string }>;
  signOutTurnkey: () => Promise<void>;
};

type KitWallet = { walletId: string; accounts: { address: string; addressFormat: string }[] };
type KitSession = { organizationId: string; userId: string };
type KitHttpClient = {
  stampGetActivity: (input: {
    organizationId: string;
    activityId: string;
  }) => Promise<{ body: string; stamp: { stampHeaderValue: string } } | undefined>;
};

/**
 * The few `useTurnkey()` members this needs; both kits provide them. Kit-specific enums (the OTP type, address
 * formats) are typed `never` in parameter position, so either kit's precise signature is assignable here, and the
 * caller hands over its own kit's enum value.
 */
export type TurnkeyKit = {
  session: KitSession | undefined;
  httpClient: KitHttpClient | undefined;
  wallets: KitWallet[];
  user: { userEmail?: string | undefined } | undefined;
  getSession: () => Promise<KitSession | undefined>;
  initOtp: (input: {
    otpType: never;
    contact: string;
  }) => Promise<{ otpId: string; otpEncryptionTargetBundle: string }>;
  completeOtp: (input: {
    otpId: string;
    otpEncryptionTargetBundle: string;
    otpCode: string;
    contact: string;
    otpType: never;
  }) => Promise<unknown>;
  handleAppleOauth: () => Promise<unknown>;
  handleGoogleOauth: () => Promise<unknown>;
  createWallet: (input: { walletName: string; accounts: never[] }) => Promise<unknown>;
  refreshWallets: () => Promise<KitWallet[]>;
  logout: () => Promise<unknown>;
};

export function useTurnkeyAccountCore(
  turnkey: TurnkeyKit,
  options: { providers: readonly SocialProvider[]; emailOtp: unknown },
): TurnkeyAccount {
  const { adoptToken } = useSession();
  const {
    initOtp,
    completeOtp,
    handleAppleOauth,
    handleGoogleOauth,
    session,
    httpClient,
    createWallet,
    refreshWallets,
    wallets,
    logout,
    user,
    getSession,
  } = turnkey;
  const emailOtp = options.emailOtp as never;
  const providers = options.providers;

  // A sign-in's continuation runs after the kit has re-rendered with the new session, so it reads the latest
  // values through this ref instead of the ones captured when it started.
  const latest = React.useRef({ session, httpClient, wallets });
  latest.current = { session, httpClient, wallets };
  const pendingToken = React.useRef<string | undefined>(undefined);
  const active = React.useRef<Promise<ApiUser> | undefined>(undefined);
  const activeWallet = React.useRef<Promise<{ address: string; walletId: string }> | undefined>(undefined);
  const attemptId = React.useRef(randomUUID());

  const waitForSession = React.useCallback(async () => {
    const deadline = Date.now() + SESSION_WAIT_MS;
    // Read the kit's active secure-storage session after authentication. React state may still name the old one.
    const current = await getSession();
    if (!current) throw new Error("no active Turnkey session");
    while (!latest.current.httpClient) {
      if (Date.now() > deadline) throw new Error("no Turnkey session");
      await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS));
    }
    return { session: current, httpClient: latest.current.httpClient };
  }, [getSession]);

  const proveSession = React.useCallback(async (): Promise<ApiUser> => {
    if (pendingToken.current) {
      const user = await authStage("account", attemptId.current, async () => {
        try {
          return await adoptToken(pendingToken.current!, attemptId.current);
        } catch (error) {
          // A rejected Kawase token needs a fresh proof; outages keep the successful exchange.
          if (error instanceof ApiError && error.status === HTTP_UNAUTHORIZED) pendingToken.current = undefined;
          throw error;
        }
      });
      pendingToken.current = undefined;
      return user;
    }
    const { session: current, httpClient: client } = await authStage("session", attemptId.current, waitForSession);
    // The proof is a Turnkey stamp over a "get activity" request whose activity id is the api's nonce.
    const signed = await authStage("proof", attemptId.current, async () => {
      const { nonce } = await api.auth.nonce(attemptId.current);
      const signed = await client.stampGetActivity({ organizationId: current.organizationId, activityId: nonce });
      if (!signed) throw new Error("the session could not sign");
      return signed;
    });
    const { token } = await authStage("link", attemptId.current, async () => {
      const guestToken = await sessionStorage.getToken();
      return api.auth.turnkey(
        {
          proof: { body: signed.body, stamp: signed.stamp.stampHeaderValue },
          turnkeyUserId: current.userId,
          device: await deviceInfo(),
        },
        guestToken,
        attemptId.current,
      );
    });
    pendingToken.current = token;
    const user = await authStage("account", attemptId.current, () => adoptToken(token, attemptId.current));
    pendingToken.current = undefined;
    return user;
  }, [waitForSession, adoptToken]);

  const once = React.useCallback((action: () => Promise<ApiUser>) => {
    if (active.current) return active.current;
    const pending = action().finally(() => {
      if (active.current === pending) active.current = undefined;
    });
    active.current = pending;
    return pending;
  }, []);

  return React.useMemo<TurnkeyAccount>(
    () => ({
      available: true,
      providers,
      signedIn: Boolean(session),
      email: user?.userEmail,
      async sendCode(email) {
        const result = await initOtp({ otpType: emailOtp, contact: email.trim() });
        return { otpId: result.otpId, otpEncryptionTargetBundle: result.otpEncryptionTargetBundle };
      },
      async verifyCode({ email, code, otpId, otpEncryptionTargetBundle }) {
        return once(async () => {
          attemptId.current = randomUUID();
          pendingToken.current = undefined;
          await authStage("code", attemptId.current, () =>
            completeOtp({
              otpId,
              otpEncryptionTargetBundle,
              otpCode: code.trim(),
              contact: email.trim(),
              otpType: emailOtp,
            }),
          );
          return proveSession();
        });
      },
      async signInWith(provider) {
        return once(async () => {
          attemptId.current = randomUUID();
          pendingToken.current = undefined;
          await authStage("provider", attemptId.current, () =>
            provider === "apple" ? handleAppleOauth() : handleGoogleOauth(),
          );
          return proveSession();
        });
      },
      linkSession: () => once(proveSession),
      async ensureWallet() {
        if (activeWallet.current) return activeWallet.current;
        const pending = authStage("wallet", attemptId.current, async () => {
          // Always read this authenticated account. React may still hold the prior account's wallet list.
          let current = await refreshWallets();
          if (current.length === 0) {
            await createWallet({ walletName: WALLET_NAME, accounts: [ETHEREUM_FORMAT as never] });
            current = await refreshWallets();
          }
          const wallet = current[0];
          const account = wallet?.accounts.find((candidate) => candidate.addressFormat === ETHEREUM_FORMAT);
          if (!wallet || !account) throw new Error("the wallet has no Ethereum account");
          await api.wallet.register({ address: account.address, walletId: wallet.walletId }, attemptId.current);
          return { address: account.address, walletId: wallet.walletId };
        }).finally(() => {
          if (activeWallet.current === pending) activeWallet.current = undefined;
        });
        activeWallet.current = pending;
        return pending;
      },
      async signOutTurnkey() {
        pendingToken.current = undefined;
        await logout();
      },
    }),
    [
      providers,
      session,
      user,
      initOtp,
      completeOtp,
      emailOtp,
      handleAppleOauth,
      handleGoogleOauth,
      proveSession,
      createWallet,
      refreshWallets,
      logout,
      once,
    ],
  );
}
