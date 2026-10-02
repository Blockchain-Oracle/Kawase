// Chat has the same reach as the screens (B2-2), on Arc testnet with the real model, prompt and tools: a batch payout
// proposed in chat and paid as the card pays it (one self-batch transaction, both transfers in its receipt); an
// invoice made and listed with its status; why the payout happened (its decision record); the week's
// report; a month's export through its short-lived link (no session); a laptop signed out from the devices card; and
// "delete my account" that only proposes (the account is still there). Fresh local keys stand in for the Turnkey wallet.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEventLogs, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { createModels } from "@kawase/agent";
import type {
  DeleteAccountProposal,
  DeviceSignOutProposal,
  ExplainOutput,
  ExportLinkOutput,
  InvoiceListOutput,
  PayoutProposal,
  PayoutView,
  TransactionRequestResponse,
  WeeklyReportOutput,
} from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY && (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY));
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

type Part = { type: string; state?: string; output?: unknown };

test("chat runs business, history and account on Arc testnet", { skip: !live, timeout: 1_200_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const business = privateKeyToAccount(generatePrivateKey());
  const businessWallet = createWalletClient({ account: business, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const phoneKey = turnkeyStyleKeyPair();
  const laptopKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "chatbiz", email: `chatbiz-${SUB_ORG}@example.test`, sessionPublicKeys: [phoneKey.publicKeyHex, laptopKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: business.address }] },
  );
  const models = createModels({ ...(process.env.OPENAI_API_KEY ? { openai: process.env.OPENAI_API_KEY } : {}), ...(process.env.ANTHROPIC_API_KEY ? { anthropic: process.env.ANTHROPIC_API_KEY } : {}) });
  const { app, db, close } = testApp(turnkey, chains, undefined, undefined, undefined, undefined, undefined, { models });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [business.address] });
    if (left > usdc("0.02")) {
      const hash = await businessWallet.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
      await client.waitForTransactionReceipt({ hash });
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
  const signIn = async (key: typeof phoneKey, installationId: string) => {
    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
    const response = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId } }));
    await expectStatus(response, 201, "sign-in");
    return ((await response.json()) as { token: string }).token;
  };
  const token = await signIn(phoneKey, "chatbiz-phone-0001");
  await signIn(laptopKey, "chatbiz-laptop-0001");
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  // The laptop is named, as its app would on first open.
  const { devices } = (await (await call("GET", "/account/devices")).json()) as { devices: { id: string; current: boolean }[] };
  const laptop = devices.find((device) => !device.current)!;
  await expectStatus(await call("PATCH", "/account/devices/current", { name: "Test iPhone" }), 204, "name phone");

  await expectStatus(await call("POST", "/wallet", { address: business.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await business.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  assert.equal(await drip(business.address, "0.1"), "COMPLETE");

  // One chat thread; each turn is read back from the stored conversation, as the app reloads it.
  const thread = randomUUID();
  const say = async (text: string, tool: string): Promise<unknown> => {
    const response = await call("POST", "/agent/chat", { id: thread, message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }] } });
    await expectStatus(response, 200, `turn: ${text}`);
    await response.text();
    const { messages } = (await (await call("GET", `/agent/threads/${thread}`)).json()) as { messages: { role: string; parts: Part[] }[] };
    const parts = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.parts : [];
    const found = parts.find((part) => part.type === `tool-${tool}` && part.state === "output-available");
    assert.ok(found, `${text} → ${tool} (got ${parts.map((part) => part.type).join(", ")})`);
    console.log(`"${text}" → ${tool}`);
    return found.output;
  };

  // 1. A batch payout from chat: the card's one Face ID pays both in one transaction.
  const one = privateKeyToAccount(generatePrivateKey()).address;
  const two = privateKeyToAccount(generatePrivateKey()).address;
  const { proposal } = (await say(`Pay ${one} 0.01 USDC and ${two} 0.02 USDC in one go`, "propose_payout")) as { proposal: PayoutProposal };
  assert.equal(proposal.status, "ready", JSON.stringify(proposal));
  const payout = (proposal as { payout: PayoutView }).payout;
  assert.equal(payout.lines.length, 2);
  const signRequest = (await (await call("POST", `/business/payouts/${payout.id}/sign`, {})).json()) as TransactionRequestResponse;
  const signed = await businessWallet.signTransaction(toSerializable(signRequest.transaction) as never);
  const sent = ((await (await call("POST", `/business/payouts/${payout.id}/submit`, { requestId: signRequest.requestId, signedTransaction: signed })).json()) as { payout: PayoutView }).payout;
  assert.equal(sent.status, "confirmed", JSON.stringify(sent));
  const receipt = await client.getTransactionReceipt({ hash: sent.txHash as Hex });
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter((entry) => entry.address.toLowerCase() === network.addresses.usdc.toLowerCase() && entry.args.from.toLowerCase() === business.address.toLowerCase());
  assert.deepEqual(transfers.map((entry) => [entry.args.to.toLowerCase(), entry.args.value]).sort(), [[one.toLowerCase(), usdc("0.01")], [two.toLowerCase(), usdc("0.02")]].sort());
  console.log("chat payout", sent.txHash);

  // 2. Why it happened: its decision record names the payout.
  const why = ((await say(`Why did transaction ${sent.txHash} happen?`, "explain_transaction")) as { output: ExplainOutput }).output;
  assert.equal(why.status, "ready", JSON.stringify(why));
  assert.equal((why as { why: { kind: string } }).why.kind, "payout");

  // 3. An invoice, then the open invoices with their status.
  await expectStatus(await call("PUT", "/business/profile", { name: "Chat Studio" }), 200, "profile");
  await say("Invoice Acme 0.05 USDC for the logo, due in a week", "create_invoice");
  const list = ((await say("Which of my invoices are still unpaid?", "list_invoices")) as { list: InvoiceListOutput }).list;
  assert.equal(list.status, "ready");
  assert.ok((list as { invoices: { clientName: string; status: string }[] }).invoices.some((invoice) => invoice.clientName.includes("Acme") && invoice.status === "open"));

  // 5. The week's report and this month's export, opened through its link without the session.
  const report = ((await say("How did I do this week?", "weekly_report")) as { output: WeeklyReportOutput }).output;
  assert.equal(report.status, "ready");
  const link = ((await say("Export this month's history as CSV for my accountant", "export_history")) as { link: ExportLinkOutput }).link;
  assert.equal(link.status, "ready", JSON.stringify(link));
  const file = await app.request((link as { path: string }).path);
  await expectStatus(file, 200, "export link");
  assert.match(file.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(await file.text(), /^date,/);
  await expectStatus(await app.request(`${(link as { path: string }).path}x`), 404, "a forged link");

  // 6. "Sign out my laptop": the card names it; the person's tap signs it out.
  const devicesCard = ((await say("Sign out my laptop", "sign_out_device")) as { proposal: DeviceSignOutProposal }).proposal;
  assert.equal(devicesCard.status, "proposed");
  assert.ok((devicesCard as { devices: { id: string }[] }).devices.some((device) => device.id === laptop.id), `${laptop.id} in ${JSON.stringify(devicesCard)}`);
  await expectStatus(await call("POST", `/account/devices/${laptop.id}/sign-out`, {}), 200, "sign out from the card");

  // 7. "Delete my account" only proposes: the account is still here.
  const deletion = ((await say("Delete my Kawase account", "delete_account")) as { proposal: DeleteAccountProposal }).proposal;
  assert.equal(deletion.status, "proposed");
  assert.equal((await call("GET", "/me")).status, 200, "nothing was deleted from chat");
});
