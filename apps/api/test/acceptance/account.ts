// The acceptance account: a real Kawase account, made the way the app makes one (a Turnkey sub-organization with an
// Ethereum wallet) but with a P-256 API key the runner holds instead of a passkey session. The parent organization's
// key (root .env) creates it once; its details live in a file outside the repo (mode 0600) so every run, from any
// checkout, is the same person with the same address. Each run exports the wallet's seed into memory and signs locally,
// so it uses none of the organization's Turnkey signing quota. Keys and the seed are never written to the repo or printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { TurnkeyClient } from "@turnkey/http";
import { toHex, type Address, type Hex } from "viem";
import { decryptExportBundle, generateP256KeyPair } from "@turnkey/crypto";
import { generatePrivateKey, mnemonicToAccount } from "viem/accounts";

import { localKeySigner, type WalletSigner } from "@kawase/wallet";

import { stampBody, turnkeyStyleKeyPair } from "../helpers";

export type AcceptanceAccount = {
  subOrganizationId: string;
  userId: string;
  walletId: string;
  /** The person's wallet (account 0): what the app registers. */
  address: Address;
  /** Account 1 of the same wallet: a "friend on Base" the run can send to and still recover. */
  friendAddress: Address;
  apiKey: { publicKeyHex: string; privateKeyHex: string };
  createdAt: string;
};

const ACTIVITY_DONE = "ACTIVITY_STATUS_COMPLETED";
const ACTIVITY_FAILED = new Set(["ACTIVITY_STATUS_FAILED", "ACTIVITY_STATUS_REJECTED"]);
const POLL_MS = 1_000;
const POLL_TRIES = 30;
const FILE_MODE = 0o600;
const RUNNER_USER_NAME = "Kawase acceptance";
const ETHEREUM_ACCOUNT = (index: number) => ({
  curve: "CURVE_SECP256K1" as const,
  pathFormat: "PATH_FORMAT_BIP32" as const,
  path: `m/44'/60'/0'/0/${index}`,
  addressFormat: "ADDRESS_FORMAT_ETHEREUM" as const,
});

type Activity = { id: string; status: string; result?: Record<string, unknown>; failure?: { message?: string } };

