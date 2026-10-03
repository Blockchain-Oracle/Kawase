// Business mode in a token other than USDC or EURC, on Arc testnet (R1: every asset is first-class). A fresh 8-decimal
// ERC-20 (like cirBTC) stands in for a listed token, named by its address. Covers: an invoice in that token with its own
// link (no payment request behind it), its public view and document in the token's decimals, the client paying with
// the link's `pay` call (Memo.memo → token.transfer, the CallFrom precompile keeps the payer as sender), the watcher
// matching it by memoId; a two-line payout in the same token in one self-batch transaction; and the reminders: an
// overdue notice and a due-soon notice, each once.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, parseEventLogs, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { InvoicePublicView, InvoiceView, PayoutCreateResult, PayoutView, TransactionRequestResponse } from "@kawase/api-client";
import { inboxItems } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { AuditWriter } from "../src/audit/writer";
import { InvoiceService } from "../src/business/invoices";
import { InboxService } from "../src/inbox/service";
import { renderNotification } from "../src/notify/render";
import { NotifyService } from "../src/notify/service";
import { RequestService } from "../src/requests/service";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { TEST_TOKEN_ABI, TEST_TOKEN_BYTECODE, TEST_TOKEN_DECIMALS } from "./fixtures/test-token";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const units = (value: string) => parseUnits(value, TEST_TOKEN_DECIMALS);
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

