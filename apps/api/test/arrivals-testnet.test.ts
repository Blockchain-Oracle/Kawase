// Any token that arrives is news unless it is spam (R1; money-in.md "Receive any token"): on Arc testnet a fresh
// ERC-20 (unverified, no price) sent to a Kawase wallet stays silent — it goes to Hidden, no inbox item, no push —
// and once the person shows that token, the next arrival becomes a "Received" inbox item in its own symbol and
// decimals, named from the sender. Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/arrivals-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { createDb, inboxItems, indexerCursors } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { IncomingWatcher } from "../src/incoming/watcher";
import { InboxService } from "../src/inbox/service";
import { noMarketData } from "../src/market/sources";
import { RequestService } from "../src/requests/service";
import { AssetService } from "../src/tokens/service";
import { WalletService } from "../src/wallet/service";
import { createChains } from "../src/wallet/chain";
import { TEST_TOKEN_ABI, TEST_TOKEN_BYTECODE } from "./fixtures/arrival-token";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.DATABASE_URL);
const TICKS = 30;
const TICK_MS = 2000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("any token arriving: spam stays silent, a shown token becomes an inbox item", { skip: !live, timeout: 300_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const deployer = privateKeyToAccount(env.RELAYER_PRIVATE_KEY_TESTNET as Hex);
  const signer = createWalletClient({ account: deployer, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "arrivals", email: `arrivals-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains);
  const watcherDb = createDb(process.env.DATABASE_URL!, { poolSize: 2 });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await watcherDb.pool.end();
    await close();
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "arrivals-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");

  // A fresh token nobody lists (unverified, no price).
  const symbol = `KWT${Date.now() % 10_000}`;
  const deployHash = await signer.deployContract({ abi: TEST_TOKEN_ABI, bytecode: TEST_TOKEN_BYTECODE, args: ["Kawase Test", symbol, parseUnits("1000", 18)] });
  const tokenAddress = (await client.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;
  console.log("test token", tokenAddress);

  // The live watcher starts near the head (the test database only).
  await watcherDb.db.delete(indexerCursors).where(and(eq(indexerCursors.network, "testnet"), eq(indexerCursors.stream, "incoming_transfers")));
  const inbox = new InboxService(watcherDb.db, chains);
  const wallets = new WalletService(watcherDb.db, chains);
  const assets = new AssetService(watcherDb.db, chains, wallets, noMarketData, createLogger({ service: "assets", level: "silent" }));
  const watcher = new IncomingWatcher(watcherDb.db, chains, new RequestService(watcherDb.db, chains, wallets, inbox, "http://localhost:8081"), inbox, createLogger({ service: "watch", level: "silent" }), {
    backfill: false,
    notice: (owner, net, address, amount) => assets.arrivalNotice(owner, net, address, amount),
  });
  const received = () => watcherDb.db.select().from(inboxItems).where(and(eq(inboxItems.userId, userId), eq(inboxItems.kind, "payment_received")));
  const send = async (amount: string) => {
    const hash = await signer.writeContract({ address: tokenAddress, abi: TEST_TOKEN_ABI, functionName: "transfer", args: [wallet.address, parseUnits(amount, 18)] });
    return client.waitForTransactionReceipt({ hash });
  };
  const watchUntil = async (done: () => Promise<boolean>) => {
    for (let tick = 0; tick < TICKS; tick++) {
      await watcher.tick();
      if (await done()) return true;
      await wait(TICK_MS);
    }
    return false;
  };

  // 1. Spam stays silent: the token is recorded (it shows in Hidden), nothing is announced.
  const first = await send("5");
  const seen = await watchUntil(async () => {
    const head = await client.getBlockNumber();
    const [cursor] = await watcherDb.db.select().from(indexerCursors).where(and(eq(indexerCursors.network, "testnet"), eq(indexerCursors.stream, "incoming_transfers")));
    return Boolean(cursor && cursor.lastBlock >= first.blockNumber && head > first.blockNumber);
  });
  assert.ok(seen, "the watcher passed the first transfer");
  assert.equal((await received()).length, 0, "an unverified, unpriced token is not announced");

  // 2. The person shows that token: the next arrival is news, in its own symbol and decimals.
  await expectStatus(await call("POST", "/portfolio/visibility", { address: tokenAddress, visibility: "shown" }), 200, "show the token");
  await send("7");
  const announced = await watchUntil(async () => (await received()).length > 0);
  assert.ok(announced, "the shown token's arrival became an inbox item");
  const [item] = await received();
  const params = item!.params as Record<string, string>;
  assert.equal(params.asset, symbol);
  assert.equal(params.decimals, "18");
  assert.equal(params.amount, parseUnits("7", 18).toString());
  assert.equal(params.token, tokenAddress.toLowerCase());
  console.log("announced", params.asset, params.amount);
});
