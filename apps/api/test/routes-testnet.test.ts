// The Routes lane's Stage 3 acceptance on Arc testnet, through the api exactly as the new tickets drive it, with a fresh
// local key standing in for the person's wallet:
// 1. Swap: the ticket creates a swap, the person taps a venue on the RouteList (PATCH { venue }), and the version that
//    is signed is priced and built by that venue (Circle App Kit, the one venue on testnet). One transaction; the
//    receipt shows at least the minimum arrived.
// 2. Move: the move ticket's request (direction out, a chain from the grid, the amount, the CCTP row picked) becomes
//    one signed transaction on Arc (approve + burn) that Circle's forwarder mints on Base Sepolia.
// Prints both transaction hashes. Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/routes-testnet.test.ts (DATABASE_URL may point at a scratch db).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type PrivateKeyAccount, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import type { CrossChainApproveResponse, CrossChainIntent, SwapApproveResponse, SwapIntent, UnsignedTransaction } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
import { circleFaucet } from "../src/faucet/circle-faucet";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 200;
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const KEEP = "0.02";
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const unsignedOf = (t: UnsignedTransaction): TransactionSerializable => ({
  type: "eip1559",
  chainId: t.chainId,
  nonce: t.nonce,
  to: t.to,
  data: t.data,
  value: BigInt(t.value),
  gas: BigInt(t.gas),
  maxFeePerGas: BigInt(t.maxFeePerGas),
  maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
});

test("routes on Arc testnet: a swap through the picked venue and a CCTP move from the move ticket", { skip: !live, timeout: 1_200_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const base = createPublicClient({ chain: baseSepolia, transport: http() });
  const wallet: PrivateKeyAccount = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "router", email: `routes-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, undefined, appKitSwaps(env), appKitBridges(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    // What is left goes back to the ops wallet (a little USDC stays for the gas of the transfers themselves).
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? usdc(KEEP) : 0n;
      if (left > keep) {
        const hash = await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] });
        await client.waitForTransactionReceipt({ hash });
      }
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "routes-test-phone-01" } }));
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
  // Funding: Circle's testnet faucet (20 USDC + 20 EURC to this fresh address); the ops wallet only when the faucet
  // refuses. Waits until the USDC is on chain.
  try {
    await circleFaucet(env.CIRCLE_TEST_API_KEY)({ network, address: wallet.address });
  } catch (error) {
    console.log(JSON.stringify({ step: "faucet", refused: String(error) }));
    await circle.createTransaction({
      walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
      blockchain: network.circleBlockchain,
      tokenAddress: network.addresses.usdc,
      destinationAddress: wallet.address,
      amount: ["1.2"],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    });
  }
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const held = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    if (held >= usdc("1")) break;
    await wait(POLL_MS);
  }

  // ── 1. Swap through the picked venue ──────────────────────────────────────────────────────────────────────────
  const created = ((await (await call("POST", "/swaps", { tokenIn: network.addresses.usdc, tokenOut: network.addresses.eurc, amount: "0.3" })).json()) as { intent: SwapIntent }).intent;
  assert.equal(created.blocking, null, JSON.stringify(created.results));
  // The RouteList row the person taps: a new version priced by that venue.
  const picked = ((await (await call("PATCH", `/swaps/${created.id}`, { venue: "app_kit" })).json()) as { intent: SwapIntent }).intent;
  assert.equal(picked.request.venue, "app_kit", "the pick is kept on the request");
  assert.equal(picked.draft?.venue, "app_kit", "the version is priced by the picked venue");
  assert.ok((picked.draft?.routes ?? []).some((route) => route.venue === "app_kit" && route.status === "chosen"), "the RouteList shows the pick as chosen");
  const swapSign = (await (await call("POST", `/swaps/${picked.id}/approve`, { version: picked.version })).json()) as SwapApproveResponse;
  assert.equal(swapSign.status, "sign", JSON.stringify(swapSign));
  if (swapSign.status !== "sign") return;
  assert.equal(swapSign.transaction.to.toLowerCase(), wallet.address.toLowerCase(), "one batch from the wallet to itself");
  await expectStatus(await call("POST", `/swaps/${picked.id}/signature`, { approvalId: swapSign.approvalId, signedTransaction: await wallet.signTransaction(unsignedOf(swapSign.transaction)) }), 200, "swap signature");
  let swapped = picked;
  for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(swapped.state); i++) {
    await wait(POLL_MS);
    swapped = ((await (await call("GET", `/swaps/${picked.id}`)).json()) as { intent: SwapIntent }).intent;
  }
  assert.equal(swapped.state, "completed", JSON.stringify(swapped));
  assert.ok(swapped.received && BigInt(swapped.received) >= BigInt(picked.draft!.minOut), "at least the minimum arrived");
  console.log(JSON.stringify({ step: "swap", venue: swapped.draft?.venue, tx: swapped.tx?.hash, explorer: swapped.tx?.explorerUrl, paid: picked.draft?.amountIn, received: swapped.received, minOut: picked.draft?.minOut }));

  // ── 2. A CCTP move from the move ticket ───────────────────────────────────────────────────────────────────────
  const order = ((await (await call("POST", "/crosschain/orders", { direction: "out", destination: "base", asset: "USDC", amount: "0.5", recipient: null })).json()) as { intent: CrossChainIntent }).intent;
  assert.ok(order.draft, JSON.stringify(order.results));
  // The CCTP row on the RouteList, picked (on testnet it is also the only executable bridge).
  const move = order.draft!.chosen === "cctp" ? order : ((await (await call("PATCH", `/crosschain/orders/${order.id}`, { route: "cctp" })).json()) as { intent: CrossChainIntent }).intent;
  assert.equal(move.draft?.chosen, "cctp");
  assert.equal(move.blocking, null, JSON.stringify(move.results));
  const moveSign = (await (await call("POST", `/crosschain/orders/${move.id}/approve`, { version: move.version })).json()) as CrossChainApproveResponse;
  assert.equal(moveSign.status, "sign", JSON.stringify(moveSign));
  if (moveSign.status !== "sign") return;
  const before = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  await expectStatus(await call("POST", `/crosschain/orders/${move.id}/signature`, { approvalId: moveSign.approvalId, signedTransaction: await wallet.signTransaction(unsignedOf(moveSign.transaction)) }), 200, "move signature");
  let moved = move;
  for (let i = 0; i < POLL_ATTEMPTS && !["delivered", "refunded", "failed"].includes(moved.stage); i++) {
    await wait(POLL_MS);
    moved = ((await (await call("GET", `/crosschain/orders/${move.id}`)).json()) as { intent: CrossChainIntent }).intent;
  }
  console.log(JSON.stringify({ step: "move", route: moved.draft?.chosen, stage: moved.stage, tx: moved.tx?.hash, explorer: moved.tx?.explorerUrl, fillTx: moved.fillTx?.hash, fillExplorer: moved.fillTx?.explorerUrl, received: moved.received }));
  assert.ok(moved.tx?.hash, "the burn left Arc");
  assert.equal(moved.stage, "delivered", JSON.stringify({ stage: moved.stage, state: moved.state, outcome: moved.outcome }));
  const afterBalance = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  assert.ok(afterBalance - before >= BigInt(move.draft!.minReceived), "at least the minimum arrived on Base Sepolia");
});
