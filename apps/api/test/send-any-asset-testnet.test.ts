// Sending any asset (R1) and the recipient check on every payment (R6), through the api on Arc testnet with a fresh
// local key standing in for the Turnkey wallet. EURC is named by its token address (the asset registry's path, as
// any token would be), signed by the wallet, and witnessed by its receipt. Then: a token contract as the recipient
// is refused, a look-alike of a saved contact is refused, and another Kawase user's bare 0x shows their @handle.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api exec tsx --test test/send-any-asset-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { SendApproveResponse, SendIntent } from "@kawase/api-client";
import { users, wallets } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired"];
const SIX = 6;
const units = (value: string) => parseUnits(value, SIX);
/** Keep the first and last four hex characters, change the middle: a look-alike of a saved address. */
const lookalikeOf = (address: string) => `0x${address.slice(2, 6)}${"7".repeat(32)}${address.slice(-4)}` as Hex;

test("any-asset sends and the recipient check on Arc testnet", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const dana = privateKeyToAccount(generatePrivateKey()).address;
  const kawaseFriend = privateKeyToAccount(generatePrivateKey()).address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "sender", email: `any-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let friendId = "";
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? units("0.02") : 0n;
      if (left > keep) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] }) });
    }
    if (userId) await deleteUser(db, userId);
    if (friendId) await deleteUser(db, friendId);
    await close();
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "any-asset-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );

  // Fund the wallet from the ops wallet: USDC for the fee, EURC to send.
  for (const [tokenAddress, amount] of [[network.addresses.usdc, "0.1"], [network.addresses.eurc, "0.2"]] as const) {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  // 1. EURC named by its address: the registry finds the token; the wallet signs; the receipt witnesses it.
  await expectStatus(await call("POST", "/contacts", { displayName: "Dana", address: dana }), 201, "contact");
  const send = ((await (await call("POST", "/sends", { recipient: "Dana", amount: "0.15", asset: network.addresses.eurc })).json()) as { intent: SendIntent }).intent;
  assert.equal(send.blocking, null, JSON.stringify(send.results));
  assert.equal(send.draft?.asset, "EURC");
  assert.equal(send.draft?.token?.decimals, SIX);
  assert.equal(send.route, "wallet_signature", "the allowance covers USDC only");
  const sign = (await (await call("POST", `/sends/${send.id}/approve`, { version: send.version })).json()) as SendApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  const t = sign.transaction;
  const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
  await expectStatus(await call("POST", `/sends/${send.id}/signature`, { approvalId: sign.approvalId, signedTransaction: await wallet.signTransaction(unsigned) }), 200, "signature");
  let done: SendIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.includes(done?.state ?? ""); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    done = ((await (await call("GET", `/sends/${send.id}`)).json()) as { intent: SendIntent }).intent;
  }
  assert.equal(done?.state, "completed", JSON.stringify(done));
  assert.equal(await client.readContract({ address: network.addresses.eurc, abi: erc20Abi, functionName: "balanceOf", args: [dana] }), units("0.15"));
  console.log("EURC by address", done?.tx?.explorerUrl);

  // 2. R6: a token contract as the recipient is a hard stop.
  const toToken = ((await (await call("POST", "/sends", { recipient: network.addresses.usdc, amount: "0.01" })).json()) as { intent: SendIntent }).intent;
  assert.equal(toToken.blocking?.code, "RECIPIENT_TOKEN_CONTRACT", JSON.stringify(toToken.results));
  assert.equal(toToken.draft?.recipient.contract ?? "token", "token");

  // 3. R6: a look-alike of a saved contact is a hard stop.
  const fake = lookalikeOf(dana);
  const toFake = ((await (await call("POST", "/sends", { recipient: fake, amount: "0.01" })).json()) as { intent: SendIntent }).intent;
  assert.equal(toFake.blocking?.code, "LOOKALIKE_ADDRESS", JSON.stringify(toFake.results));

  // 4. R6: another Kawase user's bare address shows their @handle.
  const handle = `friend${Date.now() % 1_000_000}`;
  const [friend] = await db.insert(users).values({ isAnonymous: false, email: `${handle}@example.test`, handle }).returning();
  friendId = friend!.id;
  await db.insert(wallets).values({ userId: friendId, role: "user", status: "active", address: kawaseFriend, custody: "turnkey" } as never);
  const toFriend = ((await (await call("POST", "/sends", { recipient: kawaseFriend, amount: "0.01", asset: "USDC" })).json()) as { intent: SendIntent }).intent;
  assert.equal(toFriend.draft?.recipient.handle, handle, JSON.stringify(toFriend.draft?.recipient));
  for (const id of [toToken.id, toFake.id, toFriend.id]) await call("POST", `/sends/${id}/cancel`);
});
