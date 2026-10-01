// Payment requests on Arc testnet (D22: the uncertain part is the composition with the chain): a request paid by a
// Kawase send is marked paid by that send; a request paid by a plain transfer from another wallet is found by the
// incoming watcher reading the system emitter; the public link works without an account; both sides get inbox items.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { InboxItem, PaymentRequest, PublicPaymentRequest, SendIntent } from "@kawase/api-client";
import { createDb } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { IncomingWatcher } from "../src/incoming/watcher";
import { InboxService } from "../src/inbox/service";
import { RequestService } from "../src/requests/service";
import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("payment requests on Arc testnet: paid by a Kawase send, paid by a plain transfer", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const payerKey = privateKeyToAccount(generatePrivateKey());
  const requesterKey = privateKeyToAccount(generatePrivateKey());
  const people = [
    { key: payerKey, org: randomUUID(), tk: randomUUID(), session: turnkeyStyleKeyPair(), name: "payer" },
    { key: requesterKey, org: randomUUID(), tk: randomUUID(), session: turnkeyStyleKeyPair(), name: "requester" },
  ];
  const turnkey = fakeTurnkey(
    Object.fromEntries(people.map((p) => [`${p.org}/${p.tk}`, { userId: p.tk, userName: p.name, email: `${p.name}-${p.org}@example.test`, sessionPublicKeys: [p.session.publicKeyHex] }])),
    Object.fromEntries(people.map((p) => [p.org, [{ walletId: "wallet-1", address: p.key.address }]])),
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env));
  const userIds: string[] = [];
  const watcherDb = createDb(process.env.DATABASE_URL!, { poolSize: 2 });
  after(async () => {
    const signer = createWalletClient({ account: payerKey, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [payerKey.address] });
    if (left > usdc("0.02")) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
      await client.waitForTransactionReceipt({ hash });
    }
    for (const id of userIds) await deleteUser(db, id);
    await close();
    await watcherDb.pool.end();
  });

  const signIn = async (p: (typeof people)[number]) => {
    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: p.org, activityId: nonce });
    const response = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, p.session) }, turnkeyUserId: p.tk, device: { platform: "ios", installationId: `req-test-${p.name}-0001` } }));
    await expectStatus(response, 201, `sign-in ${p.name}`);
    const { token, user } = (await response.json()) as { token: string; user: { id: string } };
    userIds.push(user.id);
    const call = (method: string, path: string, payload?: unknown) =>
      app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    await expectStatus(await call("POST", "/wallet", { address: p.key.address, walletId: "wallet-1" }), 201, `register ${p.name}`);
    return call;
  };
  const payer = await signIn(people[0]!);
  const requester = await signIn(people[1]!);

  // The payer: set up, a small allowance, funded from the ops wallet.
  const { authorization } = (await (await payer("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signed = await payerKey.signAuthorization(authorization);
  await expectStatus(await payer("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signed.address, chainId: signed.chainId, nonce: signed.nonce, r: signed.r, s: signed.s, yParity: signed.yParity } }), 200, "setup");
  const grant = (await (await payer("POST", "/wallet/allowance/request", { network: "testnet", periodAmount: usdc("1").toString() })).json()) as { grantId: string; typedData: TypedDataDefinition };
  await expectStatus(await payer("POST", "/wallet/allowance/submit", { grantId: grant.grantId, signature: await payerKey.signTypedData(grant.typedData) }), 200, "allowance");
  const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: payerKey.address, amount: ["0.2"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  // 1. A request, its public link, and a Kawase send that pays it.
  const created = ((await (await requester("POST", "/requests", { amount: "0.1", asset: "USDC", note: "Lunch" })).json()) as { request: PaymentRequest }).request;
  assert.equal(created.status, "open");
  assert.ok(created.link.endsWith(`/r/${created.token}`));
  const opened = await app.request(`/r/${created.token}`);
  await expectStatus(opened, 200, "public link without a session");
  const publicView = ((await opened.json()) as { request: PublicPaymentRequest }).request;
  assert.equal(publicView.requester.address.toLowerCase(), requesterKey.address.toLowerCase());
  assert.equal(publicView.note, "Lunch");

  const draft = ((await (await payer("POST", "/sends", { requestToken: created.token, recipient: "someone else", amount: "99" })).json()) as { intent: SendIntent }).intent;
  assert.equal(draft.draft?.amount, usdc("0.1").toString(), "the amount comes from the request, not the words");
  assert.equal(draft.draft?.recipient.address.toLowerCase(), requesterKey.address.toLowerCase(), "so does the recipient");
  assert.equal(draft.route, "allowance", JSON.stringify(draft.blocking));
  await expectStatus(await payer("POST", `/sends/${draft.id}/approve`, { version: draft.version }), 200, "approve");
  let paid: PaymentRequest = created;
  for (let i = 0; i < POLL_ATTEMPTS && paid.status !== "paid"; i++) {
    await wait(POLL_MS);
    await payer("GET", `/sends/${draft.id}`);
    paid = ((await (await requester("GET", `/requests/${created.id}`)).json()) as { request: PaymentRequest }).request;
  }
  assert.equal(paid.status, "paid", "the send that paid it marks it paid");
  assert.equal(paid.paidBy?.address.toLowerCase(), payerKey.address.toLowerCase());
  console.log("request paid by a Kawase send", paid.paidTx?.explorerUrl);

  // 2. A second request, paid by a plain transfer from another wallet; the watcher finds it.
  const second = ((await (await requester("POST", "/requests", { amount: "0.05", asset: "USDC" })).json()) as { request: PaymentRequest }).request;
  const external = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: requesterKey.address, amount: ["0.05"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const state = (await circle.getTransaction({ id: external.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }
  const log = createLogger({ service: "requests-test", level: "silent" });
  const wallets = new WalletService(watcherDb.db, chains);
  const inbox = new InboxService(watcherDb.db, chains);
  const requests = new RequestService(watcherDb.db, chains, wallets, inbox, "http://localhost:8081");
  const watcher = new IncomingWatcher(watcherDb.db, chains, requests, inbox, log);
  let secondPaid: PaymentRequest = second;
  for (let i = 0; i < POLL_ATTEMPTS && secondPaid.status !== "paid"; i++) {
    await watcher.tick();
    secondPaid = ((await (await requester("GET", `/requests/${second.id}`)).json()) as { request: PaymentRequest }).request;
    if (secondPaid.status !== "paid") await wait(POLL_MS);
  }
  assert.equal(secondPaid.status, "paid", "the watcher matched the plain transfer");
  console.log("request paid by a plain transfer", secondPaid.paidTx?.explorerUrl);

  // 3. The inbox on both sides.
  const requesterInbox = ((await (await requester("GET", "/inbox")).json()) as { items: InboxItem[]; unread: number });
  assert.ok(requesterInbox.items.some((item) => item.kind === "request_paid" && item.requestId === created.id));
  assert.ok(requesterInbox.items.some((item) => item.kind === "payment_received"));
  const payerInbox = ((await (await payer("GET", "/inbox")).json()) as { items: InboxItem[] });
  assert.ok(payerInbox.items.some((item) => item.kind === "send_completed" && item.intentId === draft.id));
});
