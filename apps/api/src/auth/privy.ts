// Privy sign-in, checked on our side (D41). The app sends the two tokens Privy gave it after the email code, Google or
// Apple: the access token (who and which session) and the identity token (the user's verified email and embedded
// wallet). Both are ES256 JWTs issued by privy.io for our app id, verified here locally with Privy's verification key
// (@privy-io/node; no network call per request). Email and wallet are read from the signed identity token, never from
// the request body.
//
// The key is PRIVY_VERIFICATION_KEY when set; otherwise it is read once from the app's public Privy config (the same
// PEM the dashboard shows) and kept for the life of the process. Only a signature that fails against it re-reads it
// (Privy rotated the key), at most once a minute: expired or malformed tokens never cause an outbound request. A key
// that cannot be loaded is an outage (502), never a bad token (401).
import { getAddress, isAddress, type Address } from "viem";
import { verifyAccessToken, verifyIdentityToken, type LinkedAccount, type User } from "@privy-io/node";

const PRIVY_AUTH_URL = "https://auth.privy.io/api/v1";
const PRIVY_API_URL = "https://api.privy.io/v1";
/** A rotated key is looked for at most this often, however many bad signatures arrive. */
const KEY_REFETCH_COOLDOWN_MS = 60_000;
/** What @privy-io/node says when the signature (not the expiry or the claims) fails: the only case a new key could fix. */
const SIGNATURE_FAILED = /failed to verify/i;

export type PrivyIdentity = {
  /** The Privy user id (a DID, "did:privy:…"): the identity Kawase links to. */
  userId: string;
  /** The Privy session the tokens belong to. */
  sessionId: string;
  /** An email Privy verified: the email-code login, or the Google/Apple account's email. */
  email: string | undefined;
  /** The user's Privy embedded Ethereum wallet, when it exists yet. */
  wallet: { address: Address; walletId: string | undefined } | undefined;
};

export type PrivyVerifier = {
  /** Who holds this access token (throws when it is not a valid, current token for our app). */
  verifyAccess(accessToken: string): Promise<{ userId: string; sessionId: string }>;
  /** The full identity: the access token, plus the identity token (or Privy's API when the app has a secret). */
  identify(input: { accessToken: string; identityToken?: string | undefined }): Promise<PrivyIdentity>;
};

export class PrivyTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivyTokenError";
  }
}

const isEmail = (value: unknown): value is string => typeof value === "string" && value.includes("@");

/** Privy's embedded wallets: the original client and the server-wallet one ("user-controlled server wallets"). */
const EMBEDDED_CLIENT_TYPES: ReadonlySet<string> = new Set(["privy", "privy-v2"]);

/** The verified email and the embedded wallet from Privy's user object. */
export function readPrivyUser(user: Pick<User, "linked_accounts">): Pick<PrivyIdentity, "email" | "wallet"> {
  const accounts: LinkedAccount[] = user.linked_accounts ?? [];
  // The email-code login first; then a Google or Apple account's email (verified by that provider).
  const email =
    accounts.find((account) => account.type === "email")?.address ??
    accounts.map((account) => (account.type === "google_oauth" || account.type === "apple_oauth" ? account.email : undefined)).find(isEmail);
  const embedded = accounts.find(
    (account) =>
      account.type === "wallet" &&
      "wallet_client_type" in account &&
      EMBEDDED_CLIENT_TYPES.has(String(account.wallet_client_type)) &&
      account.chain_type === "ethereum",
  );
  const address = embedded && "address" in embedded ? embedded.address : undefined;
  const walletId = embedded && "id" in embedded && typeof embedded.id === "string" ? embedded.id : undefined;
  return {
    email: isEmail(email) ? email.trim() : undefined,
    wallet: address && isAddress(address) ? { address: getAddress(address), walletId } : undefined,
  };
}

export function createPrivyVerifier(config: {
  appId: string;
  verificationKey?: string | undefined;
  /** Only for reading a user whose identity token was not sent (Basic auth to Privy's REST API). */
  appSecret?: string | undefined;
  fetch?: typeof fetch;
  /** The clock for the key re-read cooldown (tests). */
  now?: () => number;
}): PrivyVerifier {
  const fetchImpl = config.fetch ?? fetch;
  let key: Promise<string> | undefined = config.verificationKey ? Promise.resolve(config.verificationKey) : undefined;

  const loadKey = () => {
    key ??= fetchImpl(`${PRIVY_AUTH_URL}/apps/${encodeURIComponent(config.appId)}`, { headers: { "privy-app-id": config.appId } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`privy app config ${response.status}`);
        const body = (await response.json()) as { verification_key?: unknown };
        if (typeof body.verification_key !== "string") throw new Error("privy app config has no verification key");
        return body.verification_key;
      })
      .catch((error: unknown) => {
        key = undefined;
        throw error;
      });
    return key;
  };

  let lastRefetch = 0;
  const now = config.now ?? Date.now;

  /**
   * Runs a check with the key. A failing check is a PrivyTokenError; a key that cannot be loaded is not (the caller
   * answers 502). A signature that fails against a fetched key re-reads the key once, if none was read in the last
   * minute (Privy rotated it).
   */
  const withKey = async <T>(check: (verificationKey: string) => Promise<T>, what: string): Promise<T> => {
    const first = await loadKey();
    const asTokenError = (error: unknown) => new PrivyTokenError(error instanceof Error ? error.message : `${what} invalid`);
    try {
      return await check(first);
    } catch (error) {
      const signature = error instanceof Error && SIGNATURE_FAILED.test(error.message);
      if (config.verificationKey || !signature || now() - lastRefetch < KEY_REFETCH_COOLDOWN_MS) throw asTokenError(error);
      lastRefetch = now();
      key = undefined;
      const second = await loadKey();
      if (second === first) throw asTokenError(error);
      try {
        return await check(second);
      } catch (retryError) {
        throw asTokenError(retryError);
      }
    }
  };

  const verifyAccess = async (accessToken: string) => {
    const claims = await withKey(
      (verification_key) => verifyAccessToken({ access_token: accessToken, app_id: config.appId, verification_key }),
      "access token",
    );
    return { userId: claims.user_id, sessionId: claims.session_id };
  };

  const fetchUser = async (userId: string): Promise<Pick<User, "linked_accounts">> => {
    if (!config.appSecret) throw new PrivyTokenError("no identity token, and no app secret to read the user");
    const response = await fetchImpl(`${PRIVY_API_URL}/users/${encodeURIComponent(userId)}`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString("base64")}`,
        "privy-app-id": config.appId,
      },
    });
    if (!response.ok) throw new Error(`privy user ${response.status}`);
    return (await response.json()) as User;
  };

  return {
    verifyAccess,
    async identify({ accessToken, identityToken }) {
      const access = await verifyAccess(accessToken);
      let user: Pick<User, "id" | "linked_accounts"> | Pick<User, "linked_accounts">;
      if (identityToken) {
        user = await withKey(
          (verification_key) => verifyIdentityToken({ identity_token: identityToken, app_id: config.appId, verification_key }),
          "identity token",
        );
        // Both tokens must be about the same person.
        if ("id" in user && user.id !== access.userId) throw new PrivyTokenError("the tokens name different users");
      } else {
        user = await fetchUser(access.userId);
      }
      return { ...access, ...readPrivyUser(user) };
    },
  };
}
