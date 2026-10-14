// The budget through the api on Arc testnet (D38, Stage 2), with a fresh local key standing in for the person's
// wallet: sign a budget (one signature), then a USDC→EURC swap and a vault deposit go out with no transaction from the
// wallet — the api hands the phone one-shot leaves (`sign_leaf`), the phone checks them against what it expects
// (@kawase/wallet flow-checks) and signs, Kawase's ops wallet redeems, and the swap's own receipt witness settles it.
// Then the ledger shows the spend, and a paused budget, or an action over the per-action cap, is "outside_budget".
// Needs the testnet keys in the root .env and DATABASE_URL pointing at a migrated (scratch) database.
// Run from apps/api: npx tsx src/budget/budget.testnet.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { Hono } from "hono";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { EarnIntent, SwapIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { swapAdapterContract } from "@kawase/integrations-app-kit";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";
import { budgetTypedData, checkEarnLeaves, checkSwapLeaves, reviveDelegationTypedData } from "@kawase/wallet";

import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "../../test/helpers";
import { attachSession } from "../auth/middleware";
import { appKitEarn } from "../earn/engine";
import { EarnService } from "../earn/service";
import { ProblemError, problemResponse } from "../http/problem";
import { circleOps } from "../send/ops";
import { appKitSwaps } from "../swap/engine";
import { SwapService } from "../swap/service";
import { AssetService } from "../tokens/service";
import { noMarketData } from "../market/sources";
import type { AppEnv } from "../types";
import { createChains } from "../wallet/chain";
import { WalletService } from "../wallet/service";
import type { LeafResponse } from "./leaf";
import { budgetRoutes } from "./routes";
import { BudgetService, type BudgetView, type LedgerRow } from "./service";

config({ path: new URL("../../../../.env", import.meta.url).pathname, quiet: true });