async function settle(client: TurnkeyClient, organizationId: string, first: { activity: Activity }): Promise<Activity> {
  let activity = first.activity;
  for (let i = 0; i < POLL_TRIES && activity.status !== ACTIVITY_DONE; i++) {
    if (ACTIVITY_FAILED.has(activity.status)) throw new Error(`Turnkey activity ${activity.id} ${activity.status}: ${activity.failure?.message ?? ""}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    activity = (await client.getActivity({ organizationId, activityId: activity.id })).activity as Activity;
  }
  if (activity.status !== ACTIVITY_DONE) throw new Error(`Turnkey activity ${activity.id} stuck in ${activity.status}`);
  return activity;
}

/** Reads the account file, or creates the sub-organization once and writes it. */
export async function loadOrCreateAccount(file: string, parent: { baseUrl: string; organizationId: string; apiPublicKey: string; apiPrivateKey: string }): Promise<{ account: AcceptanceAccount; created: boolean }> {
  if (existsSync(file)) return { account: JSON.parse(readFileSync(file, "utf8")) as AcceptanceAccount, created: false };
  const client = new TurnkeyClient({ baseUrl: parent.baseUrl }, new ApiKeyStamper({ apiPublicKey: parent.apiPublicKey, apiPrivateKey: parent.apiPrivateKey }));
  const key = turnkeyStyleKeyPair();
  const stamp = new Date().toISOString().slice(0, 10);
  const response = await client.createSubOrganization({
    type: "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V8",
    timestampMs: String(Date.now()),
    organizationId: parent.organizationId,
    parameters: {
      subOrganizationName: `kawase-acceptance-${stamp}`,
      rootUsers: [{ userName: RUNNER_USER_NAME, apiKeys: [{ apiKeyName: "acceptance-runner", publicKey: key.publicKeyHex, curveType: "API_KEY_CURVE_P256" }], authenticators: [], oauthProviders: [] }],
      rootQuorumThreshold: 1,
      wallet: { walletName: "Default wallet", accounts: [ETHEREUM_ACCOUNT(0), ETHEREUM_ACCOUNT(1)] },
    },
  });
  const activity = await settle(client, parent.organizationId, response as { activity: Activity });
  const result = activity.result?.createSubOrganizationResultV8 as { subOrganizationId: string; wallet?: { walletId: string; addresses: string[] }; rootUserIds?: string[] } | undefined;
  if (!result?.wallet || !result.rootUserIds?.[0]) throw new Error("Turnkey created the sub-organization without a wallet or user");
  const account: AcceptanceAccount = {
    subOrganizationId: result.subOrganizationId,
    userId: result.rootUserIds[0],
    walletId: result.wallet.walletId,
    address: result.wallet.addresses[0] as Address,
    friendAddress: result.wallet.addresses[1] as Address,
    apiKey: { publicKeyHex: key.publicKeyHex, privateKeyHex: key.privateKeyHex },
    createdAt: new Date().toISOString(),
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(account, null, 2), { mode: FILE_MODE });
  return { account, created: true };
}

/**
 * The acceptance wallet's signers, from its seed exported for this run only: encrypted by Turnkey to a throwaway P-256
 * key, decrypted here and held in memory, never written or printed. Every signature is then made locally, so a run
 * uses none of the organization's Turnkey signing quota (export is not a signing activity), and it is still the very
 * wallet the api reads from the sub-organization. Only the runner's own throwaway account can be exported: the call is
 * stamped with the key the runner made the sub-organization with, and its root user must be the runner's.
 */
export async function exportedSigners(account: AcceptanceAccount, baseUrl: string): Promise<{ signer: WalletSigner; friendSigner: WalletSigner }> {
  const client = new TurnkeyClient({ baseUrl }, new ApiKeyStamper({ apiPublicKey: account.apiKey.publicKeyHex, apiPrivateKey: account.apiKey.privateKeyHex }));
  const { user } = await client.getUser({ organizationId: account.subOrganizationId, userId: account.userId });
  if (user.userName !== RUNNER_USER_NAME) throw new Error("not the runner's own acceptance account: refusing to export");
  const target = generateP256KeyPair();
  const response = await client.exportWallet({
    type: "ACTIVITY_TYPE_EXPORT_WALLET",
    timestampMs: String(Date.now()),
    organizationId: account.subOrganizationId,
    parameters: { walletId: account.walletId, targetPublicKey: target.publicKeyUncompressed },
  });
  const activity = await settle(client, account.subOrganizationId, response as { activity: Activity });
  const bundle = (activity.result?.exportWalletResult as { exportBundle: string } | undefined)?.exportBundle;
  if (!bundle) throw new Error("Turnkey returned no export bundle");
  const mnemonic = await decryptExportBundle({ exportBundle: bundle, embeddedKey: target.privateKey, organizationId: account.subOrganizationId, returnMnemonic: true });
  // The app's derivation path (m/44'/60'/0'/0/i), as plain local keys: the same signer shape tests use.
  const at = (addressIndex: number) => localKeySigner(toHex(mnemonicToAccount(mnemonic, { addressIndex }).getHdKey().privateKey!));
  const signers = { signer: at(0), friendSigner: at(1) };
  if (signers.signer.address.toLowerCase() !== account.address.toLowerCase() || signers.friendSigner.address.toLowerCase() !== account.friendAddress.toLowerCase())
    throw new Error("the exported seed does not derive the wallet's addresses");
  return signers;
}

export type StandIn = { address: Address; friendAddress: Address; signer: WalletSigner; friendSigner: WalletSigner };

/**
 * For a dry run when Turnkey will not sign: two local keys standing in for the wallet's accounts 0 and 1 (kept in the
 * state directory so a resumed dry run is the same wallet). Everything the api checks still holds: the stand-in
 * address is what the api's Turnkey read returns for the account, and every signature recovers to it.
 */
export function localStandIn(file: string): StandIn {
  const keys = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { main: Hex; friend: Hex }) : { main: generatePrivateKey(), friend: generatePrivateKey() };
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(keys), { mode: FILE_MODE });
  }
  const signer = localKeySigner(keys.main);
  const friendSigner = localKeySigner(keys.friend);
  return { address: signer.address, friendAddress: friendSigner.address, signer, friendSigner };
}

/** The sign-in proof the app sends: the api's nonce stamped by the session key. */
export async function signInProof(account: AcceptanceAccount, nonce: string) {
  const body = JSON.stringify({ organizationId: account.subOrganizationId, activityId: nonce });
  return { body, stamp: await stampBody(body, account.apiKey) };
}
