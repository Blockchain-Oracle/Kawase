// Pause, cooldown and the brake on Arc testnet (X30, X31, cards/automate-safety.md "Brake"). Pause stops only what acts
// without the person: while paused the person's own signed send lands, the allowance no longer covers anything (the
// ops wallet redeems nothing) and an automation run is skipped. The new-recipient cooldown keeps the allowance off a new
// address but never blocks the person's own send. The brake (over half the balance to someone new) is refused without
// the person's explicit override and goes through with it. The wallet is a local key standing in for Privy.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test (or this file alone).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationView, SafetyChangeResponse, SendApproveResponse, SendIntent, TransactionRequestResponse } from "@kawase/api-client";
import { automations } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "unknown_outcome", "rejected"];
const HOUR_S = 3600;
const units = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("pause, cooldown and the brake on Arc testnet", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const TEST_ID = randomUUID();
  const person = privyPerson(`brake-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains, undefined, circleOps(env), undefined, undefined, undefined, { automationTickMs: 1000, reconcileIntervalMs: 2000 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    const keep = units("0.02");
    if (left > keep) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] });
      await client.waitForTransactionReceipt({ hash });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "brake-test-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const json = async <T>(response: Response | Promise<Response>, what: string, status = 200) => {
    const answer = await response;
    await expectStatus(answer, status, what);
    return (await answer.json()) as T;
  };
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  const allowance = await json<{ grantId: string; typedData: TypedDataDefinition }>(call("POST", "/wallet/allowance/request", { network: "testnet" }), "allowance request");
  await expectStatus(await call("POST", "/wallet/allowance/submit", { grantId: allowance.grantId, signature: await wallet.signTypedData(allowance.typedData) }), 200, "allowance");

  const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["0.3"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  const alex = privateKeyToAccount(generatePrivateKey()).address;
  const bea = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Alex", address: alex, source: "pasted" }), 201, "alex");
  await expectStatus(await call("POST", "/contacts", { displayName: "Bea", address: bea, source: "pasted" }), 201, "bea");
  const change = (value: unknown) => json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: value }), "change");
  const draftSend = async (recipient: string, amount: string) => (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient, amount, asset: "USDC" }), "draft", 201)).intent;
  const codes = (intent: SendIntent) => intent.results.map((entry) => entry.code);
  const signTx = (request: TransactionRequestResponse) => {
    const t = request.transaction;
    return wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  };
  const waitSend = async (id: string) => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const { intent } = await json<{ intent: SendIntent }>(call("GET", `/sends/${id}`), "send");
      if (FINAL.includes(intent.state)) return intent;
      await wait(POLL_MS);
    }
    throw new Error(`send ${id} did not finish`);
  };
  /** The person's own yes: the api hands back the transaction (nothing on the allowance), the wallet signs it. */
  const ownSend = async (intent: SendIntent, override?: boolean) => {
    assert.equal(intent.blocking, null, `not blocked: ${JSON.stringify(intent.results)}`);
    const answer = await json<SendApproveResponse>(call("POST", `/sends/${intent.id}/approve`, { version: intent.version, ...(override ? { override } : {}) }), "approve");
    assert.equal(answer.status, "sign", `the ops wallet redeems nothing: ${JSON.stringify(answer.status)}`);
    if (answer.status !== "sign") throw new Error("expected the wallet's signature");
    await json<SendApproveResponse>(call("POST", `/sends/${intent.id}/signature`, { approvalId: answer.approvalId, signedTransaction: await signTx({ requestId: answer.approvalId, transaction: answer.transaction }) }), "signature");
    return waitSend(intent.id);
  };

  // 1. Cooldown (X31): a new address may get at most 0.01 without the person for an hour. Above it the allowance is off
  //    for Alex (a warning, not a stop), and the person's own signed send lands. At or under it, the allowance covers.
  assert.equal((await change({ kind: "cooldown", seconds: HOUR_S, cap: units("0.01").toString() })).status, "applied");
  const cooling = await draftSend("Alex", "0.03");
  assert.ok(codes(cooling).includes("NEW_RECIPIENT_COOLDOWN"), JSON.stringify(cooling.results));
  assert.ok(codes(cooling).includes("FIRST_TIME_RECIPIENT"));
  assert.equal(cooling.route, "wallet_signature");
  const cooled = await ownSend(cooling);
  assert.equal(cooled.outcome, "sent", JSON.stringify(cooled));
  console.log("cooldown: the person's own send to a new address", cooled.tx?.explorerUrl);
  const underCap = await draftSend("Alex", "0.01");
  assert.equal(underCap.route, "allowance", JSON.stringify(underCap.results));

  // 2. A weekly automation to Alex, live on its own grant (before the pause).
  const automation = (await json<{ automation: AutomationView }>(call("POST", "/automations", { recipient: "Alex", amount: "0.01", every: "week", weekday: 1 }), "automation", 201)).automation;
  const grants = await json<{ grants: { grantId: string; typedData: TypedDataDefinition }[] }>(call("POST", `/automations/${automation.id}/grant`), "automation grant");
  const signatures = [];
  for (const entry of grants.grants) signatures.push({ grantId: entry.grantId, signature: await wallet.signTypedData(entry.typedData) });
  await json(call("POST", `/automations/${automation.id}/activate`, { signatures }), "automation on");

  // 3. Pause all (X30). The allowance covers nothing: the same 0.01 the allowance just covered now needs the wallet's
  //    own signature, and lands with it. The automation's run is skipped; Alex gets nothing from it.
  const paused = await change({ kind: "pause", on: true });
  assert.ok(paused.status === "applied" && paused.user.pausedAllAt);
  const whilePaused = await draftSend("Alex", "0.01");
  assert.equal(whilePaused.route, "wallet_signature");
  assert.ok(codes(whilePaused).includes("AGENT_PAUSED"));
  const before = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [alex] });
  const ownWhilePaused = await ownSend(whilePaused);
  assert.equal(ownWhilePaused.outcome, "sent", JSON.stringify(ownWhilePaused));
  console.log("paused: the person's own send", ownWhilePaused.tx?.explorerUrl);
  await db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, automation.id));
  let run: AutomationView["runs"][number] | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !run; attempt++) {
    await wait(POLL_MS);
    run = (await json<{ automation: AutomationView }>(call("GET", `/automations/${automation.id}`), "view")).automation.runs[0];
  }
  assert.equal(run?.status, "skipped", JSON.stringify(run));
  assert.equal(run?.reason, "PAUSED_ALL");
  const after1 = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [alex] });
  assert.equal(after1 - before, units("0.01"), "only the person's own send reached Alex");

  // 4. The brake: more than half the balance to someone new (Bea). It warns and offers a test amount; approving
  //    without the person's override is refused before anything is prepared; with it, it lands.
  const balance = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  const risky = await draftSend("Bea", (Number(balance / 2n + units("0.01")) / 1e6).toFixed(6));
  assert.ok(codes(risky).includes("BRAKE_HALF_BALANCE"), JSON.stringify(risky.results));
  assert.ok(codes(risky).includes("TEST_AMOUNT_SUGGESTED"));
  assert.equal(risky.blocking, null);
  const refused = await call("POST", `/sends/${risky.id}/approve`, { version: risky.version });
  assert.equal(refused.status, 409);
  assert.match(((await refused.json()) as { type: string }).type, /brake_override$/);
  const braked = await ownSend(risky, true);
  assert.equal(braked.outcome, "sent", JSON.stringify(braked));
  console.log("brake: overridden by the person", braked.tx?.explorerUrl);
});
