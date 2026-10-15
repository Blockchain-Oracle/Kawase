// Swaps through the api on Arc testnet, with a fresh local key standing in for the Privy wallet and Circle App
// Kit quoting and building the calls (D22: the uncertain part is the composition on a real chain). Covers: naming
// one currency implies the other, a fresh quote with Circle's market rate, more than the balance is a fix not a
// refusal, a tampered signature is refused, and one signed transaction (approve + swap) whose receipt shows exactly
// the amount out and at least the minimum back. The swap's own output is not reported as money received.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { InboxItem, SwapApproveResponse, SwapIntent, UnsignedTransaction } from "@kawase/api-client";
import { createDb } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { IncomingWatcher } from "../src/incoming/watcher";
import { InboxService } from "../src/inbox/service";
import { RequestService } from "../src/requests/service";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("swaps on Arc testnet: one signed transaction, witnessed by its receipt", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const TEST_ID = randomUUID();
  const person = privyPerson(`swap-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains, undefined, undefined, appKitSwaps(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const watcherDb = createDb(process.env.DATABASE_URL!, { poolSize: 2 });
  let userId = "";
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? usdc("0.02") : 0n;
      if (left > keep) {
        const hash = await signer.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - keep] });
        await client.waitForTransactionReceipt({ hash });
      }
    }
    if (userId) await deleteUser(db, userId);
    await close();
    await watcherDb.pool.end();
  });

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "swap-test-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  const drip = await circle.createTransaction({
    walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
    blockchain: network.circleBlockchain,
    tokenAddress: network.addresses.usdc,
    destinationAddress: wallet.address,
    amount: ["0.6"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  // 1. More than the balance: a fix (add money), with the quote still shown.
  const tooMuch = ((await (await call("POST", "/swaps", { amount: "5", tokenIn: "USDC" })).json()) as { intent: SwapIntent }).intent;
  assert.equal(tooMuch.blocking?.code, "INSUFFICIENT_BALANCE");
  assert.equal(tooMuch.draft?.tokenOut, "EURC", "naming USDC implies EURC");
  await call("POST", `/swaps/${tooMuch.id}/cancel`);

  // 2. A swap the balance covers: a quote, Circle's market rate, the gap, a minimum.
  const swap = ((await (await call("POST", "/swaps", { amount: "0.5", tokenIn: "USDC" })).json()) as { intent: SwapIntent }).intent;
  assert.equal(swap.blocking, null, JSON.stringify(swap.results));
  assert.equal(swap.state, "ready_for_approval");
  const draft = swap.draft!;
  assert.equal(draft.amountIn, usdc("0.5").toString());
  assert.ok(BigInt(draft.minOut) > 0n && BigInt(draft.minOut) <= BigInt(draft.estimatedOut));
  assert.ok(draft.marketRate, "Circle's market rate is known on testnet");
  console.log("quote", draft.estimatedOut, "min", draft.minOut, "rate", draft.rate, "market", draft.marketRate, "gap bps", draft.rateGapBps);

  // 3. Approve: one transaction to the wallet itself. A tampered one is refused.
  const sign = (await (await call("POST", `/swaps/${swap.id}/approve`, { version: swap.version })).json()) as SwapApproveResponse;
  assert.equal(sign.status, "sign", JSON.stringify(sign));
  if (sign.status !== "sign") return;
  const t: UnsignedTransaction = sign.transaction;
  assert.equal(t.to.toLowerCase(), wallet.address.toLowerCase(), "the wallet sends the batch to itself");
  const unsigned: TransactionSerializable = {
    type: "eip1559",
    chainId: t.chainId,
    nonce: t.nonce,
    to: t.to,
    data: t.data,
    value: BigInt(t.value),
    gas: BigInt(t.gas),
    maxFeePerGas: BigInt(t.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
  };
  const tampered = await wallet.signTransaction({ ...unsigned, to: network.addresses.usdc });
  const refused = await call("POST", `/swaps/${swap.id}/signature`, { approvalId: sign.approvalId, signedTransaction: tampered });
  assert.equal(refused.status, 422, "a transaction that differs from the one handed out is refused");

  const again = (await (await call("POST", `/swaps/${swap.id}/approve`, { version: swap.version })).json()) as SwapApproveResponse;
  assert.equal(again.status, "sign", JSON.stringify(again));
  if (again.status !== "sign") return;
  const a = again.transaction;
  const signed = await wallet.signTransaction({
    ...unsigned,
    nonce: a.nonce,
    data: a.data,
    gas: BigInt(a.gas),
    maxFeePerGas: BigInt(a.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(a.maxPriorityFeePerGas),
  });
  await expectStatus(await call("POST", `/swaps/${swap.id}/signature`, { approvalId: again.approvalId, signedTransaction: signed }), 200, "signature");

  let done = swap;
  for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(done.state); i++) {
    await wait(POLL_MS);
    done = ((await (await call("GET", `/swaps/${swap.id}`)).json()) as { intent: SwapIntent }).intent;
  }
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.ok(done.received && BigInt(done.received) >= BigInt(draft.minOut), "at least the minimum arrived");
  const eurc = await client.readContract({ address: network.addresses.eurc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  assert.equal(eurc, BigInt(done.received!), "the wallet holds exactly what the receipt says arrived");
  console.log("swapped", done.tx?.explorerUrl, "received", done.received);

  // 4. The incoming watcher sees the EURC arrive but does not call the person's own swap "money received".
  const log = createLogger({ service: "swap-test", level: "silent" });
  const inbox = new InboxService(watcherDb.db, chains);
  const requests = new RequestService(watcherDb.db, chains, new WalletService(watcherDb.db, chains), inbox, "http://localhost:8081");
  const watcher = new IncomingWatcher(watcherDb.db, chains, requests, inbox, log);
  for (let i = 0; i < 3; i++) await watcher.tick();
  const items = ((await (await call("GET", "/inbox")).json()) as { items: InboxItem[] }).items;
  assert.ok(!items.some((item) => item.kind === "payment_received" && item.txHash?.toLowerCase() === done.tx?.hash.toLowerCase()), "a swap is not money received");
});
