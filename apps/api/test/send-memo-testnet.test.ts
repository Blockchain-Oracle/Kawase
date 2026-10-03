// Send with an on-chain reference (Arc Memo), on Arc testnet: a business invoices in EURC; the payer — a Kawase wallet
// (an EOA with EIP-7702 code) — scans the invoice's link and pays its request from Kawase: the send carries the
// invoice's reference by itself, goes through Memo (never the allowance), the receipt carries the Memo event with the
// invoice's memoId and the wallet as sender, and B2's invoice watcher matches it by that reference. An EIP-681 link
// with memo/memoId parameters carries them too. Skipped without the server keys in the root .env.
// Run: pnpm --filter @kawase/api exec tsx --test test/send-memo-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, parseEventLogs, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { InvoiceView, PayCodeView, SendApproveResponse, SendIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { AuditWriter } from "../src/audit/writer";
import { InvoiceService } from "../src/business/invoices";
import { InboxService } from "../src/inbox/service";
import { NotifyService } from "../src/notify/service";
import { parsePayCode } from "../src/paycodes/parse";
import { RequestService } from "../src/requests/service";
import { WalletService } from "../src/wallet/service";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "rejected"];
const SIX = 6;
const units = (value: string) => parseUnits(value, SIX);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MEMO_EVENT = parseAbi(["event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)"]);

test("send with an on-chain reference pays an invoice by its memoId", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const business = privateKeyToAccount(generatePrivateKey());
  const payer = privateKeyToAccount(generatePrivateKey());
  const payerSigner = createWalletClient({ account: payer, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const people = [
    { sub: randomUUID(), user: randomUUID(), key: turnkeyStyleKeyPair(), account: business, name: "biz" },
    { sub: randomUUID(), user: randomUUID(), key: turnkeyStyleKeyPair(), account: payer, name: "payer" },
  ];
  const turnkey = fakeTurnkey(
    Object.fromEntries(people.map((p) => [`${p.sub}/${p.user}`, { userId: p.user, userName: p.name, email: `${p.name}-${p.sub}@example.test`, sessionPublicKeys: [p.key.publicKeyHex] }])),
    Object.fromEntries(people.map((p) => [p.sub, [{ walletId: "wallet-1", address: p.account.address }]])),
  );
  const { app, db, close } = testApp(turnkey, chains);
  const userIds: string[] = [];
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [payer.address] });
      const keep = token === network.addresses.usdc ? units("0.02") : 0n;
      if (left > keep) await client.waitForTransactionReceipt({ hash: await payerSigner.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] }) });
    }
    for (const id of userIds) await deleteUser(db, id);
    await close();
  });

  const signIn = async (person: (typeof people)[number]) => {
    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: person.sub, activityId: nonce });
    const response = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, person.key) }, turnkeyUserId: person.user, device: { platform: "ios", installationId: `memo-${person.name}-0001` } }));
    await expectStatus(response, 201, "sign-in");
    const { token, user } = (await response.json()) as { token: string; user: { id: string } };
    userIds.push(user.id);
    const call = (method: string, path: string, payload?: unknown) =>
      app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    await expectStatus(await call("POST", "/wallet", { address: person.account.address, walletId: "wallet-1" }), 201, "register");
    const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
    const auth = await person.account.signAuthorization(authorization);
    await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity } }), 200, "setup");
    return call;
  };
  const biz = await signIn(people[0]!);
  const pay = await signIn(people[1]!);
  for (const [tokenAddress, amount] of [[network.addresses.usdc, "0.2"], [network.addresses.eurc, "0.15"]] as const) {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress, destinationAddress: payer.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }

  // The business invoices 0.1 EURC.
  const created = await biz("POST", "/business/invoices", { clientName: "Payer Co", asset: "EURC", lines: [{ description: "Design", quantity: 1, unitPrice: "0.1" }], dueInDays: 7 });
  await expectStatus(created, 201, "invoice");
  const { invoice } = (await created.json()) as { invoice: InvoiceView };

  // An EIP-681 link carries a reference too (memo text and its bytes32 id).
  const parsed = parsePayCode(`ethereum:${network.addresses.eurc}@${network.chainId}/transfer?address=${business.address}&uint256=40000&memo=${invoice.number}&memoId=${invoice.memoId}`, [], () => SIX);
  assert.equal(parsed.kind === "address" && parsed.memo, invoice.number);
  assert.equal(parsed.kind === "address" && parsed.memoId, invoice.memoId.toLowerCase());

  // The payer scans the invoice's link: its payment request opens; paying it from Kawase carries the reference.
  const code = (await (await pay("POST", "/pay-codes/resolve", { code: invoice.link })).json()) as PayCodeView;
  assert.equal(code.status, "request", JSON.stringify(code));
  if (code.status !== "request") return;
  const send = ((await (await pay("POST", "/sends", { requestToken: code.token })).json()) as { intent: SendIntent }).intent;
  assert.equal(send.blocking, null, JSON.stringify(send.results));
  assert.equal(send.route, "wallet_signature", "a reference never rides the allowance");
  assert.equal(send.draft?.memo?.memoData, invoice.number);
  // Paying most of the balance to a new address trips the Brake (A3): the person confirms the override on the card.
  const sign = (await (await pay("POST", `/sends/${send.id}/approve`, { version: send.version, override: true })).json()) as SendApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  assert.equal(sign.transaction.to.toLowerCase(), network.addresses.memo.toLowerCase(), "the wallet calls Arc's Memo contract");
  const t = sign.transaction;
  const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to as Hex, data: t.data as Hex, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
  await expectStatus(await pay("POST", `/sends/${send.id}/signature`, { approvalId: sign.approvalId, signedTransaction: await payer.signTransaction(unsigned) }), 200, "signature");
  let done: SendIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !FINAL.includes(done?.state ?? ""); attempt++) {
    await wait(POLL_MS);
    done = ((await (await pay("GET", `/sends/${send.id}`)).json()) as { intent: SendIntent }).intent;
  }
  assert.equal(done?.state, "completed", JSON.stringify(done));
  const receipt = await client.getTransactionReceipt({ hash: done!.tx!.hash as Hex });
  const memos = parseEventLogs({ abi: MEMO_EVENT, logs: receipt.logs });
  assert.equal(memos[0]?.args.memoId.toLowerCase(), invoice.memoId.toLowerCase(), "the Memo event names the invoice");
  assert.equal(memos[0]?.args.sender.toLowerCase(), payer.address.toLowerCase(), "the Kawase wallet itself is the sender");
  console.log("paid by reference", done?.tx?.explorerUrl);

  // B2's invoice watcher matches it by the memoId: a part payment.
  const silent = createLogger({ service: "memo-test", level: "silent" });
  const wallets = new WalletService(db, chains);
  const inbox = new InboxService(db, chains, new NotifyService(db, { webUrl: "http://localhost" }, silent));
  const invoices = new InvoiceService(db, chains, new RequestService(db, chains, wallets, inbox, "http://localhost"), new AuditWriter(db, silent), silent, "http://localhost", undefined, inbox);
  let matched = 0;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && matched === 0; attempt++) {
    matched = await invoices.scan("testnet");
    if (matched === 0) await wait(POLL_MS);
  }
  assert.ok(matched >= 1, "the invoice watcher found the payment by its reference");
  const after_ = ((await (await biz("GET", `/business/invoices/${invoice.id}`)).json()) as { invoice: InvoiceView }).invoice;
  assert.equal(after_.status, "paid");
  assert.equal(after_.payments.length, 1, "one payment, recorded once");
  assert.equal(after_.payments[0]?.amount, units("0.1").toString());
});
