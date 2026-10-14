// Stage 3 of the weekly budget on Arc testnet (D38), with a fresh local key standing in for the person's wallet and the
// phone's own checks run exactly as the app runs them (@kawase/wallet, apps/mobile/src/budget/guard.ts):
//  1. an old any-recipient allowance exists (the security gap);
//  2. ONE approval sets the budget: the budget, the away pack (a per-contact send grant, the vault grants, a CCTP move
//     to the wallet itself, all on the next kill-switch nonce), the nonce rotation that turns the pack on, and the
//     revoke of the old allowance — every grant checked on the phone first;
//  3. a swap from the app with no Face ID: the leaves (exact approve, the venue's pinned call, the allowance reset),
//     the phone's guard says silent, ops redeems, the wallet sends nothing, and no allowance to the venue is left;
//  4. a send to the saved contact with no prompt: the guard says silent, the week is reserved, the wallet signs the
//     exact transfer; and the away grant pays the same contact from ops while the phone is closed;
//  5. a send to a new address asks (the guard says new_person);
//  6. revoke-all with no prompt: the nonce moves twice, the old grants are disabled, and the away grant is dead on chain.
// Needs the testnet keys in the root .env and DATABASE_URL pointing at a migrated scratch database (kawase_budget).
// Run from apps/api: npx tsx test/budget-s3.testnet.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { RevokeRequest, SendIntent, SwapIntent, UnsignedTransaction } from "@kawase/api-client";
import { encodeRedeemTransfer } from "@kawase/integrations-delegation";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";
import {
  APP_KIT_BRIDGES,
  BUDGET_ENFORCERS,
  DELEGATION_FRAMEWORK_MANAGER,
  budgetTypedData,
  checkAwayPack,
  checkRevoke,
  checkSendTransaction,
  checkTransferAuthorization,
  opsWalletFor,
  reviveDelegationTypedData,
  swapVenueContracts,
} from "@kawase/wallet";

import { arcReads } from "../../mobile/src/budget/chain";
import { budgetAllows, type GuardContext, type GuardDeps } from "../../mobile/src/budget/guard";
import { kyberQuote } from "../../mobile/src/budget/price";

