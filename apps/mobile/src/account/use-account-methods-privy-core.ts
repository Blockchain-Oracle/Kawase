// Settings → Account with Privy (D41), in the shape the Turnkey half has (account-methods-core.ts), so the account,
// devices and export screens work with either provider. Everything acts on the person's own Privy user:
// - linking Google or Apple adds that login to the Privy user (Privy refuses one that belongs to another account);
//   removing one unlinks it by its subject, never the last way in;
// - the email: changing it verifies a code sent to the new address; an account without one (Google or Apple only)
//   links one the same way; either way Kawase then follows the verified address;
// - devices: Privy sessions are not per-device API keys, so "sign out this device" ends the Kawase session only;
// - export: Privy shows the private key in its own secure window (web) and never hands it to the app.
import {
  methodCount,
  type AccountMethods,
  type LinkProvider,
  type LoginMethod,
  type SignInMethods,
} from "./account-methods-core";
import { privyApi, type PrivyTokens } from "@/wallet/privy-api";
import { api } from "@/session/api";

/** How this platform exports the key: Privy's own window here (web), or that window opened on the web app (phone). */
export type WalletExport = "phrase" | "privyWindow" | "privyOnWeb";

export type PrivyAccountMethods = AccountMethods & {
  walletExport: WalletExport;
  /** Opens Privy's export window (web) or the web app's export page (phone). */
  exportKey: () => Promise<void>;
};

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

const notConfigured = () => Promise.reject(new Error("Sign in is not configured on this build"));
/** A build without the Privy ids: nothing is linked and every action says so. */
export const UNCONFIGURED_METHODS: PrivyAccountMethods = {
  manageable: false,
  methods: { email: null, google: false, apple: false },
  removable: () => false,
  unlink: notConfigured,
  refresh: notConfigured,
  link: notConfigured,
  sendEmailCode: notConfigured,
  confirmEmail: notConfigured,
  deleteSessionKeys: async () => 0,
  exportPhrase: notConfigured,
  walletExport: "privyWindow",
  exportKey: notConfigured,
};

export function privyAccountMethods(kit: PrivyMethodsKit): PrivyAccountMethods {
  const methods = methodsOf(kit.accounts);
  /** Kawase follows the email Privy verified (a removed or changed one included); never blocks the step that ran. */
  const follow = async () => {
    await privyApi.syncEmail(await kit.tokens()).catch(() => undefined);
  };
  return {
    manageable: kit.authenticated,
    methods,
    removable(current: SignInMethods, method: LoginMethod) {
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
      await kit.sendEmailCode(email.trim(), methods.email ? "update" : "link");
      // Privy keeps the pending code on its side; the screen's step only needs the email.
      return { otpId: "", otpEncryptionTargetBundle: "" };
    },
    async confirmEmail(input) {
      await kit.confirmEmailCode(input.email.trim(), input.code.trim(), methods.email ? "update" : "link");
      return privyApi.syncEmail(await kit.tokens());
    },
    // Privy sessions are not device keys; the Kawase session of that device is what "sign out" ends.
    deleteSessionKeys: async () => 0,
    // Privy never hands the key to the app (the export window shows it); the phrase flow is Turnkey's.
    exportPhrase: () => Promise.reject(new Error("Privy shows the key in its own window")),
    walletExport: kit.walletExport,
    async exportKey() {
      await kit.exportKey();
      await api.account.exportRecorded().catch(() => undefined);
    },
  };
}
