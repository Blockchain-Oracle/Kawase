import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { createModels } from "@kawase/agent";
import { createDb, users, type Db } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { createApp, type App } from "../src/app";
import type { TurnkeyReader, TurnkeyUser } from "../src/auth/turnkey";
import type { FaucetDrip } from "../src/faucet/circle-faucet";
import type { OpsExecutor } from "../src/send/ops";
import type { Chains } from "../src/wallet/chain";
import { noBridges, type BridgeEngine } from "../src/bridge/engine";
import { noSwaps, type SwapEngine } from "../src/swap/engine";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const COMPRESSED_EVEN = "02";
const COMPRESSED_ODD = "03";

/** A P-256 key in Turnkey's formats: private key as 32-byte hex, public key compressed. */
export function turnkeyStyleKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x!, "base64url");
  const y = Buffer.from(jwk.y!, "base64url");
  const prefix = y[y.length - 1]! % 2 === 0 ? COMPRESSED_EVEN : COMPRESSED_ODD;
  return {
    privateKeyHex: Buffer.from(jwk.d!, "base64url").toString("hex"),
    publicKeyHex: prefix + x.toString("hex"),
    publicKey: publicKey as KeyObject,
  };
}

/** Signs a body the way the app's Turnkey session does. */
export async function stampBody(body: string, key: { privateKeyHex: string; publicKeyHex: string }) {
  const stamper = new ApiKeyStamper({ apiPublicKey: key.publicKeyHex, apiPrivateKey: key.privateKeyHex });
  const stamp = await stamper.stamp(body);
  return stamp.stampHeaderValue;
}

/** A Turnkey reader that answers from memory. */
export function fakeTurnkey(
  userRecords: Record<string, TurnkeyUser>,
  addresses: Record<string, { walletId: string; address: string }[]> = {},
): TurnkeyReader {
  return {
    getUser: async (organizationId, userId) => {
      const user = userRecords[`${organizationId}/${userId}`];
      return user ? user : undefined;
    },
    getWalletAddresses: async (organizationId) => addresses[organizationId] ?? [],
  };
}

export const noChains: Chains = { available: ["testnet"], get: () => undefined };

/** An ops wallet that refuses everything; tests that send pass Circle's. */
export const noOps: OpsExecutor = {
  execute: async () => {
    throw new Error("no ops wallet in this test");
  },
  get: async (_, id) => ({ id, state: "failed", txHash: undefined, error: "no ops wallet in this test" }),
};

/** A faucet that always sends; tests that care pass their own. */
export const okFaucet: FaucetDrip = async () => undefined;

export function testApp(
  turnkey: TurnkeyReader,
  chains: Chains = noChains,
  faucet: FaucetDrip = okFaucet,
  ops: OpsExecutor = noOps,
  swaps: SwapEngine = noSwaps,
  bridges: BridgeEngine = noBridges,
): { app: App; db: Db; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url, { poolSize: 2 });
  const TEST_LIMIT = 10_000;
  const app = createApp({
    db,
    log: createLogger({ service: "api-test", level: (process.env.TEST_LOG_LEVEL ?? "silent") as "silent" }),
    turnkey,
    chains,
    faucet,
    ops,
    swaps,
    bridges,
    models: createModels({}),
    rateLimitPerMinute: TEST_LIMIT,
    signInLimitPerMinute: TEST_LIMIT,
  });
  return { app, db, close: () => pool.end() };
}

export async function deleteUser(db: Db, id: string) {
  await db.delete(users).where(eq(users.id, id));
}

export const jsonRequest = (method: string, body: unknown, token?: string): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

/** Fails with the response body in the message, without consuming the body on success. */
export async function expectStatus(response: Response, status: number, what = "response") {
  if (response.status !== status)
    throw new Error(`${what}: expected ${status}, got ${response.status}: ${await response.clone().text()}`);
}
