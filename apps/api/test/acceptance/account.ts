// The acceptance account: a real Kawase account made the way the app makes one, a Privy user (D41) with its embedded
// Ethereum wallet. The runner signs in to the web app as the Privy app's test account (dashboard → User management →
// Authentication → Advanced → "Enable test accounts"; docs.privy.io "Using test accounts"), so the first sign-in has
// made the wallet, and hands this run that session's tokens (ACCEPTANCE_PRIVY_ACCESS_TOKEN and
// ACCEPTANCE_PRIVY_IDENTITY_TOKEN). The live run signs in through the deployed api with them, exactly as the app does,
// and every signature is the person's own Privy wallet's, asked of Privy's server API with the user's JWT as the
// authorization (`authorization_context.user_jwts`, docs.privy.io "Signing on the server"). The "friend on Base" is a
// local key the runner keeps in the account file (mode 0600, outside the repo), so money sent to it can come back.
// A dry run needs none of this: local keys stand in for the wallet, and the in-process api trusts a test Privy key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PrivyClient } from "@privy-io/node";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { localKeySigner, privySigner, type WalletSigner } from "@kawase/wallet";

import type { PrivyVerifier } from "../../src/auth/privy";
import { privyPerson, type PrivyPerson } from "../helpers";

export type AcceptanceAccount = {
  /** The Privy user (a DID). */
  did: string;
  email: string | undefined;
  /** The embedded wallet's Privy id: what server-side signing names. */
  walletId: string;
  /** The person's wallet: what the app registers. */
  address: Address;
  /** A key the runner holds: a "friend on Base" the run can send to and still recover. */
  friendAddress: Address;
  friendKey: Hex;
  createdAt: string;
};

/** Who the run acts as: the wallet the steps read and sign for, and the friend it sends to. */
export type RunAccount = Pick<AcceptanceAccount, "address" | "friendAddress">;

/** The Privy session the runner signed in with (the web app's own tokens, about an hour of life). */
export type PrivySession = { accessToken: string; identityToken: string };

const FILE_MODE = 0o600;

export function sessionFromEnv(): PrivySession | undefined {
  const accessToken = process.env.ACCEPTANCE_PRIVY_ACCESS_TOKEN;
  const identityToken = process.env.ACCEPTANCE_PRIVY_IDENTITY_TOKEN;
  return accessToken && identityToken ? { accessToken, identityToken } : undefined;
}

/** The account this session belongs to: the Privy user and wallet, and the runner's friend key (kept in the file). */
export async function loadAccount(file: string, session: PrivySession, privy: PrivyVerifier): Promise<{ account: AcceptanceAccount; created: boolean }> {
  const identity = await privy.identify(session);
  if (!identity.wallet?.walletId) throw new Error("the Privy test account has no embedded wallet yet: sign in once in the web app so it makes one");
  const kept = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as AcceptanceAccount) : undefined;
  if (kept && kept.did !== identity.userId) throw new Error(`this session is another Privy user than the acceptance account in ${file}`);
  const friendKey = kept?.friendKey ?? generatePrivateKey();
  const account: AcceptanceAccount = {
    did: identity.userId,
    email: identity.email,
    walletId: identity.wallet.walletId,
    address: identity.wallet.address,
    friendAddress: privateKeyToAccount(friendKey).address,
    friendKey,
    createdAt: kept?.createdAt ?? new Date().toISOString(),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(account, null, 2), { mode: FILE_MODE });
  return { account, created: !kept };
}

/**
 * The person's own Privy wallet, signing raw digests through Privy's server API on the user's JWT (the same adapter
 * the app uses, packages/wallet/src/privy.ts), and the friend's local key.
 */
export function privySigners(account: AcceptanceAccount, session: PrivySession, client: PrivyClient): { signer: WalletSigner; friendSigner: WalletSigner } {
  const signer = privySigner({
    address: account.address,
    async signHash(hash) {
      const result = await client.wallets().ethereum().signSecp256k1(account.walletId, {
        params: { hash },
        authorization_context: { user_jwts: [session.accessToken] },
      });
      return result.signature as Hex;
    },
  });
  return { signer, friendSigner: localKeySigner(account.friendKey) };
}

export type StandIn = { person: PrivyPerson; address: Address; friendAddress: Address; signer: WalletSigner; friendSigner: WalletSigner };

/**
 * For a dry run: two local keys standing in for the wallet and the friend, and a test Privy identity naming that wallet
 * (kept in the state directory, so a resumed dry run is the same person). Everything the api checks still holds: the
 * in-process api trusts the test Privy key, registers the stand-in address from the identity token, and every
 * signature recovers to it.
 */
export function localStandIn(file: string): StandIn {
  type Kept = { main: Hex; friend: Hex; person?: PrivyPerson };
  const kept = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Kept) : { main: generatePrivateKey(), friend: generatePrivateKey() };
  const signer = localKeySigner(kept.main);
  const friendSigner = localKeySigner(kept.friend);
  const person = kept.person ?? privyPerson(`acceptance-dry-${signer.address.slice(2, 10).toLowerCase()}@example.test`, signer.address);
  if (!kept.person) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...kept, person }), { mode: FILE_MODE });
  }
  return { person, address: signer.address, friendAddress: friendSigner.address, signer, friendSigner };
}