const POLL_MS = 2000;
const USDC_DECIMALS = 6;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVER_ERROR = 500;
const NONE = 0n;
const JSON_INDENT = 2;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, USDC_DECIMALS);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence: Record<string, unknown> = {};

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
  { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "budgeter", email: `budget-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
  { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
);
const ops = circleOps(env);
const { app, db, close } = testApp(turnkey, chains, undefined, ops, appKitSwaps(env), undefined, appKitEarn(env));
const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
const OPS = env.OPS_WALLET_ADDRESS_TESTNET as Address;

// The /budget router as the lead will mount it, on the same database, with swap and earn services that redeem through
// the ops wallet (the main app's SwapService does not get `ops` until the lead passes it).
const log = createLogger({ service: "budget-test", level: "silent" });
const wallets = new WalletService(db, chains);
const assets = new AssetService(db, chains, wallets, noMarketData, log);
const swaps = new SwapService(db, chains, wallets, appKitSwaps(env), log, assets, ops);
const earn = new EarnService(db, chains, wallets, appKitEarn(env), log, ops);
const budget = new BudgetService(db, chains, wallets, log);
const budgetApp = new Hono<AppEnv>();
budgetApp.use("*", async (c, next) => {
  c.set("requestId", randomUUID());
  c.set("log", log);
  await next();
});
budgetApp.use("*", attachSession(db));
budgetApp.route("/budget", budgetRoutes({ budget, swaps, earn }));
budgetApp.onError((error, c) => (error instanceof ProblemError ? problemResponse(c, error, "test") : c.json({ error: String(error) }, HTTP_SERVER_ERROR)));

let userId = "";
let token = "";
const call = (target: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }, method: string, path: string, payload?: unknown) =>
  target.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
const json = async <T>(response: Response | Promise<Response>) => (await response).json() as Promise<T>;
const chainNow = async () => Number((await client.getBlock()).timestamp);

/** What the phone signs: the leaves' typed data with their numbers as bigints again. */
const signLeaves = (leaves: { typedData: Record<string, unknown> }[]) => Promise.all(leaves.map((leaf) => wallet.signTypedData(reviveDelegationTypedData(leaf.typedData) as never)));

try {
  // 0. Sign in, register, set up (relayed 7702), fund.
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "budget-test-phone-01" } }));
  await expectStatus(signIn, HTTP_CREATED, "sign-in");
  ({ token, user: { id: userId } } = (await signIn.json()) as { token: string; user: { id: string } });
  await expectStatus(await call(app, "POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), HTTP_CREATED, "register");
  const { authorization } = await json<{ authorization: { contractAddress: Hex; chainId: number; nonce: number } }>(call(app, "POST", "/wallet/setup/request", { network: "testnet" }));
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call(app, "POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    HTTP_OK,
    "setup",
  );
  const drip = await circle.createTransaction({ walletAddress: OPS, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["0.8"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }
  console.log("wallet", wallet.address, "set up and funded");

  // 1. One signature sets the budget: $5 a week, $1 an action, swaps and earn, App Kit and the testnet vaults.
  const overview = await json<{ vaults: { address: string }[] }>(call(app, "GET", "/earn"));
  const vaults = overview.vaults.map((vault) => vault.address.toLowerCase());
  const proposal = await json<{ policy: Parameters<typeof budgetTypedData>[0] & { weeklyCap: string; perActionCap: string }; typedData: unknown }>(
    call(budgetApp, "POST", "/budget/proposal", { weeklyCap: usdc("5").toString(), perActionCap: usdc("1").toString(), categories: ["swap", "earn"], venues: ["app_kit", ...vaults] }),
  );
  const policy = { ...proposal.policy, weeklyCap: BigInt(proposal.policy.weeklyCap), perActionCap: BigInt(proposal.policy.perActionCap) };
  const budgetSignature = await wallet.signTypedData(budgetTypedData(policy));
  const saved = await json<{ budget: BudgetView }>(call(budgetApp, "PUT", "/budget", { policy: proposal.policy, signature: budgetSignature }));
  assert.equal(saved.budget.policy.weeklyCap, usdc("5").toString(), JSON.stringify(saved));
  evidence.budget = saved.budget;
  console.log("budget signed: v", saved.budget.policy.version, "left", saved.budget.leftThisWeek);

  // 2. A swap inside the budget: sign_leaf → the phone's checks → signatures → ops redeems → completed.
  const swap = (await json<{ intent: SwapIntent }>(call(app, "POST", "/swaps", { amount: "0.3", tokenIn: "USDC" }))).intent;
  assert.equal(swap.state, "ready_for_approval", JSON.stringify(swap.results));
  const offer = await json<LeafResponse<SwapIntent>>(call(budgetApp, "POST", `/budget/swaps/${swap.id}/leaf`, { version: swap.version }));
  assert.equal(offer.status, "sign_leaf", JSON.stringify(offer));
  if (offer.status !== "sign_leaf") throw new Error("no leaves");
  const checked = checkSwapLeaves([reviveDelegationTypedData(offer.leaves[0]!.typedData as never), reviveDelegationTypedData(offer.leaves[1]!.typedData as never)] as never, {
    wallet: wallet.address,
    ops: OPS,
    now: await chainNow(),
    routers: [swapAdapterContract(network)],
    tokenIn: network.addresses.usdc,
    tokenOut: network.addresses.eurc,
    amountIn: BigInt(swap.draft!.amountIn),
    minOut: BigInt(swap.draft!.minOut),
  });
  console.log("phone checked the leaves: output to the wallet ≥", checked.guaranteedOut.toString());
  const signatures = await signLeaves(offer.leaves as never);
  const nonceBefore = await client.getTransactionCount({ address: wallet.address });
  const sent = await json<LeafResponse<SwapIntent>>(call(budgetApp, "POST", `/budget/swaps/${swap.id}/leaf/signature`, { approvalId: offer.approvalId, signatures }));
  assert.equal(sent.status, "executing", JSON.stringify(sent));
  let done = swap;
  for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(done.state); i++) {
    await wait(POLL_MS);
    done = (await json<{ intent: SwapIntent }>(call(app, "GET", `/swaps/${swap.id}`))).intent;
    if (done.state === "executing") await swaps.track(swap.id);
  }
  assert.equal(done.state, "completed", JSON.stringify(done));
  assert.ok(done.received && BigInt(done.received) >= BigInt(swap.draft!.minOut));
  assert.equal(await client.getTransactionCount({ address: wallet.address }), nonceBefore, "the wallet sent no transaction");
  evidence.swap = { intent: swap.id, tx: done.tx, received: done.received, minOut: swap.draft!.minOut, amountIn: swap.draft!.amountIn };
  console.log("silent swap completed", done.tx?.explorerUrl, "received", done.received);

  // 3. A vault deposit inside the budget, the same way.
  const deposit = (await json<{ intent: EarnIntent }>(call(app, "POST", "/earn/intents", { action: "deposit", amount: "0.2" }))).intent;
  if (deposit.state === "ready_for_approval") {
    const earnOffer = await json<LeafResponse<EarnIntent>>(call(budgetApp, "POST", `/budget/earn/${deposit.id}/leaf`, { version: deposit.version }));
    assert.equal(earnOffer.status, "sign_leaf", JSON.stringify(earnOffer));
    if (earnOffer.status !== "sign_leaf") throw new Error("no earn leaves");
    const vault = deposit.draft!.vault.address as Address;
    checkEarnLeaves(earnOffer.leaves.map((leaf) => reviveDelegationTypedData(leaf.typedData as never)) as never, {
      wallet: wallet.address,
      ops: OPS,
      now: await chainNow(),
      action: "deposit",
      vaults: [vault],
      vault,
      asset: network.addresses.usdc,
      amount: BigInt(deposit.draft!.amount),
      minOut: 1n,
    });
    const earnSent = await json<LeafResponse<EarnIntent>>(call(budgetApp, "POST", `/budget/earn/${deposit.id}/leaf/signature`, { approvalId: earnOffer.approvalId, signatures: await signLeaves(earnOffer.leaves as never) }));
    assert.equal(earnSent.status, "executing", JSON.stringify(earnSent));
    let earned = deposit;
    for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(earned.state); i++) {
      await wait(POLL_MS);
      await earn.track(deposit.id);
      earned = (await json<{ intent: EarnIntent }>(call(app, "GET", `/earn/intents/${deposit.id}`))).intent;
    }
    evidence.earn = { intent: deposit.id, state: earned.state, tx: earned.tx, vault };
    console.log("silent deposit", earned.state, earned.tx?.explorerUrl);
  } else {
    evidence.earn = { skipped: deposit.state, blocking: deposit.blocking };
    console.log("deposit not ready on testnet:", deposit.blocking?.code);
  }

  // 4. The ledger counts it; over the per-action cap and a paused budget are "outside_budget".
  const view = await json<{ budget: BudgetView }>(call(budgetApp, "GET", "/budget"));
  const ledger = await json<{ rows: LedgerRow[] }>(call(budgetApp, "GET", "/budget/ledger"));
  assert.ok(BigInt(view.budget.spentThisWeek) > NONE, JSON.stringify(view));
  evidence.ledger = { spentThisWeek: view.budget.spentThisWeek, leftThisWeek: view.budget.leftThisWeek, rows: ledger.rows };
  const big = (await json<{ intent: SwapIntent }>(call(app, "POST", "/swaps", { amount: "0.15", tokenIn: "USDC" }))).intent;
  assert.equal(big.state, "ready_for_approval", JSON.stringify(big.blocking));
  await call(budgetApp, "POST", "/budget/pause");
  const paused = await json<LeafResponse<SwapIntent>>(call(budgetApp, "POST", `/budget/swaps/${big.id}/leaf`, { version: big.version }));
  assert.equal(paused.status, "outside_budget");
  evidence.paused = (paused as { reason?: string }).reason;
  await call(budgetApp, "POST", "/budget/resume");
  const smaller = await json<{ policy: Parameters<typeof budgetTypedData>[0] & { weeklyCap: string; perActionCap: string } }>(
    call(budgetApp, "POST", "/budget/proposal", { weeklyCap: usdc("5").toString(), perActionCap: usdc("0.1").toString(), categories: ["swap", "earn"], venues: ["app_kit", ...vaults] }),
  );
  const lower = { ...smaller.policy, weeklyCap: BigInt(smaller.policy.weeklyCap), perActionCap: BigInt(smaller.policy.perActionCap) };
  await expectStatus(await call(budgetApp, "PUT", "/budget", { policy: smaller.policy, signature: await wallet.signTypedData(budgetTypedData(lower)) }), HTTP_OK, "lower the budget");
  const capped = await json<LeafResponse<SwapIntent>>(call(budgetApp, "POST", `/budget/swaps/${big.id}/leaf`, { version: big.version }));
  assert.equal(capped.status, "outside_budget");
  evidence.overCap = (capped as { reason?: string }).reason;
  const forged = await call(budgetApp, "PUT", "/budget", { policy: { ...smaller.policy, version: smaller.policy.version + 1, perActionCap: usdc("4").toString() }, signature: budgetSignature });
  evidence.forgedBudget = forged.status;
  assert.equal(forged.status, HTTP_UNPROCESSABLE, "a budget whose signature does not match its terms is refused");
  console.log("paused →", evidence.paused, "| over the cap →", evidence.overCap, "| forged budget →", forged.status);
  console.log("ledger", JSON.stringify(evidence.ledger));
} finally {
  for (const tokenAddress of [network.addresses.eurc, network.addresses.usdc]) {
    const left = await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    const keep = tokenAddress === network.addresses.usdc ? usdc("0.02") : NONE;
    if (left > keep) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: tokenAddress, abi: erc20Abi, functionName: "transfer", args: [OPS, left - keep] }) });
  }
  writeFileSync(new URL("./budget.testnet.results.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), wallet: wallet.address, ...evidence }, (_, v) => (typeof v === "bigint" ? v.toString() : v), JSON_INDENT));
  if (userId) await deleteUser(db, userId);
  await close();
}
process.exit(0);
