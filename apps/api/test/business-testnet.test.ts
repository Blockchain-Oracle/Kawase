// Business mode on Arc testnet (cards/agent-business.md acceptance "invoice 50 USDC → the payer uses /r/ from a web
// wallet → marked paid by its Memo reference"), with fresh local keys standing in for the business's Turnkey wallet and
// a client's browser wallet. Covers: the profile; an invoice with two lines, its link, public view and document; the
// client sending exactly the `pay` call the link hands a browser wallet (Memo.memo → USDC.transfer), the watcher matching
// it by memoId and the request closing; a two-line payout in one self-batch transaction (both transfers in its receipt);
// payroll is the automations `payroll` kind and is tested with the automations (A3).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEventLogs, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { InvoicePublicView, InvoiceView, PayoutCreateResult, PayoutView, TransactionRequestResponse } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { InvoiceService } from "../src/business/invoices";
import { AuditWriter } from "../src/audit/writer";
import { RequestService } from "../src/requests/service";
import { WalletService } from "../src/wallet/service";
import { InboxService } from "../src/inbox/service";
import { NotifyService } from "../src/notify/service";
import { createLogger } from "@kawase/log";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
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

test("business on Arc testnet: an invoice paid by its Memo reference, a batch payout", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const business = privateKeyToAccount(generatePrivateKey());
  const payer = privateKeyToAccount(generatePrivateKey());
  const payerWallet = createWalletClient({ account: payer, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const businessWallet = createWalletClient({ account: business, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "biz", email: `biz-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: business.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains);
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let token = "";
  after(async () => {
    for (const account of [business, payer]) {
      const wallet = createWalletClient({ account, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
      const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      if (left > usdc("0.02")) {
        const hash = await wallet.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
        await client.waitForTransactionReceipt({ hash });
      }
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const drip = async (to: Hex, amount: string) => {
    const sent = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: to, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: sent.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) return state;
      await wait(POLL_MS);
    }
    return "timeout";
  };
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  // The business signs in, registers its wallet, sets it up (7702, relayed) and gets gas money; the client gets 0.1.
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "biz-test-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: business.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await business.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  assert.equal(await drip(business.address, "0.1"), "COMPLETE");
  assert.equal(await drip(payer.address, "0.15"), "COMPLETE");

  // 1. Profile and an invoice: two lines, 0.05 USDC, a link and an on-chain reference.
  await expectStatus(await call("PUT", "/business/profile", { name: "Acme Studio", address: "1 Arc Way", taxId: "GB123" }), 200, "profile");
  const created = await call("POST", "/business/invoices", { clientName: "Client Co", asset: "USDC", lines: [{ description: "Logo", quantity: 1, unitPrice: "0.03" }, { description: "Icons", quantity: 2, unitPrice: "0.01" }], dueInDays: 7 });
  await expectStatus(created, 201, "invoice");
  const { invoice } = (await created.json()) as { invoice: InvoiceView };
  assert.equal(invoice.number, "INV-0001");
  assert.equal(invoice.total, usdc("0.05").toString());
  assert.ok(invoice.token && invoice.link);

  // 2. The client opens the link: the public view, the document, and the call a browser wallet sends.
  const publicView = ((await (await app.request(`/invoices/public/${invoice.token}`)).json()) as { invoice: InvoicePublicView }).invoice;
  assert.equal(publicView.business.name, "Acme Studio");
  assert.ok(publicView.pay, "a pay call while it is open");
  const documentHtml = await (await app.request(`/invoices/public/${invoice.token}/document`)).text();
  assert.match(documentHtml, /Invoice INV-0001/);
  const payHash = await payerWallet.sendTransaction({ to: publicView.pay!.to as Hex, data: publicView.pay!.data as Hex });
  const payReceipt = await client.waitForTransactionReceipt({ hash: payHash });
  assert.equal(payReceipt.status, "success");
  console.log("invoice paid with its Memo reference", payHash);

  // 3. The watcher matches it by memoId; the request closes too.
  const auditor = new AuditWriter(db, createLogger({ service: "biz-test", level: "silent" }));
  const wallets = new WalletService(db, chains);
  const silent = createLogger({ service: "biz-test", level: "silent" });
  const inbox = new InboxService(db, chains, new NotifyService(db, { webUrl: "http://localhost" }, silent));
  const invoices = new InvoiceService(db, chains, new RequestService(db, chains, wallets, inbox, "http://localhost"), auditor, silent, "http://localhost");
  let matched = 0;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && matched === 0; attempt++) {
    matched = await invoices.scan("testnet");
    if (matched === 0) await wait(POLL_MS);
  }
  assert.equal(matched, 1);
  const paid = ((await (await call("GET", `/business/invoices/${invoice.id}`)).json()) as { invoice: InvoiceView }).invoice;
  assert.equal(paid.status, "paid");
  assert.equal(paid.payments[0]?.via, "memo");
  assert.equal(paid.payments[0]?.txHash.toLowerCase(), payHash.toLowerCase());
  const closed = ((await (await app.request(`/r/${invoice.token}`)).json()) as { request: { status: string } }).request;
  assert.equal(closed.status, "paid");

  // 4. A payout to two addresses: one self-batch transaction, both transfers in its receipt.
  const one = privateKeyToAccount(generatePrivateKey()).address;
  const two = privateKeyToAccount(generatePrivateKey()).address;
  const draft = (await (await call("POST", "/business/payouts", { asset: "USDC", lines: [{ recipient: one, amount: "0.01" }, { recipient: two, amount: "0.02" }] })).json()) as PayoutCreateResult;
  assert.ok(draft.payout, JSON.stringify(draft));
  const signRequest = (await (await call("POST", `/business/payouts/${draft.payout!.id}/sign`, {})).json()) as TransactionRequestResponse;
  const signedPayout = await businessWallet.signTransaction(toSerializable(signRequest.transaction) as never);
  const sent = ((await (await call("POST", `/business/payouts/${draft.payout!.id}/submit`, { requestId: signRequest.requestId, signedTransaction: signedPayout })).json()) as { payout: PayoutView }).payout;
  assert.equal(sent.status, "confirmed", JSON.stringify(sent));
  const payoutReceipt = await client.getTransactionReceipt({ hash: sent.txHash as Hex });
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: payoutReceipt.logs }).filter((entry) => entry.address.toLowerCase() === network.addresses.usdc.toLowerCase());
  assert.deepEqual(transfers.map((entry) => [entry.args.to.toLowerCase(), entry.args.value]).sort(), [[one.toLowerCase(), usdc("0.01")], [two.toLowerCase(), usdc("0.02")]].sort());
  console.log("payout", sent.txHash);

});