import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";
import type { LeafResponse } from "../src/budget/leaf";
import type { BudgetView } from "../src/budget/service";
import { appKitEarn } from "../src/earn/engine";
import { circleOps } from "../src/send/ops";
import { appKitSwaps } from "../src/swap/engine";
import { createChains } from "../src/wallet/chain";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const USDC_DECIMALS = 6;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const NONE = 0n;
const JSON_INDENT = 2;
const TWO = 2n;
const ONE = 1n;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const NONCE_ABI = parseAbi(["function currentNonce(address delegationManager, address delegator) view returns (uint256)"]);
const usdc = (value: string) => parseUnits(value, USDC_DECIMALS);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bigintJson = (_: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
const evidence: Record<string, unknown> = {};

const env = loadApiEnv();
const chains = createChains(env);
const network = getNetwork("testnet");
const explorer = (hash: string | null | undefined) => (hash ? `${network.viemChain.blockExplorers?.default.url}/tx/${hash}` : null);
const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
const wallet = privateKeyToAccount(generatePrivateKey());
const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
const contact = privateKeyToAccount(generatePrivateKey()).address;
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const SUB_ORG = randomUUID();
const TURNKEY_USER = randomUUID();
const sessionKey = turnkeyStyleKeyPair();
const turnkey = fakeTurnkey(
  { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "budgeter-s3", email: `budget-s3-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
  { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
);
const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), appKitSwaps(env), undefined, appKitEarn(env));
const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
const OPS = env.OPS_WALLET_ADDRESS_TESTNET as Address;

let userId = "";
let token = "";
const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
const json = async <T>(response: Response | Promise<Response>) => {
  const answer = await response;
  const body = (await answer.json()) as T;
  if (answer.status >= 400) throw new Error(`${answer.status} ${JSON.stringify(body)}`);
  return body;
};
const readNonce = () => client.readContract({ address: BUDGET_ENFORCERS.nonce, abi: NONCE_ABI, functionName: "currentNonce", args: [DELEGATION_FRAMEWORK_MANAGER, wallet.address] });
const serializable = (tx: UnsignedTransaction) => ({ ...tx, value: BigInt(tx.value), gas: BigInt(tx.gas), maxFeePerGas: BigInt(tx.maxFeePerGas), maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) });

/** What the phone does with a revoke-style request: checkRevoke, then sign it (relayed delegation or own transaction). */
async function signRequest(request: RevokeRequest) {
  const relayed = "typedData" in request;
  checkRevoke(relayed ? { typedData: reviveDelegationTypedData(request.typedData) } : { transaction: request.transaction }, wallet.address);
  const signed = relayed ? await wallet.signTypedData(reviveDelegationTypedData(request.typedData) as never) : await wallet.signTransaction(serializable(request.transaction as UnsignedTransaction) as never);
  return { requestId: request.requestId, relayed, signed };
}

async function opsCall(target: { to: Address; data: Hex }) {
  const created = await circle.createContractExecutionTransaction({ walletId: env.OPS_WALLET_ID_TESTNET, contractAddress: target.to, callData: target.data, fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const transaction = (await circle.getTransaction({ id: created.data?.id ?? "" })).data?.transaction;
    if (transaction && DONE_STATES.includes(transaction.state)) return { ok: transaction.state === "COMPLETE" || transaction.state === "CONFIRMED", tx: transaction.txHash, detail: transaction.errorReason };
    await wait(POLL_MS);
  }
  return { ok: false, tx: undefined, detail: "timeout" };
}

async function revertReason(from: Address, target: { to: Address; data: Hex }) {
  try {
    await client.call({ account: from, to: target.to, data: target.data });
    return "";
  } catch (error) {
    const text = `${(error as { details?: string }).details ?? ""} ${(error as Error).message}`;
    return text.match(/[A-Za-z0-9]+Enforcer:[a-z-]+/)?.[0] ?? text.match(/reverted[^\n]*/)?.[0] ?? text.slice(0, 160);
  }
}

const phoneDeps: GuardDeps = { quote: kyberQuote(), reads: arcReads, localSpent: () => Promise.resolve(NONE) };
async function guardContext(): Promise<GuardContext> {
  const [{ budget }, safety, { contacts }] = await Promise.all([
    json<{ budget: BudgetView }>(call("GET", "/budget")),
    json<{ pausedAt: string | null; riskMode: "careful" | "balanced" | "autonomous"; practice: boolean }>(call("GET", "/safety")),
    json<{ contacts: { address: string | null; blocked: boolean; pendingChange: unknown }[] }>(call("GET", "/contacts")),
  ]);
  return {
    wallet: wallet.address,
    chainId: network.chainId,
    budget: budget as never,
    safety,
    contacts: contacts.filter((entry) => entry.address && !entry.blocked && !entry.pendingChange).map((entry) => entry.address!),
  };
}

async function settle<T extends { state: string }>(path: string, start: T): Promise<T> {
  let current = start;
  for (let i = 0; i < POLL_ATTEMPTS && !["completed", "failed"].includes(current.state); i++) {
    await wait(POLL_MS);
    current = (await json<{ intent: T }>(call("GET", path))).intent;
  }
  return current;
}

try {
  // 0. Sign in, register, set up (relayed 7702), fund from ops.
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "budget-s3-phone-01" } }));
  await expectStatus(signIn, HTTP_CREATED, "sign-in");
  ({ token, user: { id: userId } } = (await signIn.json()) as { token: string; user: { id: string } });
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), HTTP_CREATED, "register");
  const { authorization } = await json<{ authorization: { contractAddress: Hex; chainId: number; nonce: number } }>(call("POST", "/wallet/setup/request", { network: "testnet" }));
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    HTTP_OK,
    "setup",
  );
  const drip = await circle.createTransaction({ walletAddress: OPS, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["1.2"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }
  console.log("wallet", wallet.address, "set up and funded");

  // 1. The old any-recipient allowance (what every wallet had before the budget).
  const legacy = await json<{ grantId: string; typedData: Record<string, unknown> }>(call("POST", "/wallet/allowance/request", { network: "testnet", periodAmount: usdc("1").toString() }));
  await json(call("POST", "/wallet/allowance/submit", { grantId: legacy.grantId, signature: await wallet.signTypedData(reviveDelegationTypedData(legacy.typedData) as never) }));
  const savedContact = await json<{ contact: { id: string } }>(call("POST", "/contacts", { displayName: "Ada S3", address: contact }));
  console.log("old allowance on; contact saved", savedContact.contact.id);

  // 2. ONE approval: budget + away pack + rotation + the old allowance's revoke.
  const { vaults } = await json<{ vaults: { address: string; liquidity: string }[] }>(call("GET", "/earn"));
  const vaultVenues = vaults.filter((vault) => vault.liquidity !== "stuck").map((vault) => vault.address.toLowerCase());
  const terms = { weeklyCap: usdc("5").toString(), perActionCap: usdc("1").toString(), categories: ["swap", "earn", "send", "bridge"], venues: ["app_kit", "cctp", ...vaultVenues] };
  const proposal = await json<{
    policy: Parameters<typeof budgetTypedData>[0] & { weeklyCap: string; perActionCap: string };
    away: { proposalId: string; nonce: string; offers: { purpose: string; subject: string; typedData: Record<string, unknown> }[] };
    rotation: RevokeRequest;
    allowanceRevoke: RevokeRequest | null;
  }>(call("POST", "/budget/proposal", { ...terms, pack: true }));
  const nonceBefore = await readNonce();
  const offers = proposal.away.offers.map((offer) => ({ ...offer, typedData: reviveDelegationTypedData(offer.typedData as { message?: Record<string, unknown> }) }));
  // The phone's checks before the one approval.
  checkAwayPack(offers, {
    wallet: wallet.address,
    ops: opsWalletFor(network.chainId)!,
    nonce: nonceBefore + ONE,
    usdc: network.addresses.usdc,
    chainId: network.chainId,
    latestEnd: Math.floor(Date.now() / 1000) + 31 * 86_400,
    contacts: [contact],
    perContactPerWeek: usdc("1"),
    vaults: vaultVenues,
  });
  assert.ok(proposal.allowanceRevoke, "the old allowance's revoke comes with the budget");
  const policy = { ...proposal.policy, weeklyCap: BigInt(proposal.policy.weeklyCap), perActionCap: BigInt(proposal.policy.perActionCap) };
  const signatures = await Promise.all(offers.map(async (offer) => ({ salt: String(offer.typedData.message?.salt), signature: await wallet.signTypedData(offer.typedData as never) })));
  const rotation = await signRequest(proposal.rotation);
  const allowanceRevoke = await signRequest(proposal.allowanceRevoke!);
  const saved = await json<{ budget: BudgetView; rotation: { status: string; tx: string | null }; allowanceRevoke: { status: string; tx: string | null } }>(
    call("PUT", "/budget", { policy: proposal.policy, signature: await wallet.signTypedData(budgetTypedData(policy)), away: { proposalId: proposal.away.proposalId, signatures }, rotation, allowanceRevoke }),
  );
  const nonceAfter = await readNonce();
  assert.equal(saved.rotation.status, "confirmed", JSON.stringify(saved.rotation));
  assert.equal(saved.allowanceRevoke.status, "confirmed", JSON.stringify(saved.allowanceRevoke));
  assert.equal(nonceAfter, nonceBefore + ONE);
  assert.equal(saved.budget.away.state, "live", JSON.stringify(saved.budget.away));
  assert.equal(saved.budget.legacyAllowances, 0);
  evidence.oneApproval = {
    signaturesUnderOneApproval: 1 + signatures.length + 2,
    pack: offers.map((offer) => offer.purpose),
    rotation: { ...saved.rotation, explorer: explorer(saved.rotation.tx), nonce: `${nonceBefore} → ${nonceAfter}` },
    oldAllowanceRevoked: { ...saved.allowanceRevoke, explorer: explorer(saved.allowanceRevoke.tx) },
    away: saved.budget.away,
    budget: { weeklyCap: saved.budget.policy.weeklyCap, perActionCap: saved.budget.policy.perActionCap, categories: saved.budget.policy.categories, version: saved.budget.policy.version },
  };
  console.log("budget set with one approval:", JSON.stringify(evidence.oneApproval, bigintJson));

  // 3. A swap from the app with no Face ID.
  const swap = (await json<{ intent: SwapIntent }>(call("POST", "/swaps", { amount: "0.3", tokenIn: "USDC" }))).intent;
  assert.equal(swap.state, "ready_for_approval", JSON.stringify(swap.blocking));
  const offer = await json<LeafResponse<SwapIntent>>(call("POST", `/budget/swaps/${swap.id}/leaf`, { version: swap.version }));
  assert.equal(offer.status, "sign_leaf", JSON.stringify(offer));
  if (offer.status !== "sign_leaf") throw new Error("no leaves");
  const swapVerdict = await budgetAllows(
    { kind: "swap", venue: offer.intent.draft?.venue ?? "app_kit", tokenIn: network.addresses.usdc, tokenOut: network.addresses.eurc, amountIn: BigInt(offer.intent.draft!.amountIn), minOut: BigInt(offer.intent.draft!.minOut), leaves: offer.leaves.map((leaf) => leaf.typedData as Record<string, unknown>) },
    await guardContext(),
    phoneDeps,
  );
  assert.equal(swapVerdict.silent, true, JSON.stringify(swapVerdict, bigintJson));
  const walletTxsBefore = await client.getTransactionCount({ address: wallet.address });
  const leafSignatures = await Promise.all(offer.leaves.map((leaf) => wallet.signTypedData(reviveDelegationTypedData(leaf.typedData as { message?: Record<string, unknown> }) as never)));
  const sent = await json<LeafResponse<SwapIntent>>(call("POST", `/budget/swaps/${swap.id}/leaf/signature`, { approvalId: offer.approvalId, signatures: leafSignatures }));
  assert.equal(sent.status, "executing", JSON.stringify(sent));
  const swapped = await settle(`/swaps/${swap.id}`, sent.intent);
  assert.equal(swapped.state, "completed", JSON.stringify(swapped));
  const adapter = swapVenueContracts(network.chainId, "app_kit")!.spenders[0]!;
  const leftover = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "allowance", args: [wallet.address, adapter] });
  assert.equal(leftover, NONE, "no allowance to the venue outlives the swap");
  assert.equal(await client.getTransactionCount({ address: wallet.address }), walletTxsBefore, "the wallet sent no transaction");
  evidence.silentSwap = { intent: swap.id, leaves: offer.leaves.length, tx: swapped.tx, received: swapped.received, minOut: swap.draft!.minOut, allowanceLeftToVenue: leftover.toString(), guard: swapVerdict };
  console.log("swap with no Face ID:", swapped.tx?.explorerUrl, "allowance left to the venue:", leftover.toString());

  // 4a. A send to the saved contact with no prompt.
  const send = (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient: contact, amount: "0.05", asset: "USDC" }))).intent;
  assert.equal(send.state, "ready_for_approval", JSON.stringify(send.blocking));
  const sendVerdict = await budgetAllows({ kind: "send", token: network.addresses.usdc, to: contact, amount: BigInt(send.draft!.amount) }, await guardContext(), phoneDeps);
  assert.equal(sendVerdict.silent, true, JSON.stringify(sendVerdict, bigintJson));
  if (!sendVerdict.silent) throw new Error("not silent");
  const reserved = await json<{ ok: boolean }>(call("POST", "/budget/spend", { intentId: send.id, amountUsd: sendVerdict.amountUsd.toString() }));
  assert.equal(reserved.ok, true);
  const approve = await json<{ status: string; approvalId: string; transaction?: UnsignedTransaction; typedData?: Record<string, unknown>; intent: SendIntent }>(call("POST", `/sends/${send.id}/approve`, { version: send.version }));
  let signedSend: string;
  if (approve.status === "sign") {
    checkSendTransaction(approve.transaction!, { token: network.addresses.usdc, to: contact, amount: BigInt(send.draft!.amount) });
    signedSend = await wallet.signTransaction(serializable(approve.transaction!) as never);
  } else {
    assert.equal(approve.status, "sign_typed", JSON.stringify(approve));
    checkTransferAuthorization(approve.typedData!, { token: network.addresses.usdc, to: contact, amount: send.draft!.amount }, wallet.address);
    signedSend = await wallet.signTypedData(reviveDelegationTypedData(approve.typedData!) as never);
  }
  const submitted = await json<{ intent: SendIntent }>(call("POST", `/sends/${send.id}/signature`, { approvalId: approve.approvalId, signedTransaction: signedSend, ...(approve.status === "sign_typed" ? { kind: "typed" } : {}) }));
  const delivered = await settle(`/sends/${send.id}`, submitted.intent);
  assert.equal(delivered.state, "completed", JSON.stringify(delivered));
  evidence.silentSend = { intent: send.id, route: approve.status, tx: delivered.tx, guard: sendVerdict, reservedInLedger: reserved.ok };
  console.log("send to a saved contact with no prompt:", delivered.tx?.explorerUrl);

  // 4b. The away grant pays the same contact from ops (the phone closed): only that contact.
  const { BudgetService } = await import("../src/budget/service");
  const { WalletService } = await import("../src/wallet/service");
  const { createLogger } = await import("@kawase/log");
  const budgetService = new BudgetService(db, chains, new WalletService(db, chains), createLogger({ service: "budget-s3", level: "silent" }));
  const grant = await budgetService.away.contactGrant(userId, "testnet", contact);
  assert.ok(grant, "a live away grant for the contact");
  const contactBefore = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [contact] });
  const away = await opsCall(encodeRedeemTransfer(network, grant!, { token: network.addresses.usdc, to: contact, amount: usdc("0.02") }));
  const contactAfter = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [contact] });
  assert.ok(away.ok && contactAfter - contactBefore === usdc("0.02"), JSON.stringify(away));
  const toStranger = await revertReason(OPS, encodeRedeemTransfer(network, grant!, { token: network.addresses.usdc, to: stranger, amount: usdc("0.01") }));
  assert.notEqual(toStranger, "");
  evidence.awayGrant = { tx: away.tx, explorer: explorer(away.tx), paid: "0.02 USDC", toStranger };
  console.log("away grant pays the contact:", explorer(away.tx), "| to a stranger:", toStranger);

  // 5. A send to a new address asks.
  const newSend = (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient: stranger, amount: "0.05", asset: "USDC" }))).intent;
  const newVerdict = await budgetAllows({ kind: "send", token: network.addresses.usdc, to: stranger, amount: usdc("0.05") }, await guardContext(), phoneDeps);
  assert.equal(newVerdict.silent, false);
  assert.equal(newVerdict.silent ? "" : newVerdict.reason, "new_person");
  evidence.newAddressAsks = { intent: newSend.id, state: newSend.state, verdict: newVerdict };
  await call("POST", `/sends/${newSend.id}/cancel`);
  console.log("send to a new address asks:", JSON.stringify(newVerdict));

  // 6. Revoke-all with no prompt: nonce ×2, the older grants disabled, the away grant dead on chain.
  const killBefore = await readNonce();
  const { revoke } = await json<{ revoke: RevokeRequest & { legacy?: RevokeRequest | null } }>(call("POST", "/budget/kill-switch"));
  const { legacy: older, ...kill } = revoke;
  const killSigned = await signRequest(kill as RevokeRequest);
  const killSent = await json<{ tx: Hex; status: string }>(call("POST", "/budget/kill-switch/submit", killSigned));
  let olderSent: { tx: Hex; status: string } | null = null;
  if (older) {
    const olderSigned = await signRequest(older);
    olderSent = await json<{ tx: Hex; status: string }>(call("POST", "/wallet/transactions/submit", olderSigned.relayed ? { requestId: olderSigned.requestId, signature: olderSigned.signed } : { requestId: olderSigned.requestId, signedTransaction: olderSigned.signed })).catch((error: unknown) => ({ tx: "0x" as Hex, status: String(error) }));
  }
  const killAfter = await readNonce();
  assert.equal(killSent.status, "confirmed");
  assert.equal(killAfter, killBefore + TWO);
  const dead = await revertReason(OPS, encodeRedeemTransfer(network, grant!, { token: network.addresses.usdc, to: contact, amount: usdc("0.01") }));
  assert.match(dead, /invalid-nonce|NonceEnforcer/);
  const after = await json<{ budget: BudgetView }>(call("GET", "/budget"));
  evidence.revokeAll = { tx: killSent.tx, explorer: explorer(killSent.tx), nonce: `${killBefore} → ${killAfter}`, olderGrants: olderSent ? { ...olderSent, explorer: explorer(olderSent.tx) } : null, awayGrantNow: dead, budgetPaused: after.budget.paused, away: after.budget.away };
  console.log("revoke-all with no prompt:", JSON.stringify(evidence.revokeAll));
  void APP_KIT_BRIDGES;
} finally {
  for (const tokenAddress of [network.addresses.eurc, network.addresses.usdc]) {
    const left = await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    const keep = tokenAddress === network.addresses.usdc ? usdc("0.02") : NONE;
    if (left > keep) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: tokenAddress, abi: erc20Abi, functionName: "transfer", args: [OPS, left - keep] }) }).catch(() => undefined);
  }
  writeFileSync(new URL("./budget-s3.testnet.results.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), wallet: wallet.address, contact, ...evidence }, bigintJson, JSON_INDENT));
  if (userId) await deleteUser(db, userId);
  await close();
}
process.exit(0);
