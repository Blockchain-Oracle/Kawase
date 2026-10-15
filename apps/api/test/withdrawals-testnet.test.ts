// A withdrawal kept on the server, on Arc testnet (money-out.md "How": one batch; "Finish it"; G7).
// 1. Convert + transfer on Arc: a first-time destination is flagged; the withdrawal (1 EURC as cash + 0.2 USDC to
//    another wallet on Arc) is offered as ONE transaction; the app "closes" after the batch was built and asking again
//    builds it afresh (nothing of the first moved); the one signature lands both steps in one transaction hash, the
//    destination gets the USDC line plus the conversion's guaranteed minimum, the place is saved, and Activity shows
//    one "withdraw" row holding both steps.
// 2. A single step (USDC only) still goes as its own intent, and "Finish it" returns the same intent while it stands.
// 3. Convert + bridge burn: EURC as cash to my wallet on Base Sepolia is one transaction on Arc (the conversion and
//    the CCTP burn), then the delivery on Base Sepolia is followed as the tracker step.
// Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/withdrawals-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import type { FeedPage, SendApproveResponse, UnsignedTransaction, WithdrawalBatchResponse, WithdrawalNextView, WithdrawalView, WithdrawPlanView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 100;
const BRIDGE_POLL_ATTEMPTS = 300;
const RETRIES = 5;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const SIX = 6;
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
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

type Call = (method: string, path: string, payload?: unknown) => Response | Promise<Response>;
const env = live ? loadApiEnv() : undefined;
const network = getNetwork("testnet");
const wallet = privateKeyToAccount(generatePrivateKey());
let call: Call;
let teardown: () => Promise<void> = async () => undefined;

