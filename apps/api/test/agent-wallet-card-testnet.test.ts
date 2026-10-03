// "Top up my agent wallet with Apple Pay" on Arc testnet (B2-2): B1's onramp with the agent wallet as the destination.
// A real Circle Onramp sandbox session is minted for the agent wallet's address (USDC only); the card's delivery is
// stood in for by a real USDC transfer to the agent wallet from another address (the ops wallet), which settles the
// order from the chain's Transfer logs — while the person's own transfer to the agent wallet, made first, does not.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AgentWalletView, OnrampOrderView, OnrampStartResponse } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { Discovery } from "@kawase/integrations-x402";
import { getNetwork } from "@kawase/networks";

import { circleAgentWallets } from "../src/marketplace/agent-wallets";
import { circleOnramp } from "../src/onramp/engine";
import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const SELLER = process.env.X402_DEMO_SELLER_URL ?? "http://localhost:4021";
const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 3000;
const POLL_ATTEMPTS = 40;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("Apple Pay into the agent wallet: a sandbox session for it, settled by a transfer from elsewhere", { skip: !live, timeout: 600_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "cardbuyer", email: `card-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), undefined, undefined, undefined, {
    agentWallets: circleAgentWallets(env),
    discovery: new Discovery({ demoSellerUrl: SELLER }),
    onramp: circleOnramp(env),
  });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let token = "";
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  after(async () => {
    // What reached the agent wallet goes back to the person's wallet, then to the ops wallet.
    if (token) await Promise.resolve(call("POST", "/marketplace/agent-wallet/return", {})).catch(() => undefined);
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    if (left > usdc("0.02")) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
      await client.waitForTransactionReceipt({ hash });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const drip = async (to: Hex, amount: string) => {
    const sent = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: to, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const transaction = (await circle.getTransaction({ id: sent.data?.id ?? "" })).data?.transaction;
      if (DONE_STATES.includes(transaction?.state ?? "")) return { state: transaction?.state, txHash: transaction?.txHash };
      await wait(POLL_MS);
    }
    return { state: "timeout", txHash: undefined };
  };

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "card-test-phone-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");

  // 1. A real sandbox session whose destination is the agent wallet (made on first use); USDC whatever was asked.
  const started = await call("POST", "/onramp/orders", { amount: "0.10", asset: "EURC", destination: "agent_wallet" });
  await expectStatus(started, 201, "start");
  const { order, widgetUrl } = (await started.json()) as OnrampStartResponse;
  assert.equal(order.destination, "agent_wallet");
  assert.equal(order.asset, "USDC");
  assert.equal(new URL(widgetUrl).origin, "https://onramp-sandbox.arc.io");
  const agent = (await (await call("GET", "/marketplace/agent-wallet")).json()) as AgentWalletView;
  assert.ok(agent.address, "the agent wallet exists");
  console.log("agent wallet", agent.address);

  // 2. The person's own transfer to the agent wallet is not the card purchase.
  assert.equal((await drip(wallet.address, "0.12")).state, "COMPLETE");
  const ownHash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [agent.address as Hex, usdc("0.1")] });
  await client.waitForTransactionReceipt({ hash: ownHash });
  const afterOwn = ((await (await call("GET", `/onramp/orders/${order.id}`)).json()) as { order: OnrampOrderView }).order;
  assert.notEqual(afterOwn.status, "settled", "the person's own transfer does not settle it");

  // 3. The card's delivery (here: USDC from another address) settles it from the chain's logs.
  const delivered = await drip(agent.address as Hex, "0.1");
  assert.equal(delivered.state, "COMPLETE");
  let settled: OnrampOrderView | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && settled?.status !== "settled"; attempt++) {
    settled = ((await (await call("GET", `/onramp/orders/${order.id}`)).json()) as { order: OnrampOrderView }).order;
    if (settled.status !== "settled") await wait(POLL_MS);
  }
  assert.equal(settled?.status, "settled", JSON.stringify(settled));
  assert.equal(settled?.received, usdc("0.1").toString());
  assert.equal(settled?.tx?.hash.toLowerCase(), delivered.txHash?.toLowerCase());
  console.log("card purchase settled on the agent wallet", settled?.tx?.hash);
});
