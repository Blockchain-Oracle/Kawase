// Sends through the api on Arc testnet, with a fresh local key standing in for the Privy wallet and Circle's
// real ops wallet redeeming the allowance (D22: the uncertain part is how our pieces compose on a real chain).
// Covers: a contact send inside the allowance with a double tap, the receipt witness, the address-change freeze
// and its cancel, an unknown name resolved by saving the contact (resolve and resume), and a send above the
// allowance signed by the wallet, including a tampered signature that is refused.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { SendApproveResponse, SendIntent, UnsignedTransaction } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(
  process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY,
);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const FINAL = ["completed", "failed", "canceled", "expired"];
const usdc = (value: string) => parseUnits(value, 6);

test("sends on Arc testnet: allowance, freeze, resolve and resume, wallet signature", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const bob = privateKeyToAccount(generatePrivateKey()).address;
  const bobNew = privateKeyToAccount(generatePrivateKey()).address;
  const carol = privateKeyToAccount(generatePrivateKey()).address;
  const TEST_ID = randomUUID();
  const person = privyPerson(`send-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains, undefined, circleOps(env));
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    // Give what is left back to the ops wallet, so repeated runs do not drain it.
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    const reserve = usdc("0.02");
    if (left > reserve) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - reserve] });
      await client.waitForTransactionReceipt({ hash });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  // Sign in, register, set up, and accept a small allowance (0.1 USDC a day) so both routes are reachable.
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "send-test-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = async (method: string, path: string, payload?: unknown) => {
    const response = await app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    return response;
  };
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  const allowance = (await (await call("POST", "/wallet/allowance/request", { network: "testnet", periodAmount: usdc("0.1").toString() })).json()) as { grantId: string; typedData: TypedDataDefinition };
  await expectStatus(await call("POST", "/wallet/allowance/submit", { grantId: allowance.grantId, signature: await wallet.signTypedData(allowance.typedData) }), 200, "allowance");

  // Fund the wallet from the ops wallet.
  const drip = await circle.createTransaction({
    walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
    blockchain: network.circleBlockchain,
    tokenAddress: network.addresses.usdc,
    destinationAddress: wallet.address,
    amount: ["0.3"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  const waitFinal = async (id: string) => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const { intent } = (await (await call("GET", `/sends/${id}`)).json()) as { intent: SendIntent };
      if (FINAL.includes(intent.state)) return intent;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    throw new Error(`send ${id} did not finish`);
  };

  // 1. A contact, a send inside the allowance, approved twice at once.
  await expectStatus(await call("POST", "/contacts", { displayName: "Bob", address: bob }), 201, "contact");
  const first = ((await (await call("POST", "/sends", { recipient: "bob", amount: "0.05" })).json()) as { intent: SendIntent }).intent;
  assert.equal(first.blocking, null, `ready: ${JSON.stringify(first.blocking)}`);
  assert.equal(first.route, "allowance");
  assert.equal(first.draft?.recipient.name, "Bob");
  assert.ok(first.results.some((entry) => entry.code === "FIRST_TIME_RECIPIENT"));
  const [tapA, tapB] = await Promise.all([
    call("POST", `/sends/${first.id}/approve`, { version: first.version }),
    call("POST", `/sends/${first.id}/approve`, { version: first.version }),
  ]);
  const statuses = [((await tapA.json()) as SendApproveResponse).status, ((await tapB.json()) as SendApproveResponse).status].sort();
  assert.deepEqual(statuses, ["executing", "final"], "one tap sends, the other finds it already going");
  const firstDone = await waitFinal(first.id);
  assert.equal(firstDone.state, "completed", `completed: ${JSON.stringify(firstDone)}`);
  assert.equal(firstDone.outcome, "sent");
  const bobBalance = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [bob] });
  assert.equal(bobBalance, usdc("0.05"), "exactly one transfer arrived");
  console.log("allowance send", firstDone.tx?.explorerUrl);

  // 2. Bob's address changes: the contact freezes; cancelling the change unfreezes it.
  const contacts = ((await (await call("GET", "/contacts")).json()) as { contacts: { id: string }[] }).contacts;
  await expectStatus(await call("POST", `/contacts/${contacts[0]!.id}/address`, { address: bobNew }), 200, "change");
  const frozen = ((await (await call("POST", "/sends", { recipient: "Bob", amount: "0.01" })).json()) as { intent: SendIntent }).intent;
  assert.equal(frozen.blocking?.code, "ADDRESS_CHANGE_HOLD");
  await expectStatus(await call("DELETE", `/contacts/${contacts[0]!.id}/address/pending`), 200, "cancel change");
  const thawed = ((await (await call("PATCH", `/sends/${frozen.id}`, {})).json()) as { intent: SendIntent }).intent;
  assert.equal(thawed.blocking, null, "the same send resumes once the hold is gone");
  assert.equal(thawed.version, frozen.version + 1);
  await call("POST", `/sends/${frozen.id}/cancel`);

  // 3. An unknown name: blocked, then resumed after the contact is saved.
  const unknown = ((await (await call("POST", "/sends", { recipient: "Carol", amount: "0.01" })).json()) as { intent: SendIntent }).intent;
  assert.equal(unknown.blocking?.code, "RECIPIENT_UNKNOWN");
  await expectStatus(await call("POST", "/contacts", { displayName: "Carol", address: carol, source: "pasted" }), 201, "carol");
  const resumed = ((await (await call("PATCH", `/sends/${unknown.id}`, {})).json()) as { intent: SendIntent }).intent;
  assert.equal(resumed.blocking, null);
  assert.equal(resumed.draft?.recipient.address.toLowerCase(), carol.toLowerCase());
  await call("POST", `/sends/${unknown.id}/cancel`);

  // 4. Above what is left of the allowance (0.05 of 0.1): the wallet signs; a tampered signature is refused.
  const big = ((await (await call("POST", "/sends", { recipient: "Bob", amount: "0.08" })).json()) as { intent: SendIntent }).intent;
  assert.equal(big.blocking, null, JSON.stringify(big.blocking));
  assert.equal(big.route, "wallet_signature");
  assert.ok(big.results.some((entry) => entry.code === "ABOVE_ALLOWANCE"));
  const sign = (await (await call("POST", `/sends/${big.id}/approve`, { version: big.version })).json()) as SendApproveResponse;
  assert.equal(sign.status, "sign");
  if (sign.status !== "sign") return;
  const t: UnsignedTransaction = sign.transaction;
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
  const tampered = await wallet.signTransaction({ ...unsigned, to: carol });
  const refused = await call("POST", `/sends/${big.id}/signature`, { approvalId: sign.approvalId, signedTransaction: tampered });
  assert.equal(refused.status, 422, "a transaction that differs from the draft is refused");
  // The refused approval is spent; ask again for a fresh one.
  const again = (await (await call("POST", `/sends/${big.id}/approve`, { version: big.version })).json()) as SendApproveResponse;
  assert.equal(again.status, "sign");
  if (again.status !== "sign") return;
  const signed = await wallet.signTransaction({ ...unsigned, nonce: again.transaction.nonce, maxFeePerGas: BigInt(again.transaction.maxFeePerGas), maxPriorityFeePerGas: BigInt(again.transaction.maxPriorityFeePerGas), gas: BigInt(again.transaction.gas) });
  const submitted = await call("POST", `/sends/${big.id}/signature`, { approvalId: again.approvalId, signedTransaction: signed });
  await expectStatus(submitted, 200, "signature");
  const bigDone = await waitFinal(big.id);
  assert.equal(bigDone.state, "completed", JSON.stringify(bigDone));
  console.log("wallet send", bigDone.tx?.explorerUrl);
  const bobAfter = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [bob] });
  assert.equal(bobAfter, usdc("0.13"));

  // 5. The second send to Bob is no longer a first-time one, and the contact shows it was paid.
  const later = ((await (await call("POST", "/sends", { recipient: "Bob", amount: "0.01" })).json()) as { intent: SendIntent }).intent;
  assert.ok(!later.results.some((entry) => entry.code === "FIRST_TIME_RECIPIENT"));
  assert.equal(later.draft?.recipient.paidBefore, true);
  await call("POST", `/sends/${later.id}/cancel`);
});
