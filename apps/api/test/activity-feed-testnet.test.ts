// Activity everywhere on Arc testnet (cards/automate-safety.md "Look back"): the feed reads every token from Alchemy's
// Transfers API and names each row by Kawase's own record — money in, a send, an automation's skipped run, a practice
// send, a step waiting in Needs you — and an automation run without a transaction has its own why.
// Skipped without the server keys (and ALCHEMY_API_KEY) in the root .env.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationView, FeedPage, SafetyChangeResponse, SendApproveResponse, SendIntent, WhyView } from "@kawase/api-client";
import { automations } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY && process.env.ALCHEMY_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "unknown_outcome", "rejected"];
const units = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("activity feed on Arc testnet: every row named, runs with their why", { skip: !live, timeout: 600_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "feed", email: `feed-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), undefined, undefined, undefined, { automationTickMs: 1000, reconcileIntervalMs: 2000, alchemyApiKey: env.ALCHEMY_API_KEY });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    if (left > units("0.02")) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - units("0.02")] }) });
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "feed-test-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const json = async <T>(response: Response | Promise<Response>, what: string, status = 200) => {
    const answer = await response;
    await expectStatus(answer, status, what);
    return (await answer.json()) as T;
  };
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["0.3"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }
  const bob = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Bob", address: bob, source: "pasted" }), 201, "bob");

  // A send by hand (Face ID: no allowance here).
  const send = (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient: "Bob", amount: "0.04", asset: "USDC" }), "send", 201)).intent;
  const approve = await json<SendApproveResponse>(call("POST", `/sends/${send.id}/approve`, { version: send.version }), "approve");
  if (approve.status !== "sign") throw new Error(`expected a signature: ${approve.status}`);
  const t = approve.transaction;
  const signed = await wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  await json(call("POST", `/sends/${send.id}/signature`, { approvalId: approve.approvalId, signedTransaction: signed }), "signature");
  let sent: SendIntent | undefined;
  for (let i = 0; i < POLL_ATTEMPTS && !FINAL.includes(sent?.state ?? ""); i++) {
    await wait(POLL_MS);
    sent = (await json<{ intent: SendIntent }>(call("GET", `/sends/${send.id}`), "send")).intent;
  }
  assert.equal(sent?.outcome, "sent");

  // An automation that cannot run (more than the wallet holds): its skip is a row with a why.
  const big = (await json<{ automation: AutomationView }>(call("POST", "/automations", { recipient: "Bob", amount: "5", every: "week" }), "big", 201)).automation;
  const grant = await json<{ grants: { grantId: string; typedData: TypedDataDefinition }[] }>(call("POST", `/automations/${big.id}/grant`), "grant");
  await json(call("POST", `/automations/${big.id}/activate`, { signatures: [{ grantId: grant.grants[0]!.grantId, signature: await wallet.signTypedData(grant.grants[0]!.typedData) }] }), "on");
  await db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, big.id));
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await wait(POLL_MS);
    if ((await json<{ automation: AutomationView }>(call("GET", `/automations/${big.id}`), "view")).automation.runs.some((run) => run.status === "skipped")) break;
  }
  // A practice send.
  assert.equal((await json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: { kind: "practice", on: true } }), "practice")).status, "applied");
  const practice = (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient: "Bob", amount: "0.01", asset: "USDC" }), "practice send", 201)).intent;
  await json(call("POST", `/sends/${practice.id}/approve`, { version: practice.version }), "practice approve");

  // The feed: every row named by what Kawase knows of it (Alchemy indexes within seconds; look a few times).
  let feed: FeedPage | undefined;
  for (let i = 0; i < 15; i++) {
    feed = await json<FeedPage>(call("GET", "/activity?network=testnet"), "feed");
    if (feed.items.some((item) => item.kind === "send" && item.status === "confirmed") && feed.items.some((item) => item.kind === "receive")) break;
    await wait(POLL_MS * 2);
  }
  assert.equal(feed!.source, "alchemy");
  console.log(feed!.items.map((item) => `${item.kind}/${item.status}/${item.token?.symbol ?? "-"} ${item.amount ?? ""} ${item.reason ?? ""}`).join("\n"));
  const outgoing = feed!.items.find((item) => item.kind === "send" && item.status === "confirmed");
  assert.ok(outgoing, "the send is a row");
  assert.equal(outgoing!.contactName, "Bob");
  assert.equal(outgoing!.intentId, send.id);
  assert.ok(feed!.items.some((item) => item.kind === "receive" && item.token?.symbol === "USDC" && item.amount === units("0.3").toString()), "the money in is a row");
  const skipped = feed!.items.find((item) => item.kind === "automation" && item.status === "skipped");
  assert.ok(skipped?.runId, "the skipped run is a row");
  assert.equal(skipped!.reason, "INSUFFICIENT_BALANCE");
  assert.ok(feed!.items.some((item) => item.kind === "practice" && item.status === "practiced"), "the practice send is a row");

  // The run's why: which automation, what stopped it, and the recorded step.
  const why = (await json<{ why: WhyView }>(call("GET", `/activity/why/run/${skipped!.runId}`), "why")).why;
  assert.equal(why.kind, "automation");
  assert.ok(why.steps.some((step) => step.step === "checked" && step.blocking === "INSUFFICIENT_BALANCE"));
  assert.ok(why.steps.some((step) => step.step === "audit" && step.action === "automation.run_skipped"), JSON.stringify(why.steps));
  // The send's why (B2's decision record) is reachable from its row.
  const sendWhy = (await json<{ why: WhyView }>(call("GET", `/history/why/${outgoing!.txHash}?network=testnet`), "send why")).why;
  assert.equal(sendWhy.kind, "send");
  console.log("feed rows", feed!.items.length, "send", outgoing!.explorerUrl);
});
