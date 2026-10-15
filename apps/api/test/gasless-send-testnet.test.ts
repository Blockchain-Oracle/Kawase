// No gas dead end on Arc testnet (B2-3, plan §A.4 12): a wallet sending ALL its USDC has nothing left for the fee.
// The draft says so (GAS_RELAYED, fee paid by the relayer), approving answers with one EIP-3009 authorization to sign
// instead of a transaction, and Kawase's relayer sends it: the receipt is the relayer's transaction, the Transfer is
// the person's whole balance to the recipient, and the wallet paid no fee. A forged signature is refused. Also the
// fee reserve ("~N actions left") before and after.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, erc20Abi, http, parseEventLogs, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { FeeReserveView, SendApproveResponse, SendIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a wallet with no USDC to spare sends all of it through the EIP-3009 relayer", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const recipient = privateKeyToAccount(generatePrivateKey()).address;
  const TEST_ID = randomUUID();
  const person = privyPerson(`gasless-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains);
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let token = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const drip = async (to: Hex, amount: string) => {
    const sent = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: to, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: sent.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) return state;
      await wait(POLL_MS);
    }
    return "timeout";
  };

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "gasless-phone-01" });
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;

  // The wallet holds exactly 0.03 USDC and nothing else: sending all of it leaves nothing for the fee.
  assert.equal(await drip(wallet.address, "0.03"), "COMPLETE");
  const reserve = ((await (await call("GET", "/fees/reserve")).json()) as { reserve: FeeReserveView }).reserve;
  assert.equal(reserve.usdc, usdc("0.03").toString());
  assert.ok(reserve.actionsLeft > 0 && BigInt(reserve.perTransfer) > BigInt(0), JSON.stringify(reserve));
  console.log(`fee reserve: ${reserve.actionsLeft} actions left at ${reserve.perTransfer} per transfer`);

  // 1. The draft: the relayer pays this send's fee.
  const drafted = ((await (await call("POST", "/sends", { recipient, amount: "0.03", asset: "USDC" })).json()) as { intent: SendIntent }).intent;
  assert.equal(drafted.blocking, null, JSON.stringify(drafted.results));
  assert.ok(drafted.results.some((entry) => entry.code === "GAS_RELAYED"), JSON.stringify(drafted.results));
  assert.equal(drafted.draft?.fee.payer, "relayer");

  // 2. Approving answers with the EIP-3009 message, not a transaction.
  const approved = (await (await call("POST", `/sends/${drafted.id}/approve`, { version: drafted.version, override: true })).json()) as SendApproveResponse;
  assert.equal(approved.status, "sign_typed", JSON.stringify(approved));
  if (approved.status !== "sign_typed") return;
  assert.equal(approved.typedData.primaryType, "TransferWithAuthorization");

  // A signature from anyone else is refused, and the approval is spent.
  const stranger = privateKeyToAccount(generatePrivateKey());
  const forged = await stranger.signTypedData(approved.typedData as unknown as TypedDataDefinition);
  const refused = await call("POST", `/sends/${drafted.id}/signature`, { approvalId: approved.approvalId, signedTransaction: forged, kind: "typed" });
  assert.equal(refused.status, 422, await refused.clone().text());

  // 3. Approve again, sign as the person, and the relayer sends it.
  const again = (await (await call("POST", `/sends/${drafted.id}/approve`, { version: drafted.version, override: true })).json()) as SendApproveResponse;
  assert.equal(again.status, "sign_typed");
  if (again.status !== "sign_typed") return;
  const signature = await wallet.signTypedData(again.typedData as unknown as TypedDataDefinition);
  const submitted = (await (await call("POST", `/sends/${drafted.id}/signature`, { approvalId: again.approvalId, signedTransaction: signature, kind: "typed" })).json()) as SendApproveResponse;
  assert.equal(submitted.status, "executing", JSON.stringify(submitted));
  let done: SendIntent | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && done?.state !== "completed"; attempt++) {
    done = ((await (await call("GET", `/sends/${drafted.id}`)).json()) as { intent: SendIntent }).intent;
    if (done.state !== "completed") await wait(POLL_MS);
  }
  assert.equal(done?.state, "completed", JSON.stringify(done));
  const receipt = await client.getTransactionReceipt({ hash: done!.tx!.hash as Hex });
  assert.equal(receipt.from.toLowerCase(), chains.get("testnet")!.relayerAddress.toLowerCase(), "the relayer sent it");
  const transfer = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).find((entry) => entry.address.toLowerCase() === network.addresses.usdc.toLowerCase() && entry.args.to.toLowerCase() === recipient.toLowerCase());
  assert.equal(transfer?.args.from.toLowerCase(), wallet.address.toLowerCase());
  assert.equal(transfer?.args.value, usdc("0.03"));
  const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  assert.equal(left, BigInt(0), "the whole balance went; the wallet paid no fee");
  console.log("gas-free send by the relayer", receipt.transactionHash);
});
