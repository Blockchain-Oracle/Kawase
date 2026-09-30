// The parent organization's read access to every user's sub-organization (Turnkey docs: "parent organizations
// can query data for all of their sub-organizations"). Used to confirm that a session key belongs to the user
// who claims it, and to read the user's email and wallet addresses.
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { TurnkeyClient } from "@turnkey/http";

export type TurnkeyUser = {
  userId: string;
  userName: string;
  email: string | undefined;
  /** Compressed public keys of the user's live API keys (sessions are API keys with an expiry). */
  sessionPublicKeys: string[];
};

export type TurnkeyReader = {
  getUser(organizationId: string, userId: string): Promise<TurnkeyUser | undefined>;
  /** Ethereum addresses of every wallet account in the sub-organization. */
  getWalletAddresses(organizationId: string): Promise<{ walletId: string; address: string }[]>;
};

const MS_PER_SECOND = 1000;
/** A session from the Auth Proxy is a "login" credential; an API key made in the dashboard is a P-256 key. Both stamp with P-256. */
const P256_CREDENTIALS = new Set(["CREDENTIAL_TYPE_LOGIN", "CREDENTIAL_TYPE_API_KEY_P256"]);
const ETHEREUM = "ADDRESS_FORMAT_ETHEREUM";

export function createTurnkeyReader(config: {
  baseUrl: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}): TurnkeyReader {
  const client = new TurnkeyClient(
    { baseUrl: config.baseUrl },
    new ApiKeyStamper({ apiPublicKey: config.apiPublicKey, apiPrivateKey: config.apiPrivateKey }),
  );
  return {
    async getUser(organizationId, userId) {
      try {
        const { user } = await client.getUser({ organizationId, userId });
        const now = Date.now();
        const sessionPublicKeys = user.apiKeys
          .filter((key) => P256_CREDENTIALS.has(key.credential.type))
          .filter((key) => {
            if (!key.expirationSeconds) return true;
            const createdMs = Number(key.createdAt.seconds) * MS_PER_SECOND;
            return createdMs + Number(key.expirationSeconds) * MS_PER_SECOND > now;
          })
          .map((key) => key.credential.publicKey);
        return { userId: user.userId, userName: user.userName, email: user.userEmail, sessionPublicKeys };
      } catch (error) {
        if (error instanceof Error && /not found|does not exist|NOT_FOUND/i.test(error.message)) return undefined;
        throw error;
      }
    },
    async getWalletAddresses(organizationId) {
      const { wallets } = await client.getWallets({ organizationId });
      const addresses: { walletId: string; address: string }[] = [];
      for (const wallet of wallets) {
        const { accounts } = await client.getWalletAccounts({ organizationId, walletId: wallet.walletId });
        for (const account of accounts) {
          if (account.addressFormat === ETHEREUM)
            addresses.push({ walletId: wallet.walletId, address: account.address });
        }
      }
      return addresses;
    },
  };
}
