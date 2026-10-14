// Dev mode behind the sign-in shape the screens already use (config.ts `isDev`): the sheet's email step takes any
// `@kawase.test` email and its code step any code; then the email's throwaway key signs the api's nonce and the api
// signs the account in with that key as its wallet. Nothing leaves this machine but the local api call.
import * as React from "react";

import type { ApiUser } from "@kawase/api-client";

import { api } from "@/session/api";
import { deviceInfo, useSession } from "@/session/session-provider";
import { sessionStorage } from "@/session/storage";
import { currentDevAccount, currentDevEmail, devKeyFor, setCurrentDevEmail } from "./dev-key";
import type { TurnkeyAccount } from "./turnkey-account-core";
import { privateKeyToAccount } from "viem/accounts";

const DEV_DOMAIN = "@kawase.test";
const signInMessage = (nonce: string) => `Kawase dev sign-in\n${nonce}`;

export function useDevAccount(): TurnkeyAccount {
  const { adoptToken, status } = useSession();
  const signedIn = status === "account" && Boolean(currentDevEmail());

  const signIn = React.useCallback(
    async (email: string): Promise<ApiUser> => {
      const id = email.trim().toLowerCase();
      if (!id.endsWith(DEV_DOMAIN)) throw new Error(`Dev mode signs in ${DEV_DOMAIN} emails only`);
      const account = privateKeyToAccount(devKeyFor(id));
      const { nonce } = await api.auth.nonce();
      const signature = await account.signMessage({ message: signInMessage(nonce) });
      const { token } = await api.auth.dev({ email: id, address: account.address, nonce, signature, device: await deviceInfo() }, await sessionStorage.getToken());
      setCurrentDevEmail(id);
      return adoptToken(token);
    },
    [adoptToken],
  );

  return React.useMemo<TurnkeyAccount>(
    () => ({
      available: true,
      providers: [],
      signedIn,
      email: currentDevEmail(),
      sendCode: () => Promise.resolve({ otpId: "dev", otpEncryptionTargetBundle: "" }),
      verifyCode: ({ email }) => signIn(email),
      signInWith: () => Promise.reject(new Error("Dev mode signs in with an email")),
      linkSession: () => {
        const email = currentDevEmail();
        return email ? signIn(email) : Promise.reject(new Error("No dev account on this browser"));
      },
      ensureWallet: () => {
        const account = currentDevAccount();
        return account ? Promise.resolve({ address: account.address, walletId: "dev" }) : Promise.reject(new Error("No dev account on this browser"));
      },
      signOutTurnkey: () => {
        setCurrentDevEmail(undefined);
        return Promise.resolve();
      },
    }),
    [signedIn, signIn],
  );
}
