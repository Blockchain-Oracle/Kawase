// In-app asks on Arc testnet (A5-3), with fresh local keys standing in for two Privy wallets and Circle's real ops
// wallet funding the payer: the requester splits a bill in EURC asked for by its token address (any asset, R1) with
// the payer's @handle; the payer finds "@x asked you for 0.02 EURC" in their inbox, opens the pay card from it and
// pays from Kawase; the split settles. A plain request asks the payer in the app too; a name that is nobody on
// Kawase is refused; every id lands on its own screen; hide-amounts and findable-by-email read back.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api exec tsx --test test/asks-testnet.test.ts
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { InboxItem, IntentLookup, NotificationSettings, PaymentRequest, PublicPaymentRequest, SendApproveResponse, SendIntent, SplitView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { renderNotification } from "../src/notify/render";
import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired"];
const units = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const suffix = () => randomBytes(3).toString("hex");

test("in-app asks on Arc testnet: a split in EURC asks @handle in the app, paid from the inbox", { skip: !live, timeout: 900_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const people = ["payer", "requester"].map((role) => {
    const wallet = privateKeyToAccount(generatePrivateKey());
    return { role, handle: `${role === "payer" ? "kemi" : "abu"}${suffix()}`, wallet, privy: privyPerson(`${role}-${randomUUID()}@example.test`, wallet.address) };
  });
  const { app, db, close } = testApp(chains, undefined, circleOps(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const userIds: string[] = [];
  const payer = people[0]!;
  const requester = people[1]!;
  const payerSigner = createWalletClient({ account: payer.wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  after(async () => {
    // Give what is left back to the ops wallet, so repeated runs do not drain it.
    for (const person of people) {
      const signer = createWalletClient({ account: person.wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
      for (const token of [network.addresses.eurc, network.addresses.usdc]) {
        const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [person.wallet.address] });
        const reserve = token === network.addresses.usdc ? units("0.02") : 0n;
        if (left > reserve) {
          const hash = await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - reserve] }).catch(() => undefined);
          if (hash) await client.waitForTransactionReceipt({ hash });
        }
      }
    }
    for (const id of userIds) await deleteUser(db, id);
    await close();
  });

  const signIn = async (person: (typeof people)[number]) => {
    const response = await privySignIn(app, person.privy, { platform: "ios", installationId: `asks-${person.role}-0001` });
    await expectStatus(response, 201, `${person.role} sign-in`);
    const { token, user } = (await response.json()) as { token: string; user: { id: string } };
    userIds.push(user.id);
    const call = (method: string, path: string, payload?: unknown) =>
      app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    await expectStatus(await call("PATCH", "/me", { handle: person.handle }), 200, `${person.role} handle`);
    return call;
  };
  const asPayer = await signIn(payer);
  const asRequester = await signIn(requester);

  // The payer: set up, a small allowance, and test EURC from the ops wallet (the share stays under half of it, so the
  // safety brake does not ask), plus USDC for gas (a send of any other token keeps 0.05 USDC for it).
  const { authorization } = (await (await asPayer("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signed = await payer.wallet.signAuthorization(authorization);
  await expectStatus(await asPayer("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signed.address, chainId: signed.chainId, nonce: signed.nonce, r: signed.r, s: signed.s, yParity: signed.yParity } }), 200, "setup");
  const allowance = (await (await asPayer("POST", "/wallet/allowance/request", { network: "testnet", periodAmount: units("0.2").toString() })).json()) as { grantId: string; typedData: TypedDataDefinition };
  await expectStatus(await asPayer("POST", "/wallet/allowance/submit", { grantId: allowance.grantId, signature: await payer.wallet.signTypedData(allowance.typedData) }), 200, "allowance");
  for (const [token, amount] of [[network.addresses.eurc, "0.05"], [network.addresses.usdc, "0.08"]] as const) {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: token, destinationAddress: payer.wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }

  /** Approves a send the way the app does: inside the allowance it just goes; otherwise the wallet signs. */
  const pay = async (intent: SendIntent): Promise<SendIntent> => {
    assert.equal(intent.blocking, null, `ready: ${JSON.stringify(intent.blocking)}`);
    const answer = (await (await asPayer("POST", `/sends/${intent.id}/approve`, { version: intent.version })).json()) as SendApproveResponse;
    if (answer.status === "sign") {
      const t = answer.transaction;
      const unsigned: TransactionSerializable = { type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: BigInt(t.value), gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) };
      await expectStatus(await asPayer("POST", `/sends/${intent.id}/signature`, { approvalId: answer.approvalId, signedTransaction: await payerSigner.account.signTransaction(unsigned) }), 200, "signature");
    }
    let last: SendIntent | undefined;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      last = ((await (await asPayer("GET", `/sends/${intent.id}`)).json()) as { intent: SendIntent }).intent;
      if (FINAL.includes(last.state)) return last;
      await wait(POLL_MS);
    }
    throw new Error(`send ${intent.id} did not finish: ${JSON.stringify({ state: last?.state, tx: last?.tx, blocking: last?.blocking })}`);
  };

  // 1. A split in EURC, asked for by its token address: 0.04 between the requester and @payer (0.02 each). The payer
  // is on Kawase, so their share is also asked in the app.
  const created = await asRequester("POST", "/splits", { title: "Taxi", asset: network.addresses.eurc, total: "0.04", includeMe: true, people: [{ name: `@${payer.handle}` }] });
  await expectStatus(created, 201, "split");
  const { split } = (await created.json()) as { split: SplitView };
  assert.equal(split.asset, "EURC");
  assert.equal(split.assetToken.decimals, 6);
  const mine = split.shares[0]!;
  assert.equal(mine.amount, "20000");
  assert.equal(mine.askedInApp, true, "the payer was asked in the app");
  assert.equal(mine.handle, payer.handle);

  // 2. The payer's inbox: "@requester asked you for 0.02 EURC", which opens the pay card (`/r/<token>`).
  const { items } = (await (await asPayer("GET", "/inbox")).json()) as { items: InboxItem[] };
  const asked = items.find((item) => item.kind === "request_received");
  assert.ok(asked, `an ask in the inbox: ${JSON.stringify(items)}`);
  assert.equal(asked.params.token, mine.request.token);
  assert.equal(asked.params.asset, "EURC");
  assert.equal(asked.params.amount, "20000");
  assert.equal(asked.params.name, `@${requester.handle}`);
  const words = renderNotification({ kind: asked.kind, network: asked.network, params: asked.params, requestId: asked.requestId }, "en");
  assert.equal(words.title, `Testnet · @${requester.handle} asked you for 0.02 EURC`);
  assert.equal(words.path, `/r/${mine.request.token}`);
  console.log("push:", words.title, "→", words.path);

  // 3. The pay card from that link, then the send that pays it, from Kawase.
  const card = (await (await app.request(`/r/${mine.request.token}`)).json()) as { request: PublicPaymentRequest };
  assert.equal(card.request.status, "open");
  assert.equal(card.request.requester.handle, requester.handle);
  const drafted = await asPayer("POST", "/sends", { requestToken: mine.request.token });
  await expectStatus(drafted, 201, "send for the request");
  const send = ((await drafted.json()) as { intent: SendIntent }).intent;
  const done = await pay(send);
  assert.equal(done.state, "completed", JSON.stringify(done));
  console.log("asked share paid", done.tx?.explorerUrl);
  let progress: SplitView | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    progress = ((await (await asRequester("GET", `/splits/${split.id}`)).json()) as { split: SplitView }).split;
    if (progress.status === "settled") break;
    await wait(POLL_MS);
  }
  assert.equal(progress?.status, "settled", "the only share is paid, so the split settles");
  assert.equal(progress?.collected, "20000");

  // 4. A plain request that names the payer asks them in the app too; a name that is nobody on Kawase is refused,
  // and the link stays the requester's to share.
  const plain = await asRequester("POST", "/requests", { amount: "0.01", asset: "USDC", note: "Coffee", payer: `@${payer.handle}` });
  await expectStatus(plain, 201, "request");
  const { request } = (await plain.json()) as { request: PaymentRequest };
  assert.equal(request.payer?.handle, payer.handle);
  const again = (await (await asPayer("GET", "/inbox")).json()) as { items: InboxItem[] };
  assert.ok(again.items.some((item) => item.kind === "request_received" && item.params.token === request.token && item.params.note === "Coffee"), "the plain request was asked in the app");
  const nobody = await asRequester("POST", `/requests/${request.id}/ask`, { payer: "Somebody Unknown" });
  assert.equal(nobody.status, 422);

  // 5. Every id a notification carries lands somewhere exact; another person's is not found.
  const splitLookup = (await (await asRequester("GET", `/intents/${split.id}`)).json()) as IntentLookup;
  assert.equal(splitLookup.kind, "split");
  const requestLookup = (await (await asRequester("GET", `/intents/${request.id}`)).json()) as IntentLookup;
  assert.equal(requestLookup.kind, "request");
  assert.equal((await asPayer("GET", `/intents/${split.id}`)).status, 404, "another person cannot open it");

  // 6. Hide amounts on the lock screen (default off) and findable by email (default on) read back.
  const before = (await (await asPayer("GET", "/notifications")).json()) as NotificationSettings;
  assert.equal(before.hideAmounts, false);
  const afterChange = (await (await asPayer("PATCH", "/notifications", { hideAmounts: true })).json()) as NotificationSettings;
  assert.equal(afterChange.hideAmounts, true);
  const findable = (await (await asPayer("GET", "/contacts-discovery/me")).json()) as { discoverable: boolean };
  assert.equal(findable.discoverable, true);
});
