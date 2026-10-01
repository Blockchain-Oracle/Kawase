// The Turnkey side of sign-in and wallet creation, bridged to the api: after the email code, Apple or Google, the
// app proves its Turnkey session to the api (one sign-in), creates the wallet if the account has none, and
// registers its address.
import { OtpType, useTurnkey } from "@turnkey/react-native-wallet-kit";
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

export function useTurnkeyAccount(): TurnkeyAccount {
  const turnkey = useTurnkey();
  const { adoptToken } = useSession();
  const { initOtp, completeOtp, handleAppleOauth, handleGoogleOauth, session, httpClient, createWallet, refreshWallets, wallets, logout, user } = turnkey;

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
      providers: ["apple", "google"],
      signedIn: Boolean(session),
      email: user?.userEmail,
      async sendCode(email) {
        const result = await initOtp({ otpType: OtpType.Email, contact: email.trim() });
        return { otpId: result.otpId, otpEncryptionTargetBundle: result.otpEncryptionTargetBundle };
      },
      async verifyCode({ email, code, otpId, otpEncryptionTargetBundle }) {
        await completeOtp({ otpId, otpEncryptionTargetBundle, otpCode: code.trim(), contact: email.trim(), otpType: OtpType.Email });
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
          await createWallet({ walletName: WALLET_NAME, accounts: [ETHEREUM_FORMAT] });
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
    [session, user, initOtp, completeOtp, handleAppleOauth, handleGoogleOauth, proveSession, createWallet, refreshWallets, logout],
  );
}
