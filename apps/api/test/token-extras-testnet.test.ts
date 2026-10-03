// Token page extras on Arc testnet: the star (watchlist) and its Markets segment, profit and loss from the person's
// own trades (a real USDC → EURC swap, signed and witnessed), and the token's own Activity rows. Skipped without the
// server keys in the root .env. Run: pnpm --filter @kawase/api exec tsx --test test/token-extras-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { SwapApproveResponse, SwapIntent, TokenTradesView, WatchRow } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 60;
const RETRIES = 4;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "rejected"];
const SIX = 6;
const units = (value: string) => parseUnits(value, SIX);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("token extras: star, watchlist, trades P&L and the token's own activity", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "trader", email: `extras-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, undefined, appKitSwaps(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? units("0.02") : 0n;
      if (left > keep) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] }) });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "extras-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const auth = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity } }), 200, "setup");
  const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["1.3"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }
  const eurc = network.addresses.eurc;
  const tokenPath = `/tokens/${network.chainId}/${eurc}`;

  // The star: on, listed on the Watchlist (this network), off.
  await expectStatus(await call("POST", `${tokenPath}/watch`, { on: true }), 200, "star");
  const listed = ((await (await call("GET", "/markets/watchlist?network=testnet")).json()) as { rows: WatchRow[] }).rows;
  assert.equal(listed[0]?.token.address.toLowerCase(), eurc.toLowerCase());
  assert.equal(((await (await call("GET", `${tokenPath}/mine`)).json()) as { watched: boolean }).watched, true);

  // A trade: 1 USDC → EURC, signed and witnessed.
  let swap = ((await (await call("POST", "/swaps", { tokenIn: "USDC", tokenOut: eurc, amount: "1" })).json()) as { intent: SwapIntent }).intent;
  for (let attempt = 0; attempt < RETRIES && swap.blocking?.code === "QUOTE_UNAVAILABLE"; attempt++) {
    await wait(POLL_MS * RETRIES);
    swap = ((await (await call("PATCH", `/swaps/${swap.id}`, {})).json()) as { intent: SwapIntent }).intent;
  }
  assert.equal(swap.blocking, null, JSON.stringify(swap.results));
  let sign = (await (await call("POST", `/swaps/${swap.id}/approve`, { version: swap.version })).json()) as SwapApproveResponse;
  for (let attempt = 0; attempt < RETRIES && sign.status !== "sign"; attempt++) {
    await wait(POLL_MS);
    sign = (await (await call("POST", `/swaps/${swap.id}/approve`, { version: swap.version })).json()) as SwapApproveResponse;
  }
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  const t = sign.transaction;
  const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to as Hex, data: t.data as Hex, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
  await expectStatus(await call("POST", `/swaps/${swap.id}/signature`, { approvalId: sign.approvalId, signedTransaction: await wallet.signTransaction(unsigned) }), 200, "signature");
  let done: SwapIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.includes(done?.state ?? ""); attempt++) {
    await wait(POLL_MS);
    done = ((await (await call("GET", `/swaps/${swap.id}`)).json()) as { intent: SwapIntent }).intent;
  }
  assert.equal(done?.state, "completed", JSON.stringify(done));
  console.log("bought EURC", done?.received, done?.tx?.explorerUrl);

  // P&L from that trade: one buy, its cost (1 USDC), what is still held from it.
  const mine = (await (await call("GET", `${tokenPath}/mine`)).json()) as { watched: boolean; trades: TokenTradesView | null };
  assert.equal(mine.trades?.trades, 1);
  assert.equal(mine.trades?.bought, done?.received);
  assert.equal(mine.trades?.held, done?.received);
  assert.ok(Math.abs((mine.trades?.costBasisUsd ?? 0) - 1) < 1e-9, JSON.stringify(mine.trades));
  assert.equal(mine.trades?.realizedUsd, 0);

  // The token's own Activity: rows with EURC on one of their legs only.
  const feed = (await (await call("GET", `/activity?network=testnet&token=${eurc}`)).json()) as { items: { token: { address: string } | null; other: { token: { address: string } } | null }[] };
  assert.ok(feed.items.every((item) => [item.token?.address, item.other?.token.address].some((address) => address?.toLowerCase() === eurc.toLowerCase())));

  await expectStatus(await call("POST", `${tokenPath}/watch`, { on: false }), 200, "unstar");
  assert.equal(((await (await call("GET", "/markets/watchlist?network=testnet")).json()) as { rows: WatchRow[] }).rows.length, 0);
});
