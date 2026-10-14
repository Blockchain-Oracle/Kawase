// Looking back on Arc testnet (cards/automate-safety.md "Look back"; G9): a fresh local key stands in for the Turnkey
// wallet; test USDC arrives from the ops wallet; a send of 0.03 USDC goes out, signed by the wallet. Then: the "why" for that
// transaction (what was asked, by whom, sent how, and the audit rows the middleware wrote for each write), the week's
// report (the money in and out, as the explorer sees it), the month as CSV and beancount, and Data & privacy (a stored
// conversation exported as text, a retention set, everything deleted).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { PrivacySettings, ReportView, SendApproveResponse, SendIntent, TransactionRequestResponse, WhyView } from "@kawase/api-client";
import { auditLog, threadMessages, threads } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "rejected"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const toSerializable = (t: TransactionRequestResponse["transaction"]): TransactionSerializable => ({
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

test("history on Arc testnet: why a send happened, the weekly report, the month's export, privacy", { skip: !live, timeout: 900_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "hist", email: `hist-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains);
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let token = "";
  after(async () => {
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    if (left > usdc("0.02")) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
      await client.waitForTransactionReceipt({ hash });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "hist-test-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["0.1"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  // A send of 0.03 USDC to a new address: the wallet signs it.
  const one = privateKeyToAccount(generatePrivateKey()).address;
  const draft = ((await (await call("POST", "/sends", { recipient: one, amount: "0.03", asset: "USDC" })).json()) as { intent: SendIntent }).intent;
  assert.equal(draft.blocking, null, JSON.stringify(draft.results));
  const sign = (await (await call("POST", `/sends/${draft.id}/approve`, { version: draft.version })).json()) as SendApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  const signed = await signer.signTransaction(toSerializable(sign.transaction) as never);
  await expectStatus(await call("POST", `/sends/${draft.id}/signature`, { approvalId: sign.approvalId, signedTransaction: signed }), 200, "signature");
  let sent: SendIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.includes(sent?.state ?? ""); attempt++) {
    await wait(POLL_MS);
    sent = ((await (await call("GET", `/sends/${draft.id}`)).json()) as { intent: SendIntent }).intent;
  }
  assert.equal(sent?.state, "completed", JSON.stringify(sent));
  const txHash = sent!.tx!.hash;
  console.log("send", txHash);

  // 1. Why: what it was, sent by the wallet itself, and the audit rows for each write on it.
  const why = ((await (await call("GET", `/history/why/${txHash}?network=testnet`)).json()) as { why: WhyView }).why;
  assert.equal(why.kind, "send");
  assert.ok(why.steps.some((step) => step.step === "sent" && step.txHash.toLowerCase() === txHash.toLowerCase()), JSON.stringify(why.steps));
  assert.equal((await call("GET", `/history/why/0x${"ab".repeat(32)}?network=testnet`)).status, 404, "a transaction Kawase never saw");

  // Every write left an audit row (the middleware), naming the route pattern, never the raw path.
  const writes = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.userId, userId));
  const actions = new Set(writes.map((row) => row.action));
  for (const expected of ["POST /wallet", "POST /wallet/setup/submit", "POST /sends", "POST /sends/:id/approve", "POST /sends/:id/signature"]) {
    assert.ok(actions.has(expected), `audited: ${expected} (have ${[...actions].join(", ")})`);
  }

  // 2. The week's report and 3. the month's export, once the explorer has indexed the send.
  let report: ReportView | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    report = ((await (await call("GET", "/history/report?network=testnet")).json()) as { report: ReportView }).report;
    if (report.counts.sent >= 1 && report.counts.received >= 1) break;
    await wait(POLL_MS);
  }
  assert.ok(report);
  assert.equal(report.sent.USDC, usdc("0.03").toString(), JSON.stringify(report));
  assert.equal(report.received.USDC, usdc("0.1").toString(), JSON.stringify(report));
  const month = new Date().toISOString().slice(0, "YYYY-MM".length);
  const csv = await (await call("GET", `/history/export?network=testnet&month=${month}&format=csv`)).text();
  assert.match(csv, /^date,type,asset,amount,/);
  assert.ok(csv.toLowerCase().includes(txHash.toLowerCase()), csv);
  assert.ok(csv.includes(",sent,USDC,-0.03,") && csv.includes(",received,USDC,0.1,"), csv);
  const beancount = await (await call("GET", `/history/export?network=testnet&month=${month}&format=beancount`)).text();
  assert.match(beancount, /open Assets:Kawase:ArcTestnet:USDC/);
  assert.match(beancount, /Assets:Kawase:ArcTestnet:USDC {2}-0\.03 USDC/);
  console.log(beancount.split("\n").slice(0, 12).join("\n"));

  // 4. Privacy: a stored conversation is exported as text, a retention is set, everything is deleted.
  const threadId = randomUUID();
  await db.insert(threads).values({ id: threadId, userId, title: "Hello", network: "testnet" });
  await db.insert(threadMessages).values([
    { threadId, id: "m1", userId, seq: 1, role: "user", parts: [{ type: "text", text: "what can you do?" }] },
    { threadId, id: "m2", userId, seq: 2, role: "assistant", parts: [{ type: "text", text: "Quite a lot." }, { type: "tool-get_capabilities" }] },
  ]);
  const before = (await (await call("GET", "/privacy")).json()) as PrivacySettings;
  assert.equal(before.conversations, 1);
  const transcript = await (await call("GET", "/privacy/transcripts/export")).text();
  assert.match(transcript, /You \([^)]+\): what can you do\?/);
  assert.match(transcript, /Kawase \([^)]+\): Quite a lot\. \[get_capabilities\]/);
  assert.equal((await call("PATCH", "/privacy", { transcriptRetentionDays: 45 })).status, 400, "only the offered periods");
  const kept = (await (await call("PATCH", "/privacy", { transcriptRetentionDays: 30 })).json()) as PrivacySettings;
  assert.equal(kept.transcriptRetentionDays, 30);
  assert.equal(kept.conversations, 1, "a fresh conversation is within 30 days");
  const gone = (await (await call("DELETE", "/privacy/transcripts")).json()) as PrivacySettings;
  assert.equal(gone.conversations, 0);
  const [left] = await db.select().from(threads).where(and(eq(threads.userId, userId), eq(threads.id, threadId)));
  assert.equal(left, undefined);
});
