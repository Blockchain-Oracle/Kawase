// The Turnkey side of sign-in and wallet creation, bridged to the api, shared by the native and the web kit (both
// expose the same `useTurnkey()` methods from @turnkey/core): after the email code, Apple or Google, the app proves
// its Turnkey session to the api (one sign-in), creates the wallet if the account has none, and registers its
// address. Each platform passes its own kit's context and the providers it supports.
import * as React from "react";

import type { ApiUser } from "@kawase/api-client";

import { api } from "@/session/api";
import { deviceInfo, useSession } from "@/session/session-provider";
import { sessionStorage } from "@/session/storage";

const ETHEREUM_FORMAT = "ADDRESS_FORMAT_ETHEREUM";
const WALLET_NAME = "Kawase";
/** The kit publishes the new session through React state; a sign-in waits this long for it to land. */
const SESSION_WAIT_MS = 10_000;
const SESSION_POLL_MS = 50;

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
  verifyCode: (input: { email: string; code: string; otpId: string; otpEncryptionTargetBundle: string }) => Promise<ApiUser>;
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
  stampGetActivity: (input: { organizationId: string; activityId: string }) => Promise<{ body: string; stamp: { stampHeaderValue: string } } | undefined>;
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
  initOtp: (input: { otpType: never; contact: string }) => Promise<{ otpId: string; otpEncryptionTargetBundle: string }>;
  completeOtp: (input: { otpId: string; otpEncryptionTargetBundle: string; otpCode: string; contact: string; otpType: never }) => Promise<unknown>;
  handleAppleOauth: () => Promise<unknown>;
  handleGoogleOauth: () => Promise<unknown>;
  createWallet: (input: { walletName: string; accounts: never[] }) => Promise<unknown>;
  refreshWallets: () => Promise<KitWallet[]>;
  logout: () => Promise<unknown>;
};

export function useTurnkeyAccountCore(turnkey: TurnkeyKit, options: { providers: readonly SocialProvider[]; emailOtp: unknown }): TurnkeyAccount {
  const { adoptToken } = useSession();
  const { initOtp, completeOtp, handleAppleOauth, handleGoogleOauth, session, httpClient, createWallet, refreshWallets, wallets, logout, user } = turnkey;
  const emailOtp = options.emailOtp as never;
  const providers = options.providers;

  // A sign-in's continuation runs after the kit has re-rendered with the new session, so it reads the latest
  // values through this ref instead of the ones captured when it started.
  const latest = React.useRef({ session, httpClient, wallets });
  latest.current = { session, httpClient, wallets };

  const waitForSession = React.useCallback(async () => {
    const deadline = Date.now() + SESSION_WAIT_MS;
    while (!latest.current.session || !latest.current.httpClient) {
      if (Date.now() > deadline) throw new Error("no Turnkey session");
      await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS));
    }
    return { session: latest.current.session, httpClient: latest.current.httpClient };
  }, []);

  const proveSession = React.useCallback(async (): Promise<ApiUser> => {
    const { session: current, httpClient: client } = await waitForSession();
    const { nonce } = await api.auth.nonce();
    // The proof is a Turnkey stamp over a "get activity" request whose activity id is the api's nonce.
    const signed = await client.stampGetActivity({ organizationId: current.organizationId, activityId: nonce });
    if (!signed) throw new Error("the session could not sign");
    const guestToken = await sessionStorage.getToken();
    const { token } = await api.auth.turnkey(
      { proof: { body: signed.body, stamp: signed.stamp.stampHeaderValue }, turnkeyUserId: current.userId, device: await deviceInfo() },
      guestToken,
    );
    return adoptToken(token);
  }, [waitForSession, adoptToken]);

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
        await completeOtp({ otpId, otpEncryptionTargetBundle, otpCode: code.trim(), contact: email.trim(), otpType: emailOtp });
        return proveSession();
      },
      async signInWith(provider) {
        await (provider === "apple" ? handleAppleOauth() : handleGoogleOauth());
        return proveSession();
      },
      linkSession: proveSession,
      async ensureWallet() {
        let current = latest.current.wallets;
        if (current.length === 0) current = await refreshWallets();
        if (current.length === 0) {
          await createWallet({ walletName: WALLET_NAME, accounts: [ETHEREUM_FORMAT as never] });
          current = await refreshWallets();
        }
        const wallet = current[0];
        const account = wallet?.accounts.find((candidate) => candidate.addressFormat === ETHEREUM_FORMAT);
        if (!wallet || !account) throw new Error("the wallet has no Ethereum account");
        await api.wallet.register({ address: account.address, walletId: wallet.walletId });
        return { address: account.address, walletId: wallet.walletId };
      },
      async signOutTurnkey() {
        await logout();
      },
    }),
    [providers, session, user, initOtp, completeOtp, emailOtp, handleAppleOauth, handleGoogleOauth, proveSession, createWallet, refreshWallets, logout],
  );
}
