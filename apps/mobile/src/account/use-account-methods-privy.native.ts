// iOS and Android: Settings → Account over Privy's Expo SDK (D41). Privy shows a private key only in its own web window,
// so export opens the web app's export page in the system browser (docs.privy.io recipes/mobile-key-export).
import "@/wallet/privy-polyfills.native";

import { getAccessToken, useIdentityToken, useLinkWithOAuth, usePrivy, useUpdateEmail } from "@privy-io/expo";
import * as WebBrowser from "expo-web-browser";

import { WEB_APP_URL } from "@/wallet/config";
import { privyAccountMethods, type PrivyAccountMethods, type PrivyLinked } from "./use-account-methods-privy-core";

/** The web app's export page (the same screen, where Privy can show its export window). */
const EXPORT_PATH = "/account/export";

export function usePrivyAccountMethods(): PrivyAccountMethods {
  const { user, refreshUser } = usePrivy();
  const { link } = useLinkWithOAuth();
  const { sendCode, updateEmail } = useUpdateEmail();
  const { getIdentityToken } = useIdentityToken();
  return privyAccountMethods({
    accounts: (user?.linked_accounts ?? []) as readonly PrivyLinked[],
    refreshAccounts: async () => ((await refreshUser()).user.linked_accounts ?? []) as readonly PrivyLinked[],
    link: async (provider) => {
      await link({ provider });
    },
    sendEmailCode: (newEmailAddress) => sendCode({ newEmailAddress }),
    updateEmail: async (newEmailAddress, code) => {
      await updateEmail({ newEmailAddress, code });
    },
    tokens: async () => {
      const [accessToken, identityToken] = await Promise.all([getAccessToken(), getIdentityToken().catch(() => null)]);
      if (!accessToken) throw new Error("Privy: not signed in");
      return { accessToken, ...(identityToken ? { identityToken } : {}) };
    },
    walletExport: "privyOnWeb",
    exportKey: async () => {
      await WebBrowser.openBrowserAsync(`${WEB_APP_URL}${EXPORT_PATH}`);
    },
  });
}
