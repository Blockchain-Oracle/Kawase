// A withdrawal kept on the server, on Arc testnet (money-out.md "Finish it"; G7): a first-time destination is
// flagged, the withdrawal starts from the reviewed plan (1 EURC as cash + 0.2 USDC to another wallet on Arc), the
// conversion is signed, then the app "closes": asking for the next step twice returns the same intent (resume), which
// is then signed; the withdrawal ends done, the destination is saved (no longer first-time), and Activity shows it as
// one "withdraw" row holding both steps. Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/withdrawals-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { FeedPage, SendApproveResponse, SwapApproveResponse, UnsignedTransaction, WithdrawalNextView, WithdrawalView, WithdrawPlanView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 100;
const RETRIES = 4;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
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

test("a server-held withdrawal: first-time flag, resume with the same intent, one Activity row", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const elsewhere = privateKeyToAccount(generatePrivateKey()).address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "resumer", email: `resume-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
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
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "resume-phone-0001" } }));
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
  for (const [tokenAddress, amount] of [[network.addresses.usdc, "0.6"], [network.addresses.eurc, "1"]] as const) {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }

  const input = { assets: [{ asset: "EURC", as: "cash" }, { asset: "USDC", amount: "0.2" }], chain: "arc", address: elsewhere };
  const plan = ((await (await call("POST", "/withdrawals/plan", input)).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(plan.destination?.firstTime, true, "nothing went there yet");

  const started = await call("POST", "/withdrawals", input);
  await expectStatus(started, 201, "start");
  const run = ((await started.json()) as { withdrawal: WithdrawalView }).withdrawal;
  assert.deepEqual(run.steps.map((step) => step.kind), ["swap", "send"]);
  assert.equal(run.steps[1]?.amount, null, "the last move waits for what the conversion delivers");

  const sign = async (next: WithdrawalNextView) => {
    const intent = next.intent!;
    const path = intent.kind === "swap" ? "/swaps" : "/sends";
    let answer = (await (await call("POST", `${path}/${intent.id}/approve`, { version: intent.version })).json()) as SwapApproveResponse | SendApproveResponse;
    for (let attempt = 0; attempt < RETRIES && answer.status !== "sign"; attempt++) {
      await wait(POLL_MS);
      answer = (await (await call("POST", `${path}/${intent.id}/approve`, { version: intent.version })).json()) as SwapApproveResponse | SendApproveResponse;
    }
    assert.equal(answer.status, "sign", JSON.stringify(answer));
    if (answer.status !== "sign") return;
    await expectStatus(await call("POST", `${path}/${intent.id}/signature`, { approvalId: answer.approvalId, signedTransaction: await wallet.signTransaction(serializable(answer.transaction)) }), 200, `${intent.kind} signature`);
  };
  const followStep = async (stepId: string) => {
    let view: WithdrawalView | undefined;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await wait(POLL_MS);
      view = ((await (await call("GET", `/withdrawals/${run.id}`)).json()) as { withdrawal: WithdrawalView }).withdrawal;
      const step = view.steps.find((entry) => entry.id === stepId);
      if (step?.state === "done" || step?.state === "failed") return view;
    }
    return view;
  };

  // Step 1: the conversion (re-quoted when Circle's testnet route is missing for a moment).
  let first = ((await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView);
  for (let attempt = 0; attempt < RETRIES && first.intent?.blocking?.code === "QUOTE_UNAVAILABLE"; attempt++) {
    await wait(POLL_MS * RETRIES);
    await call("PATCH", `/swaps/${first.intent.id}`, {});
    first = ((await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView);
  }
  assert.equal(first.intent?.kind, "swap");
  assert.equal(first.intent?.blocking, null, JSON.stringify(first.intent));
  await sign(first);
  const afterSwap = await followStep("swap:" + network.addresses.eurc.toLowerCase());
  const swapStep = afterSwap?.steps[0];
  assert.equal(swapStep?.state, "done", JSON.stringify(afterSwap));
  console.log("step 1 converted", swapStep?.received, swapStep?.explorerUrl);

  // The app closes before the last step is signed: asking again gives the same intent (the server's record).
  const second = ((await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView);
  const again = ((await (await call("POST", `/withdrawals/${run.id}/next`)).json()) as WithdrawalNextView);
  assert.equal(second.intent?.kind, "send");
  assert.equal(again.intent?.id, second.intent?.id, "Finish it resumes the same intent");
  assert.equal(BigInt(second.step!.moved!), units("0.2") + BigInt(swapStep!.received!), "the last move carries the USDC line plus what the conversion delivered");
  const opened = ((await (await call("GET", "/withdrawals")).json()) as { withdrawals: WithdrawalView[] }).withdrawals;
  assert.ok(opened.some((entry) => entry.id === run.id), "listed as unfinished");
  await sign(again);
  const done = await followStep("usdc");
  assert.equal(done?.status, "done", JSON.stringify(done));
  console.log("step 2 sent", done?.steps[1]?.explorerUrl);
  assert.equal(await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [elsewhere] }), BigInt(second.step!.moved!));

  // Saved as a place; no longer first-time.
  const later = ((await (await call("POST", "/withdrawals/plan", { assets: [{ asset: "USDC", amount: "0.01" }], chain: "arc", address: elsewhere })).json()) as { plan: WithdrawPlanView }).plan;
  assert.equal(later.destination?.firstTime, false);
  assert.ok(later.destination?.placeId, "saved to My places");

  // Activity: one row for the withdrawal, its steps inside it.
  const feed = ((await (await call("GET", "/activity")).json()) as FeedPage).items;
  const row = feed.find((item) => item.kind === "withdraw");
  assert.equal(row?.withdrawal?.id, run.id);
  assert.equal(row?.status, "confirmed");
  const stepIntents = new Set(row?.withdrawal?.steps.map((step) => step.intentId));
  assert.ok(!feed.some((item) => item.kind !== "withdraw" && item.intentId && stepIntents.has(item.intentId)), "the steps are not separate rows");
});
