import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import type { Address, Hex, LocalAccount, TypedDataDefinition } from "viem";

import { createModels } from "@kawase/agent";
import type { RevokeRequest } from "@kawase/api-client";
import { createDb, users, type Db } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { createApp, type App, type AppDeps } from "../src/app";
import { createPrivyVerifier } from "../src/auth/privy";
import type { FaucetDrip } from "../src/faucet/circle-faucet";
import type { OpsExecutor } from "../src/send/ops";
import type { Chains } from "../src/wallet/chain";
import { noBridges, type BridgeEngine } from "../src/bridge/engine";
import { noEarn, type EarnEngine } from "../src/earn/engine";
import { noSwaps, type SwapEngine } from "../src/swap/engine";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

/**
 * Privy sign-in in tests (D41): tokens in Privy's exact format (ES256, issuer privy.io, audience the app id, `sub` and
 * `sid`; the identity token's `linked_accounts` as Privy encodes it), signed with a key only the test app trusts and
 * checked by @privy-io/node like real ones, so no live Privy session is needed.
 */
export const PRIVY_TEST_APP_ID = "kawase-test";
const privyKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
export const testPrivy = createPrivyVerifier({
  appId: PRIVY_TEST_APP_ID,
  verificationKey: privyKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
});
const TOKEN_LIFE_S = 3600;
const MS_PER_S = 1000;
const LINKED_AT = 1791000000;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function privyJwt(payload: Record<string, unknown>, key: KeyObject = privyKeys.privateKey) {
  const now = Math.floor(Date.now() / MS_PER_S);
  const body = `${b64({ alg: "ES256", typ: "JWT" })}.${b64({ iss: "privy.io", aud: PRIVY_TEST_APP_ID, iat: now, exp: now + TOKEN_LIFE_S, ...payload })}`;
  const signature = sign("sha256", Buffer.from(body), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${body}.${signature}`;
}

/** A Privy user: their DID, the session on one device, a verified email, and the embedded wallet (once it exists). */
export type PrivyPerson = { did: string; session: string; email?: string | undefined; wallet?: string | undefined };

export const privyPerson = (email?: string, wallet?: string): PrivyPerson => ({
  did: `did:privy:${randomUUID()}`,
  session: randomUUID(),
  ...(email ? { email } : {}),
  ...(wallet ? { wallet } : {}),
});

/**
 * The access and identity tokens Privy's SDK hands the app for this person on one device (each device has its own
 * Privy session, as in life); another key forges them.
 */
export function privyTokens(person: PrivyPerson, options: { key?: KeyObject; device?: string } = {}) {
  const { key, device } = options;
  const session = device ? `${person.session}:${device}` : person.session;
  return {
    accessToken: privyJwt({ sub: person.did, sid: session }, key),
    identityToken: privyJwt(
      {
        sub: person.did,
        sid: session,
        cr: String(LINKED_AT),
        linked_accounts: JSON.stringify([
          ...(person.email ? [{ type: "email", address: person.email, lv: LINKED_AT }] : []),
          ...(person.wallet
            ? [{ type: "wallet", wallet_client_type: "privy", id: `wallet-${person.did}`, address: person.wallet, chain_type: "ethereum", lv: LINKED_AT }]
            : []),
        ]),
      },
      key,
    ),
  };
}

type TestDevice = { platform: string; installationId: string; appVersion?: string; locale?: string };

/** Signs the person in over the api (or upgrades the guest whose token is passed); their wallet registers in the same step. */
export function privySignIn(app: App, person: PrivyPerson, device: TestDevice, guestToken?: string) {
  return app.request("/auth/privy", jsonRequest("POST", { ...privyTokens(person, { device: device.installationId }), device }, guestToken));
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
  chains: Chains = noChains,
  faucet: FaucetDrip = okFaucet,
  ops: OpsExecutor = noOps,
  swaps: SwapEngine = noSwaps,
  bridges: BridgeEngine = noBridges,
  earn: EarnEngine = noEarn,
  options: {
    automationTickMs?: number;
    reconcileIntervalMs?: number;
    agentWallets?: AppDeps["agentWallets"];
    discovery?: AppDeps["discovery"];
    onramp?: AppDeps["onramp"];
    /** Where Kawase's buy page is served (order page links); none by default. */
    onrampPageUrl?: string | undefined;
    alchemyApiKey?: string | undefined;
    /** Live market data (prices, FX); none by default. */
    market?: AppDeps["market"];
    /** Real models for a live agent round trip (none by default: the chat answers "unavailable"). */
    models?: AppDeps["models"];
    /** Allowance sends and account deletion need the device's proof (M12). */
    deviceProofRequired?: boolean;
    /** Where emails go (approval codes, notices); none by default. */
    email?: AppDeps["email"];
  } = {},
): { app: App; db: Db; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url, { poolSize: 2 });
  const TEST_LIMIT = 10_000;
  const app = createApp({
    db,
    log: createLogger({ service: "api-test", level: (process.env.TEST_LOG_LEVEL ?? "silent") as "silent" }),
    privy: testPrivy,
    chains,
    faucet,
    ops,
    swaps,
    bridges,
    earn,
    ...options,
    models: options.models ?? createModels({}),
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

/**
 * What a local wallet signs for an on-chain revoke: the relayed batch's one-time delegation (Kawase's relayer pays), or
 * the transaction the wallet sends itself. Post it to /wallet/transactions/submit, or with the change it belongs to.
 */
export async function signRevokeRequest(wallet: LocalAccount, request: RevokeRequest): Promise<{ requestId: string; signed: Hex }> {
  if ("relayed" in request) return { requestId: request.requestId, signed: await wallet.signTypedData(request.typedData as unknown as TypedDataDefinition) };
  const t = request.transaction;
  const signed = await wallet.signTransaction!({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  return { requestId: request.requestId, signed };
}

/** The body /wallet/transactions/submit takes for a signed revoke. */
export const revokeSubmitBody = (request: RevokeRequest, signed: { requestId: string; signed: Hex }) =>
  "relayed" in request ? { requestId: signed.requestId, signature: signed.signed } : { requestId: signed.requestId, signedTransaction: signed.signed };
