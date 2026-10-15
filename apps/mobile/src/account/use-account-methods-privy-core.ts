// Settings → Account with Privy (D41), behind account-methods.ts. Everything acts on the person's own Privy user:
// - linking Google or Apple adds that login to the Privy user (Privy refuses one that belongs to another account);
//   removing one unlinks it by its subject, never the last way in;
// - the email: changing it verifies a code sent to the new address; an account without one (Google or Apple only)
//   links one the same way; either way Kawase then follows the verified address;
// - export: Privy shows the private key in its own secure window (web) and never hands it to the app.
import type { PrivyTokens } from "@kawase/api-client";

import { api } from "@/session/api";

import { methodCount, type AccountMethods, type LinkProvider, type SignInMethods, type WalletExport } from "./account-methods";

/** Linked logins on a Privy user, in either SDK's shape (snake case on Expo, camel case on the web). */
export type PrivyLinked = { type: string; address?: string | null; email?: string | null; subject?: string | null };

const OAUTH_TYPE: Record<LinkProvider, string> = { google: "google_oauth", apple: "apple_oauth" };

export function methodsOf(accounts: readonly PrivyLinked[]): SignInMethods {
  const email = accounts.find((account) => account.type === "email")?.address ?? null;
  return {
    email,
    google: accounts.some((account) => account.type === OAUTH_TYPE.google),
    apple: accounts.some((account) => account.type === OAUTH_TYPE.apple),
  };
}

export type PrivyMethodsKit = {
  /** A Privy session is on this device (the methods can be read and changed). */
  authenticated: boolean;
  accounts: readonly PrivyLinked[];
  refreshAccounts: () => Promise<readonly PrivyLinked[]>;
  link: (provider: LinkProvider) => Promise<void>;
  unlinkOAuth: (provider: LinkProvider, subject: string) => Promise<void>;
  unlinkEmail: (address: string) => Promise<void>;
  /** A code to a new address: to replace the email (`update`) or to add one to an account without (`link`). */
  sendEmailCode: (newEmail: string, mode: "update" | "link") => Promise<void>;
  confirmEmailCode: (newEmail: string, code: string, mode: "update" | "link") => Promise<void>;
  tokens: () => Promise<PrivyTokens>;
  walletExport: WalletExport;
  exportKey: () => Promise<void>;
};

export function privyAccountMethods(kit: PrivyMethodsKit): AccountMethods {
  const methods = methodsOf(kit.accounts);
  /** Kawase follows the email Privy verified (a removed or changed one included); never blocks the step that ran. */
  const follow = async () => {
    await api.auth.privySync(await kit.tokens()).catch(() => undefined);
  };
  return {
    manageable: kit.authenticated,
    methods,
    removable(current, method) {
      const linked = method === "email" ? Boolean(current.email) : current[method];
      return kit.authenticated && linked && methodCount(current) > 1;
    },
    async unlink(method) {
      const accounts = await kit.refreshAccounts();
      if (methodCount(methodsOf(accounts)) <= 1) throw new Error("the last sign-in method can't be removed");
      if (method === "email") {
        const address = accounts.find((account) => account.type === "email")?.address;
        if (address) await kit.unlinkEmail(address);
      } else {
        const subject = accounts.find((account) => account.type === OAUTH_TYPE[method])?.subject;
        if (subject) await kit.unlinkOAuth(method, subject);
      }
      await follow();
    },
    async refresh() {
      return methodsOf(await kit.refreshAccounts());
    },
    async link(provider) {
      await kit.link(provider);
      await follow();
    },
    async sendEmailCode(email) {
      // Privy keeps the pending code on its side; the screen's next step only needs the email.
      await kit.sendEmailCode(email.trim(), methods.email ? "update" : "link");
    },
    async confirmEmail(input) {
      await kit.confirmEmailCode(input.email.trim(), input.code.trim(), methods.email ? "update" : "link");
      return api.auth.privySync(await kit.tokens());
    },
    walletExport: kit.walletExport,
    async exportKey() {
      await kit.exportKey();
      await api.account.exportRecorded().catch(() => undefined);
    },
  };
}
