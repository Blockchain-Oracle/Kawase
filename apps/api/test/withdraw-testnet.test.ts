// Withdraw (money-out.md, G7) on Arc testnet, end to end through the api with a fresh local key standing in for the
// Turnkey wallet: the plan (EURC as cash + USDC to my own wallet on Base Sepolia → convert, then bridge), exchanges
// refused on testnet with their reason, "everything" to an Arc address, then the legs the app runs after one Face
// ID: the EURC → USDC swap, signed and witnessed, and the USDC bridge (one signed batch, Circle's CCTP) delivered on
// Base Sepolia; the destination is saved as a place. Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/withdraw-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import type { CrossChainApproveResponse, CrossChainIntent, PlaceView, SwapApproveResponse, SwapIntent, UnsignedTransaction, WithdrawPlanView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 200;
const RETRIES = 4;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "rejected"];
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const SIX = 6;
const units = (value: string) => parseUnits(value, SIX);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const serializable = (t: UnsignedTransaction): TransactionSerializable => ({
  type: "eip1559",
  chainId: t.chainId,
  nonce: t.nonce,
  to: t.to as Hex,
  data: t.data as Hex,
  value: BigInt(t.value),
  gas: BigInt(t.gas),
  maxFeePerGas: BigInt(t.maxFeePerGas),
  maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
});

