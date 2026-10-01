// Bridges through the api on Arc testnet → Base Sepolia, with a fresh local key standing in for the Turnkey wallet
// (D22: the uncertain part is the composition on real chains). Covers: the destinations list, a missing chain asked
// for, a draft with the fee cap and the route comparison, a tampered signature refused, and one signed transaction
// (approve + burn) that Circle attests and its forwarder mints on Base Sepolia, checked on that chain.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import type { BridgeApproveResponse, BridgeDestinationView, BridgeIntent, UnsignedTransaction } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 100;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("bridges on Arc testnet → Base Sepolia: one signed transaction, minted by Circle's forwarder", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const base = createPublicClient({ chain: baseSepolia, transport: http() });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "bridger", email: `bridge-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, undefined, undefined, appKitBridges(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    if (left > usdc("0.02")) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
      await client.waitForTransactionReceipt({ hash });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "bridge-test-phone-01" } }));
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
  const drip = await circle.createTransaction({
    walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
    blockchain: network.circleBlockchain,
    tokenAddress: network.addresses.usdc,
    destinationAddress: wallet.address,
    amount: ["1.2"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    if (DONE_STATES.includes((await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "")) break;
    await wait(POLL_MS);
  }

  // 1. Where it can go, and a missing chain is asked for.
  const { destinations } = (await (await call("GET", "/bridges/destinations")).json()) as { destinations: BridgeDestinationView[] };
  assert.ok(destinations.some((entry) => entry.id === "base" && entry.chainId === baseSepolia.id), JSON.stringify(destinations));
  const noChain = ((await (await call("POST", "/bridges", { amount: "1" })).json()) as { intent: BridgeIntent }).intent;
  assert.equal(noChain.blocking?.code, "DESTINATION_MISSING");

  // 2. The same request with the chain: the fee cap, the least that arrives, the routes compared.
  const revised = ((await (await call("PATCH", `/bridges/${noChain.id}`, { destination: "base" })).json()) as { intent: BridgeIntent }).intent;
  assert.equal(revised.blocking, null, JSON.stringify(revised.results));
  const draft = revised.draft!;
  assert.equal(draft.amount, usdc("1").toString());
  assert.ok(BigInt(draft.minReceived) > 0n && BigInt(draft.minReceived) < usdc("1"));
  assert.equal(draft.routes[0]?.status, "chosen");
  console.log("routes", JSON.stringify(draft.routes));

  // 3. Approve: one transaction to the wallet itself; a tampered one is refused.
  const sign = (await (await call("POST", `/bridges/${revised.id}/approve`, { version: revised.version })).json()) as BridgeApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  const t: UnsignedTransaction = sign.transaction;
  const unsigned: TransactionSerializable = {
    type: "eip1559",
    chainId: t.chainId,
    nonce: t.nonce,
    to: t.to,
    data: t.data,
    value: BigInt(t.value),
    gas: BigInt(t.gas),
    maxFeePerGas: BigInt(t.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
  };
  const refused = await call("POST", `/bridges/${revised.id}/signature`, { approvalId: sign.approvalId, signedTransaction: await wallet.signTransaction({ ...unsigned, data: "0x" }) });
  assert.equal(refused.status, 422);
  const again = (await (await call("POST", `/bridges/${revised.id}/approve`, { version: revised.version })).json()) as BridgeApproveResponse;
  assert.equal(again.status, "sign");
  if (again.status !== "sign") return;
  const a = again.transaction;
  const before = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  const signed = await wallet.signTransaction({ ...unsigned, nonce: a.nonce, data: a.data, gas: BigInt(a.gas), maxFeePerGas: BigInt(a.maxFeePerGas), maxPriorityFeePerGas: BigInt(a.maxPriorityFeePerGas) });
  await expectStatus(await call("POST", `/bridges/${revised.id}/signature`, { approvalId: again.approvalId, signedTransaction: signed }), 200, "signature");

  // 4. Burned, attested, minted — followed through the api.
  let done = revised;
  const stages = new Set<string>();
  for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(done.state); i++) {
    await wait(POLL_MS);
    done = ((await (await call("GET", `/bridges/${revised.id}`)).json()) as { intent: BridgeIntent }).intent;
    if (done.stage) stages.add(done.stage);
  }
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.ok(done.received && BigInt(done.received) >= BigInt(draft.minReceived), "at least the minimum arrived");
  const minted = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  assert.equal(minted - before, BigInt(done.received!), "Base Sepolia holds what the mint says");
  console.log("bridged", done.tx?.explorerUrl, "minted", done.mintTx?.explorerUrl, "received", done.received, "stages", [...stages]);
});
