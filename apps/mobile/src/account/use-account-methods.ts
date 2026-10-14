// The web: Turnkey's React kit, or Privy's React SDK when it is the wallet provider (D41).
import { OtpType, useTurnkey } from "@turnkey/react-wallet-kit";
import {
  getIdentityToken,
  useLinkEmail,
  useLinkWithOAuth,
  usePrivy,
  useUnlinkEmail,
  useUnlinkOAuth,
  useUpdateEmail,
  useUser,
} from "@privy-io/react-auth";

import { isPrivy, isWalletConfigured } from "@/wallet/config";
import { accountMethodsCore, type AccountMethods, type TurnkeyAccountApi } from "./account-methods-core";
import {
  privyAccountMethods,
  UNCONFIGURED_METHODS,
  type PrivyAccountMethods,
  type PrivyLinked,
} from "./use-account-methods-privy-core";

function useTurnkeyAccountMethods(): AccountMethods {
  return accountMethodsCore(useTurnkey() as unknown as TurnkeyAccountApi, OtpType.Email);
}

function usePrivyAccountMethods(): PrivyAccountMethods {
  const privy = usePrivy();
  const { user, refreshUser } = useUser();
  const { initOAuth } = useLinkWithOAuth();
  const { unlink: unlinkOAuth } = useUnlinkOAuth();
  const { unlink: unlinkEmail } = useUnlinkEmail();
  const update = useUpdateEmail();
  const link = useLinkEmail();
  return privyAccountMethods({
    authenticated: privy.ready && privy.authenticated,
    accounts: (user?.linkedAccounts ?? []) as readonly PrivyLinked[],
    refreshAccounts: async () => ((await refreshUser()).linkedAccounts ?? []) as readonly PrivyLinked[],
    // The page leaves for the provider and comes back with the login linked (the account screen reads it again).
    link: (provider) => initOAuth({ provider }),
    unlinkOAuth: async (provider, subject) => {
      await unlinkOAuth({ provider, subject });
    },
    unlinkEmail: async (address) => {
      await unlinkEmail({ address });
    },
    sendEmailCode: (email, mode) => (mode === "update" ? update.sendCode({ newEmailAddress: email }) : link.sendCode({ email })),
    confirmEmailCode: async (_email, code, mode) => {
      if (mode === "update") await update.verifyCode({ code });
      else await link.linkWithCode({ code });
    },
    tokens: async () => {
      const [accessToken, identityToken] = await Promise.all([privy.getAccessToken(), getIdentityToken().catch(() => null)]);
      if (!accessToken) throw new Error("Privy: not signed in");
      return { accessToken, ...(identityToken ? { identityToken } : {}) };
    },
    walletExport: "privyWindow",
    exportKey: () => privy.exportWallet(),
  });
}

export const useAccountMethods: () => AccountMethods | PrivyAccountMethods = !isPrivy
  ? useTurnkeyAccountMethods
  : isWalletConfigured
    ? usePrivyAccountMethods
    : () => UNCONFIGURED_METHODS;
