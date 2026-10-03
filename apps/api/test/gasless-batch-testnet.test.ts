// No gas dead end for batches on Arc testnet (B2-3, plan §B "Gas"): a payout that spends all the wallet's USDC leaves
// nothing for the fee, so signing it answers with a one-time delegation (exactly this batch, once, ten minutes, only
// the relayer may redeem) instead of a transaction; the relayer redeems it and pays the fee, and the receipt shows both
// transfers from the person's wallet.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, erc20Abi, http, parseEventLogs, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a payout that leaves no USDC for the fee goes through the 7702 relayer", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const one = privateKeyToAccount(generatePrivateKey()).address;
  const two = privateKeyToAccount(generatePrivateKey()).address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "gaslessbatch", email: `gaslessbatch-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains);
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let token = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "gaslessbatch-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  // The wallet's 7702 setup is relayed (no gas needed); then it holds exactly what it pays out.
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  const sent = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["0.03"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    if (DONE_STATES.includes((await circle.getTransaction({ id: sent.data?.id ?? "" })).data?.transaction?.state ?? "")) break;
    await wait(POLL_MS);
  }

  const draft = (await (await call("POST", "/business/payouts", { asset: "USDC", lines: [{ recipient: one, amount: "0.01" }, { recipient: two, amount: "0.02" }] })).json()) as { payout: { id: string } | null };
  assert.ok(draft.payout, JSON.stringify(draft));
  const request = (await (await call("POST", `/business/payouts/${draft.payout.id}/sign`, {})).json()) as { requestId: string; relayed?: true; typedData?: Record<string, unknown> };
  assert.equal(request.relayed, true, `no USDC left for the fee: the relayer carries it (${JSON.stringify(request)})`);
  const signature = await wallet.signTypedData(request.typedData as unknown as TypedDataDefinition);
  const paid = ((await (await call("POST", `/business/payouts/${draft.payout.id}/submit`, { requestId: request.requestId, signedTransaction: signature, kind: "typed" })).json()) as { payout: { status: string; txHash: string } }).payout;
  assert.equal(paid.status, "confirmed", JSON.stringify(paid));
  const receipt = await client.getTransactionReceipt({ hash: paid.txHash as Hex });
  assert.equal(receipt.from.toLowerCase(), chains.get("testnet")!.relayerAddress.toLowerCase());
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).filter((entry) => entry.address.toLowerCase() === network.addresses.usdc.toLowerCase() && entry.args.from.toLowerCase() === wallet.address.toLowerCase());
  assert.deepEqual(transfers.map((entry) => [entry.args.to.toLowerCase(), entry.args.value]).sort(), [[one.toLowerCase(), usdc("0.01")], [two.toLowerCase(), usdc("0.02")]].sort());
  console.log("payout batch by the 7702 relayer", paid.txHash);
});
