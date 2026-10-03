// Automations 8c on Arc testnet (cards/automate-safety.md "Automate anything"): practice first ("would have" runs,
// dry-run on chain) → go live (Face ID signs the grant) → a real run; edit in place (narrowing at once, widening with
// a new grant and the old one's revoke); the Needs-you queue (a run the allowlist holds back waits, is approved once
// from the push, opens a send the person confirms, and settles the run; a second answer finds it answered); payroll
// (one grant per person, one run pays both); underfunded → skipped → retried once when money arrives; DCA (each run
// waits with a fresh quote); round-ups (each send's change saved into the person's own vault); a price alert on the
// executable quote. The wallet is a local key standing in for Turnkey; the ops wallet is Circle's.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test (or this file alone).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type {
  AutomationEditResponse,
  AutomationView,
  InboxItem,
  NeedsYouApproval,
  NeedsYouItem,
  SafetyChangeResponse,
  SendApproveResponse,
  SendIntent,
  SimulationView,
  TransactionRequestResponse,
} from "@kawase/api-client";
import { automations } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { queueUnderfundedRetries } from "../src/automations/retry";
import { appKitEarn } from "../src/earn/engine";
import { circleOps } from "../src/send/ops";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, signRevokeRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired", "unknown_outcome", "rejected"];
const units = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("automations 8c on Arc testnet: practice → live, edit, Needs you, payroll, underfunded retry, DCA, round-ups, price", { skip: !live, timeout: 1_500_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "auto8c", email: `auto8c-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), appKitSwaps(env), undefined, appKitEarn(env), { automationTickMs: 1000, reconcileIntervalMs: 2000 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? units("0.02") : 0n;
      if (left > keep) {
        const hash = await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] });
        await client.waitForTransactionReceipt({ hash });
      }
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const fund = async (token: Hex, amount: string) => {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: token, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  };

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "auto8c-test-phone-0001" } }));
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
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  await fund(network.addresses.usdc, "0.8");
  await fund(network.addresses.eurc, "0.2");

  const alex = privateKeyToAccount(generatePrivateKey()).address;
  const bea = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Alex", address: alex, source: "pasted" }), 201, "alex");
  await expectStatus(await call("POST", "/contacts", { displayName: "Bea", address: bea, source: "pasted" }), 201, "bea");
  const balanceOf = (token: Hex, who: Hex) => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });
  const view = async (id: string) => (await json<{ automation: AutomationView }>(call("GET", `/automations/${id}`), "view")).automation;
  const makeDue = (id: string, at = new Date(Date.now() - 1000)) => db.update(automations).set({ nextRunAt: at }).where(eq(automations.id, id));
  const until = async (id: string, check: (a: AutomationView) => boolean, what: string, attempts = POLL_ATTEMPTS) => {
    let current = await view(id);
    for (let i = 0; i < attempts && !check(current); i++) {
      await wait(POLL_MS);
      current = await view(id);
    }
    assert.ok(check(current), `${what}: ${JSON.stringify(current.runs)}`);
    return current;
  };
  const signAll = async (id: string, path = "grant") => {
    const request = await json<{ grants: { grantId: string; typedData: TypedDataDefinition }[] }>(call("POST", `/automations/${id}/${path}`), "grant");
    const signatures = [];
    for (const entry of request.grants) signatures.push({ grantId: entry.grantId, signature: await wallet.signTypedData(entry.typedData) });
    return signatures;
  };
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
  /** The person confirms a send on its card: above any allowance it is their wallet's signature. */
  const confirmSend = async (intent: SendIntent) => {
    assert.equal(intent.blocking, null, `send ready: ${JSON.stringify(intent.results)}`);
    const answer = await json<SendApproveResponse>(call("POST", `/sends/${intent.id}/approve`, { version: intent.version }), "approve send");
    if (answer.status === "sign") {
      const signed = await json<SendApproveResponse>(call("POST", `/sends/${intent.id}/signature`, { approvalId: answer.approvalId, signedTransaction: await signTx({ requestId: answer.approvalId, transaction: answer.transaction }) }), "signature");
      assert.ok(signed.status === "executing" || signed.status === "final", `signature: ${JSON.stringify({ status: signed.status, state: signed.intent.state, results: signed.intent.results })}`);
    } else assert.ok(answer.status === "executing", `approve: ${JSON.stringify({ status: answer.status, state: answer.intent.state, results: answer.intent.results })}`);
    return waitSend(intent.id);
  };
  const inbox = async () => (await json<{ items: InboxItem[] }>(call("GET", "/inbox"), "inbox")).items;

  // 1. Practice first: on without a grant; the dry run says it would go; two runs become "would have"; Alex gets nothing.
  const draft = (await json<{ automation: AutomationView }>(call("POST", "/automations", { recipient: "Alex", amount: "0.05", every: "week", weekday: 1, time: "09:00", timezone: "Africa/Lagos" }), "draft", 201)).automation;
  assert.equal(draft.blocking, null, JSON.stringify(draft.results));
  const practising = (await json<{ automation: AutomationView }>(call("POST", `/automations/${draft.id}/practice`), "practice")).automation;
  assert.equal(practising.status, "active");
  assert.equal(practising.practice, true);
  const simulated = await json<SimulationView>(call("POST", `/automations/${draft.id}/simulate`), "simulate");
  assert.equal(simulated.runs.length, 3);
  assert.equal(simulated.runs[0]!.outcome, "would_send", JSON.stringify(simulated.runs[0]));
  assert.equal(simulated.runs[0]!.chain?.ok, true);
  await makeDue(draft.id, new Date(Date.now() - 5000));
  await until(draft.id, (a) => a.runs.filter((run) => run.status === "practiced").length >= 1, "first practice run");
  await makeDue(draft.id, new Date(Date.now() - 2000));
  const practised = await until(draft.id, (a) => a.runs.filter((run) => run.status === "practiced").length >= 2, "second practice run");
  assert.ok(practised.runs.filter((run) => run.status === "practiced").every((run) => run.practice?.ok), "the chain would have accepted both");
  assert.equal(await balanceOf(network.addresses.usdc, alex), 0n, "practice moved nothing");

  // 2. Go live: Face ID signs the grant; a real run lands.
  const on = (await json<{ automation: AutomationView }>(call("POST", `/automations/${draft.id}/activate`, { signatures: await signAll(draft.id) }), "go live")).automation;
  assert.equal(on.practice, false);
  assert.equal(on.grant?.status, "active");
  await makeDue(draft.id);
  const ran = await until(draft.id, (a) => a.runs.some((run) => run.status === "succeeded"), "live run");
  console.log("live run after practice", ran.runs.find((run) => run.status === "succeeded")?.tx?.explorerUrl);
  assert.equal(await balanceOf(network.addresses.usdc, alex), units("0.05"));

  // 3. Edit in place: less is at once; more needs a new grant (and the old one's revoke) signed together.
  const narrower = await json<AutomationEditResponse>(call("PATCH", `/automations/${draft.id}`, { amount: "0.03" }), "narrow");
  assert.equal(narrower.grant, null);
  assert.equal(narrower.automation.action?.amount, units("0.03").toString());
  const wider = await json<AutomationEditResponse>(call("PATCH", `/automations/${draft.id}`, { amount: "0.08" }), "widen");
  assert.ok(wider.grant && wider.revoke, "a new grant to sign and the old one's revoke");
  // The old grant's revoke goes with the new grant: the api turns it off on chain before the edit applies.
  const widened = (await json<{ automation: AutomationView }>(call("POST", `/automations/${draft.id}/edit/activate`, { signatures: [{ grantId: wider.grant!.grants[0]!.grantId, signature: await wallet.signTypedData(wider.grant!.grants[0]!.typedData as TypedDataDefinition) }], revoke: await signRevokeRequest(wallet, wider.revoke!) }), "edit activate")).automation;
  assert.equal(widened.action?.amount, units("0.08").toString());

  // 4. Needs you: with "only my allowlist" on, the run waits for the person instead of paying.
  assert.equal((await json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: { kind: "allowlist_only", on: true } }), "allowlist on")).status, "applied");
  await makeDue(draft.id);
  const waiting = await until(draft.id, (a) => a.runs.some((run) => run.status === "needs_you"), "needs you");
  const runWaiting = waiting.runs.find((run) => run.status === "needs_you")!;
  assert.equal(runWaiting.reason, "NOT_ON_ALLOWLIST");
  const queue = await json<{ items: NeedsYouItem[]; pending: number }>(call("GET", "/needs-you"), "needs you list");
  assert.equal(queue.pending, 1);
  const item = queue.items[0]!;
  assert.ok((await inbox()).some((entry) => entry.kind === "needs_you" && entry.params.itemId === item.id), "told in the inbox (and by push)");
  // Approved from the push; a second answer from another device finds it answered.
  const opened = await json<NeedsYouApproval>(call("POST", `/needs-you/${item.id}/approve`, { via: "push" }), "approve");
  assert.equal(opened.status, "opened");
  const again = await json<NeedsYouApproval>(call("POST", `/needs-you/${item.id}/approve`, { via: "web" }), "approve again");
  assert.equal(again.status, "answered");
  assert.equal(again.item.decidedVia, "push");
  if (opened.status !== "opened" || opened.kind !== "send") throw new Error("expected a send");
  const confirmed = await confirmSend(opened.intent);
  assert.equal(confirmed.outcome, "sent", JSON.stringify(confirmed));
  console.log("Needs you → approved → sent", confirmed.tx?.explorerUrl);
  await until(draft.id, (a) => a.runs.find((run) => run.id === runWaiting.id)?.status === "succeeded", "the waiting run settles");
  // The allowlist back off (loosening: the wallet's signature).
  const off = await json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: { kind: "allowlist_only", on: false } }), "allowlist off");
  if (off.status !== "needs_approval") throw new Error("turning the allowlist off needs a signature");
  await json(call("POST", `/safety/changes/${off.changeId}/approve`, { signature: await wallet.signTypedData(off.approval.typedData as unknown as TypedDataDefinition) }), "allowlist off approve");
  await call("POST", `/automations/${draft.id}/pause`);

  // 5. Payroll: one grant per person, one run pays both.
  const payroll = (await json<{ automation: AutomationView }>(call("POST", "/automations/payroll", { lines: [{ recipient: "Alex", amount: "0.02" }, { recipient: "Bea", amount: "0.03" }], every: "month", monthday: 1 }), "payroll", 201)).automation;
  assert.equal(payroll.blocking, null, JSON.stringify(payroll.results));
  assert.equal(payroll.payroll?.lines.length, 2);
  const payrollOn = (await json<{ automation: AutomationView }>(call("POST", `/automations/${payroll.id}/activate`, { signatures: await signAll(payroll.id) }), "payroll on")).automation;
  assert.equal(payrollOn.status, "active");
  const beaBefore = await balanceOf(network.addresses.usdc, bea);
  await makeDue(payroll.id);
  await until(payroll.id, (a) => a.runs.some((run) => run.status === "succeeded"), "payroll run", POLL_ATTEMPTS * 3);
  assert.equal((await balanceOf(network.addresses.usdc, bea)) - beaBefore, units("0.03"));
  console.log("payroll paid Alex and Bea");

  // 6. Underfunded: skipped and told; money arrives; tried once more, and it goes.
  const big = (await json<{ automation: AutomationView }>(call("POST", "/automations", { recipient: "Bea", amount: "0.3", asset: "EURC", every: "week", weekday: 3 }), "big", 201)).automation;
  await json(call("POST", `/automations/${big.id}/activate`, { signatures: await signAll(big.id) }), "big on");
  await makeDue(big.id);
  await until(big.id, (a) => a.runs.some((run) => run.reason === "INSUFFICIENT_BALANCE"), "underfunded skip");
  assert.ok((await inbox()).some((entry) => entry.kind === "automation_skipped" && entry.params.reason === "INSUFFICIENT_BALANCE"));
  await fund(network.addresses.eurc, "0.3");
  assert.equal(await queueUnderfundedRetries(db, userId, "testnet"), 1, "one retry queued");
  assert.equal(await queueUnderfundedRetries(db, userId, "testnet"), 0, "never twice");
  const retried = await until(big.id, (a) => a.runs.some((run) => run.status === "succeeded"), "retry on money in");
  console.log("underfunded run retried on money in", retried.runs.find((run) => run.status === "succeeded")?.tx?.explorerUrl);
  await call("POST", `/automations/${big.id}/pause`);

  // 7. DCA: each run waits in Needs you with a fresh quote; approving opens the swap for the person to confirm.
  const dca = (await json<{ automation: AutomationView }>(call("POST", "/automations/dca", { from: "dollars", to: "euros", amount: "0.02", every: "day" }), "dca", 201)).automation;
  assert.equal(dca.blocking, null, JSON.stringify(dca.results));
  await json(call("POST", `/automations/${dca.id}/activate`, { signatures: [] }), "dca on");
  await makeDue(dca.id);
  const dcaWaiting = await until(dca.id, (a) => a.runs.some((run) => run.status === "needs_you"), "dca waits");
  const swapItem = (await json<{ items: NeedsYouItem[] }>(call("GET", "/needs-you"), "queue")).items.find((entry) => entry.automationId === dca.id)!;
  assert.equal(swapItem.request.type, "swap");
  console.log("DCA quote now", swapItem.request.type === "swap" ? swapItem.request.quotedOut : null, dcaWaiting.runs[0]?.reason);
  const swapOpened = await json<NeedsYouApproval>(call("POST", `/needs-you/${swapItem.id}/approve`, {}), "approve swap");
  assert.ok(swapOpened.status === "opened" && swapOpened.kind === "swap", "a swap for the person to confirm");
  await call("POST", `/automations/${dca.id}/pause`);

  // 8. Round-ups: each of the person's own sends puts its change (to the next 0.1) into their own vault.
  const roundUps = (await json<{ automation: AutomationView }>(call("POST", "/automations/rule", { trigger: "money_out", action: "save", roundTo: "0.1" }), "round-ups", 201)).automation;
  assert.equal(roundUps.blocking, null, JSON.stringify(roundUps.results));
  await json(call("POST", `/automations/${roundUps.id}/activate`, { signatures: await signAll(roundUps.id) }), "round-ups on");
  const spend = (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient: "Alex", amount: "0.03", asset: "USDC" }), "spend", 201)).intent;
  const spent = await confirmSend(spend);
  assert.equal(spent.outcome, "sent");
  const saved = await until(roundUps.id, (a) => a.runs.some((run) => run.status === "succeeded" || run.status === "failed" || run.status === "skipped"), "round-up run");
  const roundRun = saved.runs[0]!;
  assert.equal(roundRun.status, "succeeded", JSON.stringify(roundRun));
  assert.equal(roundRun.trigger?.amount, units("0.07").toString(), "0.03 rounded up to 0.1 saves 0.07");
  console.log("round-up saved", roundRun.tx?.explorerUrl);

  // 9. A price, on the executable quote: "tell me when 0.05 USDC buys at least 0.000001 EURC".
  const price = (await json<{ automation: AutomationView }>(call("POST", "/automations/rule", { trigger: "price", tokenIn: "USDC", tokenOut: "EURC", priceAmount: "0.05", minOut: "0.000001", action: "notify" }), "price", 201)).automation;
  assert.equal(price.blocking, null, JSON.stringify(price.results));
  await json(call("POST", `/automations/${price.id}/activate`, { signatures: [] }), "price on");
  let alerted = false;
  for (let i = 0; i < 20 && !alerted; i++) {
    await wait(POLL_MS);
    alerted = (await inbox()).some((entry) => entry.kind === "rule_alert" && entry.params.trigger === "price");
  }
  console.log(alerted ? "price alert fired on the live quote" : "no testnet quote for USDC→EURC right now (the rule waits)");
});