test("withdraw on Arc testnet: plan, convert, bridge to my wallet on Base Sepolia, saved as a place", { skip: !live, timeout: 1_200_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const base = createPublicClient({ chain: baseSepolia, transport: http() });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const otherWallet = privateKeyToAccount(generatePrivateKey()).address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "withdrawer", email: `withdraw-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, undefined, appKitSwaps(env), appKitBridges(env));
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
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "withdraw-phone-0001" } }));
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

  for (const [tokenAddress, amount] of [[network.addresses.usdc, "1.3"], [network.addresses.eurc, "1"]] as const) {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }

  // 1. Exchanges are mainnet only, with the reason; the table is still listed.
  const exchanges = (await (await call("GET", "/withdrawals/exchanges")).json()) as { exchanges: { slug: string; unavailable: string | null; chain: { key: string } }[] };
  assert.equal(exchanges.exchanges.find((entry) => entry.slug === "kraken")?.unavailable, "mainnet_only");
  assert.equal(exchanges.exchanges.find((entry) => entry.slug === "coinbase")?.chain.key, "base");
  const toKraken = ((await (await call("POST", "/withdrawals/plan", { assets: [{ asset: "USDC", amount: "0.1" }], exchange: "Kraken" })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(toKraken.blocking, "exchange_mainnet_only");

  // 2. Everything to an Arc address: each line as itself, a transfer, USDC net of the fee reserve.
  const everything = ((await (await call("POST", "/withdrawals/plan", { everything: true, chain: "arc", address: otherWallet })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(everything.blocking, null);
  const symbols = everything.legs.map((leg) => leg.token.symbol).sort();
  assert.deepEqual(symbols, ["EURC", "USDC"]);
  const usdcLine = everything.legs.find((leg) => leg.token.symbol === "USDC")!;
  assert.deepEqual(usdcLine.steps, ["transfer"]);
  assert.ok(BigInt(usdcLine.amount) < BigInt(usdcLine.balance), "max keeps the fee reserve back");

  // 3. The plan the app runs: EURC as cash and 0.5 USDC to my own wallet on Base Sepolia.
  const plan = ((await (await call("POST", "/withdrawals/plan", { assets: [{ asset: "EURC", as: "cash" }, { asset: "USDC", amount: "0.5" }], chain: "base", address: otherWallet })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(plan.blocking, null, JSON.stringify(plan));
  const eurcLeg = plan.legs.find((leg) => leg.token.symbol === "EURC")!;
  const usdcLeg = plan.legs.find((leg) => leg.token.symbol === "USDC")!;
  assert.deepEqual(eurcLeg.steps, ["swap", "bridge"]);
  assert.deepEqual(usdcLeg.steps, ["bridge"]);
  assert.equal(eurcLeg.status, "ready");
  // EURC as itself cannot cross: the line says convert first and offers cash.
  const asItself = ((await (await call("POST", "/withdrawals/plan", { assets: [{ asset: "EURC", as: "itself" }], chain: "base", address: otherWallet })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(asItself.legs[0]?.reason, "convert_first");
  assert.equal(asItself.legs[0]?.canGoAsCash, true);

  // 4. Leg 1: the conversion (swap EURC → USDC), signed and witnessed.
  let swap = ((await (await call("POST", "/swaps", { tokenIn: network.addresses.eurc, tokenOut: "USDC", amount: eurcLeg.amountText })).json()) as { intent: SwapIntent }).intent;
  // Circle's testnet stablecoin service has no EURC → USDC route at moments: quoted again, as "Try again" does.
  for (let attempt = 0; attempt < RETRIES && swap.blocking?.code === "QUOTE_UNAVAILABLE"; attempt++) {
    await wait(POLL_MS * RETRIES);
    swap = ((await (await call("PATCH", `/swaps/${swap.id}`, {})).json()) as { intent: SwapIntent }).intent;
  }
  assert.equal(swap.blocking, null, JSON.stringify(swap.results));
  // A venue that cannot build the calls for a moment answers 502 and the version stands: the app's "Try again".
  let swapSign = (await (await call("POST", `/swaps/${swap.id}/approve`, { version: swap.version })).json()) as SwapApproveResponse;
  for (let attempt = 0; attempt < RETRIES && swapSign.status !== "sign"; attempt++) {
    await wait(POLL_MS);
    swapSign = (await (await call("POST", `/swaps/${swap.id}/approve`, { version: swap.version })).json()) as SwapApproveResponse;
  }
  assert.equal(swapSign.status, "sign", JSON.stringify(swapSign));
  if (swapSign.status !== "sign") return;
  await expectStatus(await call("POST", `/swaps/${swap.id}/signature`, { approvalId: swapSign.approvalId, signedTransaction: await wallet.signTransaction(serializable(swapSign.transaction)) }), 200, "swap signature");
  let swapped: SwapIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.includes(swapped?.state ?? ""); attempt++) {
    await wait(POLL_MS);
    swapped = ((await (await call("GET", `/swaps/${swap.id}`)).json()) as { intent: SwapIntent }).intent;
  }
  assert.equal(swapped?.state, "completed", JSON.stringify(swapped));
  const received = BigInt(swapped?.received ?? "0");
  assert.ok(received > 0n);
  console.log("withdraw leg 1 (convert)", swapped?.tx?.explorerUrl, formatUnits(received, SIX), "USDC");

  // 5. Leg 2: everything that goes to Base in one bridge (the USDC line plus what the conversion delivered).
  const total = units(usdcLeg.amountText) + received;
  const before = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [otherWallet] });
  let order = ((await (await call("POST", "/crosschain/orders", { direction: "out", asset: "USDC", amount: formatUnits(total, SIX), destination: "base", recipient: otherWallet })).json()) as { intent: CrossChainIntent }).intent;
  // A route that timed out is quoted again (an empty patch: a new version), as the app's "Try again" does.
  for (let attempt = 0; attempt < RETRIES && order.blocking?.code === "QUOTE_UNAVAILABLE"; attempt++) {
    order = ((await (await call("PATCH", `/crosschain/orders/${order.id}`, {})).json()) as { intent: CrossChainIntent }).intent;
  }
  assert.equal(order.blocking, null, JSON.stringify(order.results));
  assert.equal(order.draft?.chosen, "cctp");
  const bridgeSign = (await (await call("POST", `/crosschain/orders/${order.id}/approve`, { version: order.version })).json()) as CrossChainApproveResponse;
  assert.equal(bridgeSign.status, "sign", JSON.stringify(bridgeSign));
  if (bridgeSign.status !== "sign") return;
  await expectStatus(await call("POST", `/crosschain/orders/${order.id}/signature`, { approvalId: bridgeSign.approvalId, signedTransaction: await wallet.signTransaction(serializable(bridgeSign.transaction)) }), 200, "bridge signature");
  let moved: CrossChainIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !["delivered", "refunded", "failed"].includes(moved?.stage ?? ""); attempt++) {
    await wait(POLL_MS);
    moved = ((await (await call("GET", `/crosschain/orders/${order.id}`)).json()) as { intent: CrossChainIntent }).intent;
  }
  assert.equal(moved?.stage, "delivered", JSON.stringify(moved));
  const after_ = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [otherWallet] });
  assert.ok(after_ > before, "USDC arrived on Base Sepolia");
  console.log("withdraw leg 2 (bridge)", moved?.tx?.explorerUrl, moved?.fillTx?.explorerUrl, formatUnits(after_ - before, SIX), "USDC on Base Sepolia");

  // 6. The destination is saved as a place; the next plan finds it by its id.
  const saved = ((await (await call("POST", "/places", { kind: "wallet", chain: "base", address: otherWallet })).json()) as { place: PlaceView }).place;
  assert.equal(saved.chain.key, "base");
  assert.equal(saved.label, null);
  const listed = ((await (await call("GET", "/places")).json()) as { places: PlaceView[] }).places;
  assert.equal(listed.length, 1);
  const again = ((await (await call("POST", "/withdrawals/plan", { assets: [{ asset: "USDC", amount: "0.01" }], place: saved.id })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(again.destination?.placeId, saved.id);
  assert.deepEqual(again.legs[0]?.steps, ["bridge"]);
});
