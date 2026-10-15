// Everyday money on Arc testnet (A5-2), with fresh local keys standing in for two Privy wallets and Circle's real
// ops wallet funding the payer: scan to pay (an EIP-681 code read by the api, then the send it opens, executed), split
// a bill (the requester splits, the payer pays their share from its link, the split shows who has paid), and the
// same send found again by id the way a notification opens it (`/i/<id>`).
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api exec tsx --test test/everyday-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import type { IntentLookup, PayCodeView, SendApproveResponse, SendIntent, SplitView, SwapIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { circleOps } from "../src/send/ops";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("everyday money on Arc testnet: scan to pay, split a bill, open by id", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const people = ["payer", "requester"].map((role) => {
    const wallet = privateKeyToAccount(generatePrivateKey());
    return { role, wallet, privy: privyPerson(`${role}-${randomUUID()}@example.test`, wallet.address) };
  });
  const { app, db, close } = testApp(chains, undefined, circleOps(env), appKitSwaps(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const userIds: string[] = [];
  const payer = people[0]!;
  const requester = people[1]!;
  const payerSigner = createWalletClient({ account: payer.wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  after(async () => {
    // Give what is left back to the ops wallet, so repeated runs do not drain it.
    for (const person of people) {
      const signer = createWalletClient({ account: person.wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
      const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [person.wallet.address] });
      const reserve = usdc("0.02");
      if (left > reserve) {
        const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - reserve] }).catch(() => undefined);
        if (hash) await client.waitForTransactionReceipt({ hash });
      }
    }
    for (const id of userIds) await deleteUser(db, id);
    await close();
  });

  const signIn = async (person: (typeof people)[number]) => {
    const response = await privySignIn(app, person.privy, { platform: "ios", installationId: `everyday-${person.role}-0001` });
    await expectStatus(response, 201, `${person.role} sign-in`);
    const { token, user } = (await response.json()) as { token: string; user: { id: string } };
    userIds.push(user.id);
    const call = (method: string, path: string, payload?: unknown) =>
      app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    return call;
  };
  const asPayer = await signIn(payer);
  const asRequester = await signIn(requester);

  // The payer: set up, a small allowance, and test money from the ops wallet.
  const setup = async (call: typeof asPayer, account: PrivateKeyAccount) => {
    const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
    const signed = await account.signAuthorization(authorization);
    await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signed.address, chainId: signed.chainId, nonce: signed.nonce, r: signed.r, s: signed.s, yParity: signed.yParity } }), 200, "setup");
  };
  await setup(asPayer, payer.wallet);
  const allowance = (await (await asPayer("POST", "/wallet/allowance/request", { network: "testnet", periodAmount: usdc("0.2").toString() })).json()) as { grantId: string; typedData: TypedDataDefinition };
  await expectStatus(await asPayer("POST", "/wallet/allowance/submit", { grantId: allowance.grantId, signature: await payer.wallet.signTypedData(allowance.typedData) }), 200, "allowance");
  const drip = await circle.createTransaction({
    walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
    blockchain: network.circleBlockchain,
    tokenAddress: network.addresses.usdc,
    destinationAddress: payer.wallet.address,
    amount: ["0.2"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  /** Approves a send the way the app does: inside the allowance it just goes; above it the wallet signs. */
  const pay = async (intent: SendIntent): Promise<SendIntent> => {
    assert.equal(intent.blocking, null, `ready: ${JSON.stringify(intent.blocking)}`);
    const answer = (await (await asPayer("POST", `/sends/${intent.id}/approve`, { version: intent.version })).json()) as SendApproveResponse;
    if (answer.status === "sign") {
      const t = answer.transaction;
      const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
      await expectStatus(await asPayer("POST", `/sends/${intent.id}/signature`, { approvalId: answer.approvalId, signedTransaction: await payerSigner.account.signTransaction(unsigned) }), 200, "signature");
    }
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const { intent: now } = (await (await asPayer("GET", `/sends/${intent.id}`)).json()) as { intent: SendIntent };
      if (FINAL.includes(now.state)) return now;
      await wait(POLL_MS);
    }
    throw new Error(`send ${intent.id} did not finish`);
  };

  // 1. Scan to pay: the requester's EIP-681 code, read by the api, opens a send of 0.02 USDC to them; it goes.
  const code = `ethereum:${network.addresses.usdc}@${network.chainId}/transfer?address=${requester.wallet.address}&uint256=2e4`;
  const read = (await (await asPayer("POST", "/pay-codes/resolve", { code })).json()) as PayCodeView;
  assert.equal(read.status, "send");
  if (read.status !== "send") return;
  assert.equal(read.to.toLowerCase(), requester.wallet.address.toLowerCase());
  assert.equal(read.amount, "0.02");
  assert.equal(read.asset, "USDC");
  const scanned = ((await (await asPayer("POST", "/sends", { recipient: read.to, amount: read.amount, asset: read.asset })).json()) as { intent: SendIntent }).intent;
  const scannedDone = await pay(scanned);
  assert.equal(scannedDone.state, "completed", JSON.stringify(scannedDone));
  console.log("scan to pay", scannedDone.tx?.explorerUrl);

  // 2. Split a bill: 0.06 between the requester and two people (0.02 each); the payer pays Bob's share from its link.
  const created = await asRequester("POST", "/splits", { title: "Dinner", asset: "USDC", total: "0.06", includeMe: true, people: [{ name: "Bob" }, { name: "Carol" }] });
  await expectStatus(created, 201, "split");
  const { split } = (await created.json()) as { split: SplitView };
  assert.deepEqual(split.shares.map((share) => share.amount), ["20000", "20000"]);
  assert.equal(split.myShare, "20000");
  const bob = split.shares[0]!;
  const fromLink = (await (await asPayer("POST", "/pay-codes/resolve", { code: bob.request.link })).json()) as PayCodeView;
  assert.equal(fromLink.status, "request", JSON.stringify(fromLink));
  const share = ((await (await asPayer("POST", "/sends", { requestToken: bob.request.token })).json()) as { intent: SendIntent }).intent;
  const shareDone = await pay(share);
  assert.equal(shareDone.state, "completed", JSON.stringify(shareDone));
  console.log("split share paid", shareDone.tx?.explorerUrl);
  let progress: SplitView | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    progress = ((await (await asRequester("GET", `/splits/${split.id}`)).json()) as { split: SplitView }).split;
    if (progress.paidCount === 1) break;
    await wait(POLL_MS);
  }
  assert.equal(progress?.paidCount, 1, "Bob's share shows paid");
  assert.equal(progress?.collected, "20000");
  assert.equal(progress?.status, "open", "Carol has not paid yet");

  // 3. The same send by id, as a push, the inbox or an email opens it (`/i/<id>`): its kind and network; another
  // person's id is not found.
  const lookup = await asPayer("GET", `/intents/${scanned.id}`);
  await expectStatus(lookup, 200, "lookup");
  const found = (await lookup.json()) as IntentLookup;
  assert.equal(found.kind, "send");
  assert.equal(found.network, "testnet");
  if (found.kind === "send") assert.equal(found.intent.state, "completed");
  assert.equal((await asRequester("GET", `/intents/${scanned.id}`)).status, 404, "another person cannot open it");

  // 4. Resolve and resume: a swap asked for before the wallet was set up waits on that; once set up, the same swap
  // (same id, a new version) is checked again and that blocker is gone.
  const swap = ((await (await asRequester("POST", "/swaps", { amount: "0.01", tokenIn: "USDC", tokenOut: "EURC" })).json()) as { intent: SwapIntent }).intent;
  assert.ok(swap.blocking && /WALLET/.test(swap.blocking.code), `waits on setup: ${JSON.stringify(swap.blocking)}`);
  await setup(asRequester, requester.wallet);
  const resumed = ((await (await asRequester("PATCH", `/swaps/${swap.id}`, {})).json()) as { intent: SwapIntent }).intent;
  assert.equal(resumed.id, swap.id, "the same swap");
  assert.ok(resumed.version > swap.version, "a new version");
  assert.ok(!resumed.blocking || !/WALLET/.test(resumed.blocking.code), `setup no longer blocks: ${JSON.stringify(resumed.blocking)}`);
  console.log("swap resumed after setup", resumed.blocking?.code ?? "ready", resumed.draft?.estimatedOut ?? "");
  await asRequester("POST", `/swaps/${swap.id}/cancel`);
});