test("business in any token on Arc testnet: invoice by Memo, batch payout, reminders", { skip: !live, timeout: 900_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "biz", email: `biztok-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
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

  // The business signs in, registers and sets up its wallet; both get gas money (USDC is Arc's gas).
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "biztok-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: business.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await business.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  assert.equal(await drip(business.address, "0.1"), "COMPLETE");
  assert.equal(await drip(payer.address, "0.1"), "COMPLETE");

  // The client holds a token Kawase has never seen: 10 KTB, 8 decimals.
  const deployHash = await payerWallet.deployContract({ abi: TEST_TOKEN_ABI, bytecode: TEST_TOKEN_BYTECODE, args: ["Kawase Test Bitcoin", "KTB", units("10")] });
  const deployed = await client.waitForTransactionReceipt({ hash: deployHash });
  const tokenAddress = getAddress(deployed.contractAddress!);
  console.log("test token", tokenAddress);

  // 1. An invoice in that token, named by its address: its decimals, its own link, no payment request.
  const created = await call("POST", "/business/invoices", { clientName: "Client Co", asset: tokenAddress, lines: [{ description: "Audit", quantity: 1, unitPrice: "0.01" }, { description: "Report", quantity: 2, unitPrice: "0.0025" }], dueInDays: 7 });
  await expectStatus(created, 201, "invoice");
  const { invoice } = (await created.json()) as { invoice: InvoiceView };
  assert.equal(invoice.asset, "KTB");
  assert.equal(invoice.decimals, TEST_TOKEN_DECIMALS);
  assert.equal(invoice.tokenAddress, tokenAddress);
  assert.equal(invoice.total, units("0.015").toString());
  assert.ok(invoice.token && invoice.link, "the invoice's own link");
  await expectStatus(await app.request(`/r/${invoice.token}`), 404, "no payment request behind it");

  // 2. The client opens the link: pays the business's wallet in KTB with the Memo reference.
  const publicView = ((await (await app.request(`/invoices/public/${invoice.token}`)).json()) as { invoice: InvoicePublicView }).invoice;
  assert.equal(publicView.payTo, business.address);
  assert.equal(publicView.tokenAddress, tokenAddress);
  assert.ok(publicView.pay, "a pay call while it is open");
  const documentHtml = await (await app.request(`/invoices/public/${invoice.token}/document`)).text();
  assert.match(documentHtml, /Total 0\.015 KTB/);
  const payHash = await payerWallet.sendTransaction({ to: publicView.pay!.to as Hex, data: publicView.pay!.data as Hex });
  assert.equal((await client.waitForTransactionReceipt({ hash: payHash })).status, "success");
  console.log("KTB invoice paid with its Memo reference", payHash);

  const silent = createLogger({ service: "biztok-test", level: "silent" });
  const auditor = new AuditWriter(db, silent);
  const wallets = new WalletService(db, chains);
  const inbox = new InboxService(db, chains, new NotifyService(db, { webUrl: "http://localhost" }, silent));
  const invoices = new InvoiceService(db, chains, new RequestService(db, chains, wallets, inbox, "http://localhost"), auditor, silent, "http://localhost", undefined, inbox);
  let matched = 0;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && matched === 0; attempt++) {
    matched = await invoices.scan("testnet");
    if (matched === 0) await wait(POLL_MS);
  }
  assert.equal(matched, 1);
  const paid = ((await (await call("GET", `/business/invoices/${invoice.id}`)).json()) as { invoice: InvoiceView }).invoice;
  assert.equal(paid.status, "paid");
  assert.equal(paid.payments[0]?.amount, units("0.015").toString());
  assert.equal(paid.payments[0]?.txHash.toLowerCase(), payHash.toLowerCase());

  // 3. A payout in KTB to two addresses: one self-batch transaction, both transfers of KTB in its receipt.
  const one = privateKeyToAccount(generatePrivateKey()).address;
  const two = privateKeyToAccount(generatePrivateKey()).address;
  const draft = (await (await call("POST", "/business/payouts", { asset: tokenAddress, lines: [{ recipient: one, amount: "0.004" }, { recipient: two, amount: "0.006" }] })).json()) as PayoutCreateResult;
  assert.ok(draft.payout, JSON.stringify(draft));
  assert.equal(draft.payout!.decimals, TEST_TOKEN_DECIMALS);
  const signRequest = (await (await call("POST", `/business/payouts/${draft.payout!.id}/sign`, {})).json()) as TransactionRequestResponse;
  const signedPayout = await businessWallet.signTransaction(toSerializable(signRequest.transaction) as never);
  const sent = ((await (await call("POST", `/business/payouts/${draft.payout!.id}/submit`, { requestId: signRequest.requestId, signedTransaction: signedPayout })).json()) as { payout: PayoutView }).payout;
  assert.equal(sent.status, "confirmed", JSON.stringify(sent));
  const receipt = await client.getTransactionReceipt({ hash: sent.txHash as Hex });
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter((entry) => entry.address.toLowerCase() === tokenAddress.toLowerCase());
  assert.deepEqual(transfers.map((entry) => [entry.args.to.toLowerCase(), entry.args.value]).sort(), [[one.toLowerCase(), units("0.004")], [two.toLowerCase(), units("0.006")]].sort());
  console.log("KTB payout", sent.txHash);

  // 4. Reminders: one invoice already due (overdue), one due tomorrow (due soon); each told once.
  const overdue = ((await (await call("POST", "/business/invoices", { clientName: "Late Co", asset: tokenAddress, lines: [{ description: "Work", quantity: 1, unitPrice: "0.5" }], dueInDays: 0 })).json()) as { invoice: InvoiceView }).invoice;
  const soon = ((await (await call("POST", "/business/invoices", { clientName: "Soon Co", asset: "USDC", lines: [{ description: "Work", quantity: 1, unitPrice: "1" }], dueInDays: 1 })).json()) as { invoice: InvoiceView }).invoice;
  await invoices.remind(new Date(Date.now() + POLL_MS));
  await invoices.remind(new Date(Date.now() + POLL_MS));
  const notices = await db.select().from(inboxItems).where(and(eq(inboxItems.userId, userId)));
  const late = notices.filter((item) => item.kind === "invoice_overdue");
  const due = notices.filter((item) => item.kind === "invoice_due");
  assert.equal(late.length, 1, "one overdue notice");
  assert.equal(due.length, 1, "one due-soon notice");
  assert.equal(late[0]!.params.invoiceId, overdue.id);
  assert.equal(due[0]!.params.invoiceId, soon.id);
  const rendered = renderNotification({ kind: "invoice_overdue", network: "testnet", params: late[0]!.params }, "en");
  assert.match(rendered.body, /Late Co still owes 0\.5 KTB/);
  assert.equal(rendered.path, `/business/invoice/${overdue.id}`);
});
