// Settings → Account, the Turnkey half (cards/access.md "Link methods / change email", "Devices", "Export wallet").
// Everything here acts on the person's own Turnkey user with their own session (the same user every linked method
// reaches): linking Google or Apple adds an OAuth provider, changing the email verifies a code sent to the new address,
// signing a device out deletes that device's session API key, and export decrypts the wallet on this device only.
// Sign-in itself stays in wallet/turnkey-account-core.ts; this module never signs anyone in.
import { api } from "@/session/api";

type OauthProvider = { providerId: string; providerName: string; issuer: string };
type ApiKey = { apiKeyId: string; apiKeyName?: string; credential?: { publicKey?: string } };
type TurnkeyUser = { userId: string; userEmail?: string | undefined; oauthProviders?: OauthProvider[]; apiKeys?: ApiKey[] };
type OauthSuccess = { oidcToken: string; providerName: string };

/** The parts of either Turnkey kit's `useTurnkey()` this module uses (react-native-wallet-kit and react-wallet-kit agree). */
export type TurnkeyAccountApi = {
  user: TurnkeyUser | undefined;
  session: { organizationId: string; userId: string } | undefined;
  wallets: { walletId: string; accounts: { addressFormat: string }[] }[];
  fetchUser: () => Promise<TurnkeyUser>;
  initOtp: (input: { otpType: string; contact: string }) => Promise<{ otpId: string; otpEncryptionTargetBundle: string }>;
  verifyOtp: (input: { otpId: string; otpCode: string; contact: string; otpType: string; otpEncryptionTargetBundle: string }) => Promise<{ verificationToken: string }>;
  updateUserEmail: (input: { email: string; verificationToken: string }) => Promise<string>;
  addOauthProvider: (input: { providerName: string; oidcToken: string }) => Promise<string[]>;
  handleGoogleOauth: (input: { onOauthSuccess: (result: OauthSuccess) => void }) => Promise<void>;
  handleAppleOauth: (input: { onOauthSuccess: (result: OauthSuccess) => void }) => Promise<void>;
  exportWallet: (input: { walletId: string }) => Promise<string>;
  httpClient: { deleteApiKeys: (input: { organizationId: string; userId: string; apiKeyIds: string[] }) => Promise<unknown> } | undefined;
};

export type LinkProvider = "google" | "apple";

const ISSUERS: Record<LinkProvider, RegExp> = { google: /accounts\.google\.com/i, apple: /appleid\.apple\.com/i };
const ETHEREUM_FORMAT = "ADDRESS_FORMAT_ETHEREUM";

export type SignInMethods = { email: string | null; google: boolean; apple: boolean };

export function accountMethodsCore(turnkey: TurnkeyAccountApi, emailOtp: string) {
  const methodsOf = (user: TurnkeyUser | undefined): SignInMethods => ({
    email: user?.userEmail || null,
    google: Boolean(user?.oauthProviders?.some((provider) => ISSUERS.google.test(provider.issuer))),
    apple: Boolean(user?.oauthProviders?.some((provider) => ISSUERS.apple.test(provider.issuer))),
  });

  return {
    methods: methodsOf(turnkey.user),
    async refresh(): Promise<SignInMethods> {
      return methodsOf(await turnkey.fetchUser());
    },

    /**
     * Opens Google or Apple and adds the identity to this Turnkey user. Turnkey refuses an identity that already belongs
     * to another account (the caller explains and offers to sign in there).
     */
    async link(provider: LinkProvider): Promise<void> {
      const token = await new Promise<OauthSuccess>((resolve, reject) => {
        const run = provider === "google" ? turnkey.handleGoogleOauth : turnkey.handleAppleOauth;
        run({ onOauthSuccess: resolve }).catch(reject);
      });
      await turnkey.addOauthProvider({ providerName: token.providerName, oidcToken: token.oidcToken });
      await api.account.syncEmail().catch(() => undefined);
    },

    sendEmailCode(email: string) {
      return turnkey.initOtp({ otpType: emailOtp, contact: email.trim() });
    },

    /** Verifies the code sent to the new address, sets it on the Turnkey user, and has Kawase follow it. */
    async confirmEmail(input: { email: string; code: string; otpId: string; otpEncryptionTargetBundle: string }) {
      const { verificationToken } = await turnkey.verifyOtp({
        otpId: input.otpId,
        otpCode: input.code.trim(),
        contact: input.email.trim(),
        otpType: emailOtp,
        otpEncryptionTargetBundle: input.otpEncryptionTargetBundle,
      });
      await turnkey.updateUserEmail({ email: input.email.trim(), verificationToken });
      return api.account.syncEmail();
    },

    /** Deletes the Turnkey session API keys of signed-out devices (by their public keys). Returns how many went. */
    async deleteSessionKeys(publicKeys: string[]): Promise<number> {
      const session = turnkey.session;
      if (!session || !turnkey.httpClient || publicKeys.length === 0) return 0;
      const user = await turnkey.fetchUser();
      const wanted = new Set(publicKeys.map((key) => key.toLowerCase()));
      const ids = (user.apiKeys ?? []).filter((key) => key.credential?.publicKey && wanted.has(key.credential.publicKey.toLowerCase())).map((key) => key.apiKeyId);
      if (ids.length === 0) return 0;
      await turnkey.httpClient.deleteApiKeys({ organizationId: session.organizationId, userId: session.userId, apiKeyIds: ids });
      return ids.length;
    },

    /** The wallet's recovery phrase, decrypted on this device (never sent anywhere). */
    async exportPhrase(): Promise<string> {
      const wallet = turnkey.wallets.find((entry) => entry.accounts.some((account) => account.addressFormat === ETHEREUM_FORMAT));
      if (!wallet) throw new Error("no wallet to export");
      const phrase = await turnkey.exportWallet({ walletId: wallet.walletId });
      await api.account.exportRecorded().catch(() => undefined);
      return phrase;
    },
  };
}

export type AccountMethods = ReturnType<typeof accountMethodsCore>;