before(async () => {
  if (!live || !env) return;
  const chains = createChains(env);
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const TEST_ID = randomUUID();
  const person = privyPerson(`batch-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains, undefined, undefined, appKitSwaps(env), appKitBridges(env));
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "batch-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  call = (method, path, payload) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  teardown = async () => {
    for (const tokenAddress of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = tokenAddress === network.addresses.usdc ? units("0.02") : 0n;
      if (left > keep) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: tokenAddress, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] }) });
    }
    await deleteUser(db, user.id);
    await close();
  };
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
});
after(async () => teardown());

const fund = async (amounts: [Hex, string][]) => {
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env!.CIRCLE_TEST_API_KEY, entitySecret: env!.CIRCLE_TEST_ENTITY_SECRET });
  for (const [tokenAddress, amount] of amounts) {
    const drip = await circle.createTransaction({ walletAddress: env!.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }
};

/** The batch for whatever is left: built (again while a price is missing for a moment), signed once, broadcast. */
const batchOnce = async (id: string, sign = true): Promise<WithdrawalBatchResponse> => {
  let answer = (await (await call("POST", `/withdrawals/${id}/batch`, { override: true })).json()) as WithdrawalBatchResponse;
  for (let attempt = 0; attempt < RETRIES && answer.status !== "sign"; attempt++) {
    await wait(POLL_MS * 2);
    answer = (await (await call("POST", `/withdrawals/${id}/batch`, { override: true })).json()) as WithdrawalBatchResponse;
  }
  assert.equal(answer.status, "sign", JSON.stringify(answer));
  if (answer.status !== "sign" || !sign) return answer;
  const signed = await call("POST", `/withdrawals/${id}/batch/signature`, { approvalId: answer.approvalId, signedTransaction: await wallet.signTransaction(serializable(answer.transaction)) });
  await expectStatus(signed, 200, "batch signature");
  return (await signed.json()) as WithdrawalBatchResponse;
};

const follow = async (id: string, stepId: string, attempts = POLL_ATTEMPTS) => {
  let view: WithdrawalView | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await wait(POLL_MS);
    view = ((await (await call("GET", `/withdrawals/${id}`)).json()) as { withdrawal: WithdrawalView }).withdrawal;
    const step = view.steps.find((entry) => entry.id === stepId);
    if (step?.state === "done" || step?.state === "failed") return view;
  }
  return view;
};

test("convert + transfer on Arc go as one transaction; asking again rebuilds it; one Activity row", { skip: !live, timeout: 900_000 }, async () => {
  const client = createPublicClient({ chain: network.viemChain, transport: http(env!.ARC_RPC_URL_TESTNET) });
  const elsewhere = privateKeyToAccount(generatePrivateKey()).address;
  await fund([[network.addresses.usdc, "0.6"], [network.addresses.eurc, "1"]]);

  const input = { assets: [{ asset: "EURC", as: "cash" }, { asset: "USDC", amount: "0.2" }], chain: "arc", address: elsewhere };
  const plan = ((await (await call("POST", "/withdrawals/plan", input)).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(plan.destination?.firstTime, true, "nothing went there yet");
  const started = await call("POST", "/withdrawals", input);
  await expectStatus(started, 201, "start");
  const run = ((await started.json()) as { withdrawal: WithdrawalView }).withdrawal;
  assert.deepEqual(run.steps.map((step) => step.kind), ["swap", "send"]);

  // Both steps are signed on Arc: one transaction is offered instead of a step's intent.
  const next = (await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView;
  assert.equal(next.intent, null);
  assert.deepEqual(next.batch?.steps, ["swap:" + network.addresses.eurc.toLowerCase(), "usdc"]);

  // Built, then the app closes before signing: asking again builds it afresh; the first drafts are closed.
  const first = await batchOnce(run.id, false);
  const firstIntents = first.withdrawal.steps.map((step) => step.intentId);
  assert.ok(first.withdrawal.steps.every((step) => step.batched && step.intentId));
  const again = (await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView;
  assert.ok(again.batch, "still one transaction after a restart");
  const sent = await batchOnce(run.id);
  assert.equal(sent.status, "executing", JSON.stringify(sent));
  assert.ok(sent.withdrawal.steps.every((step, at) => step.intentId !== firstIntents[at]), "fresh drafts for the batch that was signed");
  const closed = (await (await call("GET", `/sends/${firstIntents[1]}`)).json()) as { intent: { state: string } };
  assert.equal(closed.intent.state, "canceled", "the unsigned batch's draft was closed");

  const done = await follow(run.id, "usdc");
  assert.equal(done?.status, "done", JSON.stringify(done));
  const [swapStep, usdcStep] = done!.steps;
  assert.ok(swapStep?.explorerUrl && swapStep.explorerUrl === usdcStep?.explorerUrl, "one transaction for both steps");
  console.log("batch (convert + transfer)", usdcStep?.explorerUrl, "converted", swapStep?.received, "sent", usdcStep?.moved);
  const arrived = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [elsewhere] });
  assert.equal(arrived, BigInt(usdcStep!.moved!), "the destination got exactly the last move");
  assert.ok(arrived >= units("0.2"), "the USDC line plus the conversion's guaranteed minimum");
  assert.ok(BigInt(swapStep!.received!) + units("0.2") >= arrived, "never more than the conversion delivered");

  // Saved as a place; no longer first-time.
  const later = ((await (await call("POST", "/withdrawals/plan", { assets: [{ asset: "USDC", amount: "0.01" }], chain: "arc", address: elsewhere })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(later.destination?.firstTime, false);
  assert.ok(later.destination?.placeId, "saved to My places");

  // Activity: one row for the withdrawal, its steps inside it.
  const feed = ((await (await call("GET", "/activity")).json()) as FeedPage).items;
  const row = feed.find((item) => item.kind === "withdraw" && item.withdrawal?.id === run.id);
  assert.equal(row?.status, "confirmed");
  const stepIntents = new Set(row?.withdrawal?.steps.map((step) => step.intentId));
  assert.ok(!feed.some((item) => item.kind !== "withdraw" && item.intentId && stepIntents.has(item.intentId)), "the steps are not separate rows");
});

test("a single step goes as its own intent, and Finish it returns the same intent", { skip: !live, timeout: 300_000 }, async () => {
  const client = createPublicClient({ chain: network.viemChain, transport: http(env!.ARC_RPC_URL_TESTNET) });
  const elsewhere = privateKeyToAccount(generatePrivateKey()).address;
  const input = { assets: [{ asset: "USDC", amount: "0.05" }], chain: "arc", address: elsewhere };
  const started = await call("POST", "/withdrawals", input);
  await expectStatus(started, 201, "start");
  const run = ((await started.json()) as { withdrawal: WithdrawalView }).withdrawal;
  const next = (await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView;
  const again = (await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView;
  assert.equal(next.batch, null, "one step needs no batch");
  assert.equal(next.intent?.kind, "send");
  assert.equal(again.intent?.id, next.intent?.id, "Finish it resumes the same intent");
  const body = { version: again.intent!.version, ...(again.intent!.brake ? { override: true } : {}) };
  const answer = (await (await call("POST", `/sends/${again.intent!.id}/approve`, body)).json()) as SendApproveResponse;
  if (answer.status === "sign")
    await expectStatus(await call("POST", `/sends/${again.intent!.id}/signature`, { approvalId: answer.approvalId, signedTransaction: await wallet.signTransaction(serializable(answer.transaction)) }), 200, "send signature");
  const done = await follow(run.id, "usdc");
  assert.equal(done?.status, "done", JSON.stringify(done));
  assert.equal(await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [elsewhere] }), units("0.05"));
});

test("convert + bridge burn go as one transaction on Arc; the delivery on Base Sepolia is the tracker step", { skip: !live, timeout: 1_500_000 }, async () => {
  const base = createPublicClient({ chain: baseSepolia, transport: http() });
  const otherWallet = privateKeyToAccount(generatePrivateKey()).address;
  // Arc's gas is USDC, paid before the batch runs: the conversion's USDC cannot pay for it.
  await fund([[network.addresses.usdc, "0.1"], [network.addresses.eurc, "1"]]);
  const input = { assets: [{ asset: "EURC", as: "cash" }], chain: "base", address: otherWallet };
  const started = await call("POST", "/withdrawals", input);
  await expectStatus(started, 201, "start");
  const run = ((await started.json()) as { withdrawal: WithdrawalView }).withdrawal;
  assert.deepEqual(run.steps.map((step) => step.kind), ["swap", "bridge"]);
  const next = (await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView;
  assert.ok(next.batch, "the conversion and the burn are both signed on Arc");

  const before_ = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [otherWallet] });
  const sent = await batchOnce(run.id);
  assert.equal(sent.status, "executing", JSON.stringify(sent));
  const converted = await follow(run.id, "swap:" + network.addresses.eurc.toLowerCase());
  assert.equal(converted?.steps[0]?.state, "done", JSON.stringify(converted));
  const done = await follow(run.id, "usdc", BRIDGE_POLL_ATTEMPTS);
  assert.equal(done?.status, "done", JSON.stringify(done));
  const [swapStep, bridgeStep] = done!.steps;
  assert.equal(swapStep?.explorerUrl, bridgeStep?.explorerUrl, "the conversion and the burn are one transaction");
  const after_ = await base.readContract({ address: BASE_SEPOLIA_USDC, abi: erc20Abi, functionName: "balanceOf", args: [otherWallet] });
  assert.ok(after_ > before_, "USDC arrived on Base Sepolia");
  console.log("batch (convert + burn)", bridgeStep?.explorerUrl, "delivered", bridgeStep?.fillUrl, formatUnits(after_ - before_, SIX), "USDC on Base Sepolia");
});
