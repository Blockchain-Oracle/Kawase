// The web: Settings → Account over Privy's React SDK (D41); dev mode and a build without the Privy ids have nothing to
// manage (account-methods.ts UNCONFIGURED_METHODS).
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

import { isDev, isWalletConfigured } from "@/wallet/config";

import { UNCONFIGURED_METHODS, type AccountMethods } from "./account-methods";
import { privyAccountMethods, type PrivyLinked } from "./use-account-methods-privy-core";

function usePrivyAccountMethods(): AccountMethods {
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
    sendEmailCode: (email, mode) =>
      mode === "update" ? update.sendCode({ newEmailAddress: email }) : link.sendCode({ email }),
    confirmEmailCode: async (_email, code, mode) => {
      if (mode === "update") await update.verifyCode({ code });
      else await link.linkWithCode({ code });
    },
    tokens: async () => {
      const [accessToken, identityToken] = await Promise.all([
        privy.getAccessToken(),
        getIdentityToken().catch(() => null),
      ]);
      if (!accessToken) throw new Error("Privy: not signed in");
      return { accessToken, ...(identityToken ? { identityToken } : {}) };
    },
    walletExport: "privyWindow",
    exportKey: () => privy.exportWallet(),
  });
}

export const useAccountMethods: () => AccountMethods =
  isDev || !isWalletConfigured ? () => UNCONFIGURED_METHODS : usePrivyAccountMethods;
