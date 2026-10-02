// The x402 marketplace end to end on Arc testnet (cards/marketplace.md acceptance "Testnet: the demo seller returns
// 402 → paid → response"): a fresh local key stands in for the Turnkey wallet; the agent wallet is a real Circle
// developer-controlled wallet; money moves under a real marketplace grant (ops wallet redeems it), into Circle Gateway,
// pays Kawase's demo seller with a Gateway nanopayment, and comes back. Covers: the grant is asked for on the first
// top-up; a paid call answers with real data; the same call again is not paid twice; above the per-call cap a consent
// card comes first and the approved call then pays; over the daily budget is refused with the cap; Return empties it.
// Needs the demo seller running (pnpm --filter @kawase/x402-seller start) and the server keys in the root .env.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AgentWalletView, BuyOutcome, TopUpResult } from "@kawase/api-client";
import { users } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { Discovery } from "@kawase/integrations-x402";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";

import { circleAgentWallets } from "../src/marketplace/agent-wallets";
import { MarketplaceService } from "../src/marketplace/service";
import { circleOps } from "../src/send/ops";
import type { SessionUser } from "../src/types";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const SELLER = process.env.X402_DEMO_SELLER_URL ?? "http://localhost:4021";
const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("x402 on Arc testnet: top up under the grant, pay the demo seller through Gateway, return", { skip: !live, timeout: 900_000 }, async () => {
  const sellerUp = await fetch(`${SELLER}/health`).then((response) => response.ok).catch(() => false);
  assert.ok(sellerUp, `the demo seller is not running at ${SELLER}`);
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "buyer", email: `x402-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const discovery = new Discovery({ demoSellerUrl: SELLER });
  const agentWallets = circleAgentWallets(env);
  const ops = circleOps(env);
  const { app, db, close } = testApp(turnkey, chains, undefined, ops, undefined, undefined, undefined, { agentWallets, discovery });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  let token = "";
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  after(async () => {
    // Whatever is left goes back to the ops wallet, and the account is removed.
    if (token) await Promise.resolve(call("POST", "/marketplace/agent-wallet/return", {})).catch(() => undefined);
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    if (left > usdc("0.02")) {
      const hash = await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] });
      await client.waitForTransactionReceipt({ hash });
    }
    if (userId) await deleteUser(db, userId);
    await close();
  });

  // Sign in, register the wallet, set it up (7702, relayed), and fund it with 1.5 test USDC from the ops wallet.
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "x402-test-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
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
    amount: ["1.5"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  // 1. The page before anything: no agent wallet yet, the defaults.
  const empty = (await (await call("GET", "/marketplace/agent-wallet")).json()) as AgentWalletView;
  assert.equal(empty.address, null);
  assert.equal(empty.grant, null);

  // 2. The first top-up asks for the grant; signed, the second goes through and lands in Gateway.
  const first = (await (await call("POST", "/marketplace/agent-wallet/top-up", { amount: usdc("1").toString() })).json()) as TopUpResult;
  assert.equal(first.status, "needs_grant");
  if (first.status !== "needs_grant") return;
  const receipt = first.grant.receipt as { recipient?: string; amountPerPeriod?: string; methods?: string[] };
  assert.ok(receipt.recipient, "the grant is pinned to one recipient (the agent wallet)");
  const signature = await wallet.signTypedData(first.grant.typedData as unknown as TypedDataDefinition);
  await expectStatus(await call("POST", "/marketplace/agent-wallet/grant/submit", { grantId: first.grant.grantId, signature }), 200, "grant");
  const topUp = await call("POST", "/marketplace/agent-wallet/top-up", { amount: usdc("1").toString() });
  await expectStatus(topUp, 200, "top-up");
  const topped = (await topUp.json()) as TopUpResult;
  assert.equal(topped.status, "topped_up");
  if (topped.status !== "topped_up") return;
  console.log("agent wallet", topped.wallet.address, "balances", topped.wallet.balances, "top-up tx", topped.move.txHashes);
  assert.equal(topped.wallet.address?.toLowerCase(), receipt.recipient!.toLowerCase());
  // 80% into Gateway (most sellers), 20% kept on hand for plain EIP-3009 sellers.
  assert.ok(BigInt(topped.wallet.balances.inGateway) > usdc("0.75"), "deposited into Gateway");
  assert.ok(BigInt(topped.wallet.balances.onHand) >= usdc("0.2"), "a share kept on hand");

  // 3. The agent buys from the demo seller (the same service the agent tool calls).
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  const user = { ...row!, activeNetwork: "testnet" } as unknown as SessionUser;
  const log = createLogger({ service: "x402-test", level: "silent" });
  const market = new MarketplaceService(db, chains, new WalletService(db, chains), ops, agentWallets, discovery, log);
  const threadId = randomUUID();
  const fx = await market.buy(user, { url: `${SELLER}/api/fx/eur-usd` }, { threadId, tainted: false });
  console.log("fx", JSON.stringify(fx).slice(0, 600));
  assert.equal(fx.status, "paid", JSON.stringify(fx));
  if (fx.status !== "paid") return;
  assert.equal(fx.purchase.rail, "gateway");
  assert.equal(fx.purchase.amount, usdc("0.002").toString());
  assert.match(fx.content, /"rate":\s*\d/);

  // 4. The same call again in the same conversation: what it already got, no second payment.
  const again = await market.buy(user, { url: `${SELLER}/api/fx/eur-usd` }, { threadId, tainted: false });
  assert.equal(again.status, "paid");
  assert.equal((again as Extract<BuyOutcome, { status: "paid" }>).purchase.id, fx.purchase.id);

  // 5. Above the per-call cap: a consent card first; approved, it pays.
  await expectStatus(await call("PATCH", "/marketplace/agent-wallet/settings", { perCallCap: usdc("0.003").toString() }), 200, "settings");
  const yields = await market.buy(user, { url: `${SELLER}/api/defillama/yields` }, { threadId, tainted: false });
  assert.equal(yields.status, "needs_consent", JSON.stringify(yields));
  if (yields.status !== "needs_consent") return;
  assert.equal(yields.why, "over_per_call");
  await expectStatus(await call("POST", `/marketplace/purchases/${yields.purchase.id}/decision`, { decision: "approve" }), 200, "approve");
  const paidYields = await market.buy(user, { url: `${SELLER}/api/defillama/yields` }, { threadId, tainted: false });
  assert.equal(paidYields.status, "paid", JSON.stringify(paidYields));

  // 6. Over the daily budget: refused, with the cap.
  await expectStatus(await call("PATCH", "/marketplace/agent-wallet/settings", { dailyBudget: usdc("0.009").toString(), perCallCap: usdc("0.009").toString() }), 200, "budget");
  const over = await market.buy(user, { url: `${SELLER}/api/defillama/yields` }, { threadId: randomUUID(), tainted: false });
  assert.equal(over.status, "refused");
  assert.equal((over as Extract<BuyOutcome, { status: "refused" }>).reason, "over_budget");

  // 7. The page shows the purchases and the moves; Return brings everything back to the wallet.
  const page = (await (await call("GET", "/marketplace/agent-wallet")).json()) as AgentWalletView;
  assert.equal(page.spentToday, usdc("0.008").toString());
  assert.ok(page.history.some((item) => item.kind === "purchase" && item.purchase.status === "paid"));
  const before = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  const returned = await call("POST", "/marketplace/agent-wallet/return", {});
  await expectStatus(returned, 200, "return");
  const back = (await returned.json()) as { status: string; moves: { status: string; amount: string; txHashes: string[] }[]; wallet: AgentWalletView };
  console.log("return", JSON.stringify(back.moves), "left", back.wallet.balances);
  assert.equal(back.status, "returned");
  assert.ok(back.moves.every((move) => move.status === "confirmed"), JSON.stringify(back.moves));
  const afterReturn = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  assert.ok(afterReturn - before > usdc("0.9"), `returned ${afterReturn - before}`);
});
