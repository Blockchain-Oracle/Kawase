// Earning through the api on Arc testnet (App Kit Earn's mock Morpho vaults), with a fresh local key standing in for
// the Privy wallet. Covers: the vault list, a deposit into the inferred best vault with one signed transaction, the
// position read from the vault, a tampered signature refused, and a withdrawal back to the wallet.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { EarnApproveResponse, EarnIntent, EarnPositionView, EarnVaultView, UnsignedTransaction } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitEarn } from "../src/earn/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("earn on Arc testnet: deposit into a vault and withdraw, one signed transaction each", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const TEST_ID = randomUUID();
  const person = privyPerson(`earn-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains, undefined, undefined, undefined, undefined, appKitEarn(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? usdc("0.02") : 0n;
      if (left > keep) {
        const hash = await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] });
        await client.waitForTransactionReceipt({ hash });
      }
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "earn-test-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
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
    amount: ["1.3"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  const signAndSubmit = async (intent: EarnIntent) => {
    const sign = (await (await call("POST", `/earn/intents/${intent.id}/approve`, { version: intent.version })).json()) as EarnApproveResponse;
    assert.equal(sign.status, "sign", JSON.stringify(sign));
    if (sign.status !== "sign") throw new Error("no transaction to sign");
    const t: UnsignedTransaction = sign.transaction;
    assert.equal(t.to.toLowerCase(), wallet.address.toLowerCase(), "the wallet sends the batch to itself");
    const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
    await expectStatus(await call("POST", `/earn/intents/${intent.id}/signature`, { approvalId: sign.approvalId, signedTransaction: await wallet.signTransaction(unsigned) }), 200, "signature");
    let done = intent;
    for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(done.state); i++) {
      await wait(POLL_MS);
      done = ((await (await call("GET", `/earn/intents/${intent.id}`)).json()) as { intent: EarnIntent }).intent;
    }
    return done;
  };

  // 1. The vaults on Arc testnet.
  const overview = (await (await call("GET", "/earn")).json()) as { vaults: EarnVaultView[]; positions: EarnPositionView[] };
  assert.ok(overview.vaults.length > 0, "App Kit lists vaults on Arc testnet");
  assert.equal(overview.positions.length, 0);

  // 2. A deposit into the inferred best vault; a tampered signature is refused first.
  const deposit = ((await (await call("POST", "/earn/intents", { action: "deposit", amount: "1" })).json()) as { intent: EarnIntent }).intent;
  assert.equal(deposit.blocking, null, JSON.stringify(deposit.results));
  assert.equal(deposit.draft?.vault.address.toLowerCase(), overview.vaults.find((vault) => vault.status === "active")?.address.toLowerCase());
  const sign = (await (await call("POST", `/earn/intents/${deposit.id}/approve`, { version: deposit.version })).json()) as EarnApproveResponse;
  if (sign.status !== "sign") throw new Error(JSON.stringify(sign));
  const t = sign.transaction;
  const tampered = await wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: "0x", value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  assert.equal((await call("POST", `/earn/intents/${deposit.id}/signature`, { approvalId: sign.approvalId, signedTransaction: tampered })).status, 422);
  const deposited = await signAndSubmit(deposit);
  assert.equal(deposited.state, "completed", JSON.stringify(deposited));
  console.log("deposited", deposited.tx?.explorerUrl);
  const holding = (await (await call("GET", "/earn")).json()) as { positions: EarnPositionView[] };
  assert.equal(holding.positions.length, 1);
  assert.ok(BigInt(holding.positions[0]!.assets) >= usdc("0.99"), "the position is worth about what went in");

  // 3. A withdrawal of half, from the position (the vault is inferred from it).
  let withdraw = ((await (await call("POST", "/earn/intents", { action: "withdraw", amount: "0.5" })).json()) as { intent: EarnIntent }).intent;
  assert.equal(withdraw.blocking, null, JSON.stringify(withdraw.results));
  let withdrawn: EarnIntent | undefined;
  for (let i = 0; i < 6 && !withdrawn; i++) {
    try {
      withdrawn = await signAndSubmit(withdraw);
    } catch (error) {
      // Circle's service can take a few seconds to see a new position (380408).
      console.log("withdraw not built yet:", (error as Error).message.slice(0, 120));
      await wait(5000);
      withdraw = ((await (await call("GET", `/earn/intents/${withdraw.id}`)).json()) as { intent: EarnIntent }).intent;
    }
  }
  assert.equal(withdrawn?.state, "completed", JSON.stringify(withdrawn));
  assert.ok(withdrawn!.received && BigInt(withdrawn!.received) >= usdc("0.495"), "at least the floor came back");
  console.log("withdrew", withdrawn!.tx?.explorerUrl, "received", withdrawn!.received);
});
