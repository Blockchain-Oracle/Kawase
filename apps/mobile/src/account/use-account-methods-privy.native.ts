// iOS and Android: Settings → Account over Privy's Expo SDK (D41). Privy shows a private key only in its own web window,
// so export opens the web app's export page in the system browser (docs.privy.io recipes/mobile-key-export).
import "@/wallet/privy-polyfills.native";

import {
  getAccessToken,
  useIdentityToken,
  useLinkEmail,
  useLinkWithOAuth,
  usePrivy,
  useUnlinkEmail,
  useUnlinkOAuth,
  useUpdateEmail,
} from "@privy-io/expo";
import * as WebBrowser from "expo-web-browser";

import { WEB_APP_URL } from "@/wallet/config";
import type { AccountMethods } from "./account-methods";
import { privyAccountMethods, type PrivyLinked } from "./use-account-methods-privy-core";

/** The web app's export page (the same screen, where Privy can show its export window). */
const EXPORT_PATH = "/account/export";

export function usePrivyAccountMethods(): AccountMethods {
  const { isReady, user, refreshUser } = usePrivy();
  const { link } = useLinkWithOAuth();
  const { unlinkOAuth } = useUnlinkOAuth();
  const { unlinkEmail } = useUnlinkEmail();
  const update = useUpdateEmail();
  const linkEmail = useLinkEmail();
  const { getIdentityToken } = useIdentityToken();
  return privyAccountMethods({
    authenticated: isReady && Boolean(user),
    accounts: (user?.linked_accounts ?? []) as readonly PrivyLinked[],
    refreshAccounts: async () => ((await refreshUser()).user.linked_accounts ?? []) as readonly PrivyLinked[],
    link: async (provider) => {
      await link({ provider });
    },
    unlinkOAuth: async (provider, subject) => {
      await unlinkOAuth({ provider, subject });
    },
    unlinkEmail: async (email) => {
      await unlinkEmail({ email });
    },
    sendEmailCode: async (email, mode) => {
      if (mode === "update") await update.sendCode({ newEmailAddress: email });
      else await linkEmail.sendCode({ email });
    },
    confirmEmailCode: async (email, code, mode) => {
      if (mode === "update") await update.updateEmail({ newEmailAddress: email, code });
      else await linkEmail.linkWithCode({ code, email });
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
