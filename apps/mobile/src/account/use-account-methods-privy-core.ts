// Settings → Account with Privy (D41), in the shape the Turnkey half has (account-methods-core.ts), so the account,
// devices and export screens work unchanged. Everything acts on the person's own Privy user:
// - linking Google or Apple adds that login to the Privy user (Privy refuses one that belongs to another account);
// - changing the email verifies a code sent to the new address at Privy, then Kawase follows the verified address;
// - devices: Privy sessions are not per-device API keys, so "sign out this device" ends the Kawase session only;
// - export: Privy shows the private key in its own secure window (web) and never hands it to the app.
import type { AccountMethods, LinkProvider, SignInMethods } from "./account-methods-core";
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
export type PrivyLinked = { type: string; address?: string | null; email?: string | null };

export function methodsOf(accounts: readonly PrivyLinked[]): SignInMethods {
  const email = accounts.find((account) => account.type === "email")?.address ?? null;
  return {
    email,
    google: accounts.some((account) => account.type === "google_oauth"),
    apple: accounts.some((account) => account.type === "apple_oauth"),
  };
}

export type PrivyMethodsKit = {
  accounts: readonly PrivyLinked[];
  refreshAccounts: () => Promise<readonly PrivyLinked[]>;
  link: (provider: LinkProvider) => Promise<void>;
  sendEmailCode: (newEmail: string) => Promise<void>;
  updateEmail: (newEmail: string, code: string) => Promise<void>;
  tokens: () => Promise<PrivyTokens>;
  walletExport: WalletExport;
  exportKey: () => Promise<void>;
};

const notConfigured = () => Promise.reject(new Error("Sign in is not configured on this build"));
/** A build without the Privy ids: nothing is linked and every action says so. */
export const UNCONFIGURED_METHODS: PrivyAccountMethods = {
  methods: { email: null, google: false, apple: false },
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
  return {
    methods: methodsOf(kit.accounts),
    async refresh() {
      return methodsOf(await kit.refreshAccounts());
    },
    async link(provider) {
      await kit.link(provider);
      await privyApi.syncEmail(await kit.tokens()).catch(() => undefined);
    },
    async sendEmailCode(email) {
      await kit.sendEmailCode(email.trim());
      // Privy keeps the pending code on its side; the screen's step only needs the email.
      return { otpId: "", otpEncryptionTargetBundle: "" };
    },
    async confirmEmail(input) {
      await kit.updateEmail(input.email.trim(), input.code.trim());
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
