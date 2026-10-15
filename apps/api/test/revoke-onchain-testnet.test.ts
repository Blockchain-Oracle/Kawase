// H4 on Arc testnet: turning a grant off is an on-chain fact, not a database row. Raising an allowance disables the old
// delegation on chain inside the same approval (the relayer pays), so the ops wallet can no longer redeem it; and
// revoke-all covers every grant the chain still honours, including one the database had already set aside.
// The wallet is a local key standing in for Privy; the ops wallet is Circle's (it only funds the wallet here).
// Skipped without the server keys in the root .env. Run alone: pnpm --filter @kawase/api exec tsx --test test/revoke-onchain-testnet.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Address, type BaseError, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { hashDelegation } from "@metamask/smart-accounts-kit/utils";

import type { RevokeRequest, SafetyChangeResponse } from "@kawase/api-client";
import { grants, txAttempts } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { encodeRedeemTransfer } from "@kawase/integrations-delegation";
import { DELEGATION_FRAMEWORK, getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, revokeSubmitBody, signRevokeRequest, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const units = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** DelegationManager's `CannotUseADisabledDelegation()` selector. */
const DISABLED_DELEGATION = "0x05baa052";

test("H4: a raise disables the old allowance on chain; revoke-all covers a grant set aside only in the database", { skip: !live, timeout: 600_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const ops = env.OPS_WALLET_ADDRESS_TESTNET as Address;
  const TEST_ID = randomUUID();
  const person = privyPerson(`revoke-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains);
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    const left = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
    const keep = units("0.005");
    if (left > keep) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [ops, left - keep] }) });
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "revoke-test-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const json = async <T>(response: Response | Promise<Response>, what: string, status = 200) => {
    const answer = await response;
    await expectStatus(answer, status, what);
    return (await answer.json()) as T;
  };

  const { authorization } = await json<{ authorization: { contractAddress: Hex; chainId: number; nonce: number } }>(call("POST", "/wallet/setup/request", { network: "testnet" }), "setup request");
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }), 200, "setup");
  const first = await json<{ grantId: string; typedData: TypedDataDefinition; revoke: RevokeRequest | null }>(call("POST", "/wallet/allowance/request", { network: "testnet" }), "allowance request");
  assert.equal(first.revoke, null, "nothing to replace yet");
  await expectStatus(await call("POST", "/wallet/allowance/submit", { grantId: first.grantId, signature: await wallet.signTypedData(first.typedData) }), 200, "allowance");

  // A little USDC so a redeem has something to move (the revokes themselves are paid by the relayer).
  const drip = await circle.createTransaction({ walletAddress: ops, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: ["0.02"], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    if (DONE_STATES.includes((await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "")) break;
    await wait(POLL_MS);
  }

  const grantRow = async (id: string) => (await db.select().from(grants).where(eq(grants.id, id)))[0]!;
  const disabled = (delegation: Record<string, unknown>) =>
    DelegationManager.read.disabledDelegations({ client, contractAddress: DELEGATION_FRAMEWORK.delegationManager, delegationHash: hashDelegation(delegation as never) });
  /** The ops wallet redeeming a grant for a tiny transfer, run against the chain as it is now (eth_call from ops). */
  const redeemAsOps = async (delegation: Record<string, unknown>) => {
    const callData = encodeRedeemTransfer(network, delegation as never, { token: network.addresses.usdc, to: privateKeyToAccount(generatePrivateKey()).address, amount: units("0.001") });
    try {
      await client.call({ account: ops, to: callData.to, data: callData.data });
      return "ok";
    } catch (error) {
      // The revert data names the DelegationManager's error when the RPC returns it.
      const data = (error as BaseError).walk?.((cause) => typeof (cause as { data?: unknown }).data === "string") as { data?: Hex } | null;
      return data?.data && data.data !== "0x" ? `reverted ${data.data.slice(0, 10)}` : `reverted: ${String((error as BaseError).shortMessage ?? error)}`;
    }
  };

  // 1. Before the raise, the ops wallet can redeem the everyday allowance.
  const oldGrant = await grantRow(first.grantId);
  assert.equal(await redeemAsOps(oldGrant.delegation), "ok");

  // 2. Raise USDC 5,000 → 6,000 a day: a new grant, and the old one's revoke (relayed) signed in the same yes.
  const raise = await json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: { kind: "allowance", token: network.addresses.usdc, perDay: units("6000").toString() } }), "raise");
  if (raise.status !== "needs_approval" || raise.approval.kind !== "grant" || !raise.approval.revoke) throw new Error(`expected a grant with a revoke: ${JSON.stringify(raise)}`);
  assert.ok("relayed" in raise.approval.revoke, "the relayer sends the revoke");
  assert.deepEqual(raise.approval.revoke.grantIds, [first.grantId]);
  const newSignature = await wallet.signTypedData(raise.approval.typedData as unknown as TypedDataDefinition);
  // Without the revoke the raise is refused and nothing changes.
  const bare = await call("POST", `/safety/changes/${raise.changeId}/approve`, { signature: newSignature });
  assert.equal(bare.status, 422);
  assert.equal(((await bare.json()) as { type: string }).type.endsWith("/revoke_required"), true);
  const applied = await json<SafetyChangeResponse>(call("POST", `/safety/changes/${raise.changeId}/approve`, { signature: newSignature, revoke: await signRevokeRequest(wallet, raise.approval.revoke) }), "approve raise");
  assert.equal(applied.status, "applied");
  if (applied.status !== "applied") throw new Error("not applied");
  assert.equal(applied.safety.allowances.find((entry) => entry.symbol === "USDC")?.perDay, units("6000").toString());

  // 3. The old delegation is disabled on chain; the ops wallet's redeem of it reverts; the new one redeems.
  assert.equal(await disabled(oldGrant.delegation), true, "the old allowance is disabled on chain");
  const refusedOld = await redeemAsOps(oldGrant.delegation);
  assert.match(refusedOld, /^reverted/, refusedOld);
  if (refusedOld.startsWith("reverted 0x")) assert.equal(refusedOld, `reverted ${DISABLED_DELEGATION}`, "CannotUseADisabledDelegation");
  const after1 = await grantRow(first.grantId);
  assert.equal(after1.status, "revoked");
  assert.ok(after1.revokeTxAttemptId, "the revoke transaction is recorded");
  const [disableTx] = await db.select().from(txAttempts).where(eq(txAttempts.id, after1.revokeTxAttemptId!));
  assert.equal(disableTx?.kind, "revoke_grant_relayed");
  assert.equal(disableTx?.status, "confirmed");
  console.log("raise: old allowance disabled on chain", disableTx?.txHash, "· ops redeem of it now:", refusedOld);
  const [newRow] = await db.select().from(grants).where(and(eq(grants.userId, userId), eq(grants.kind, "allowance"), eq(grants.status, "active")));
  assert.equal(await redeemAsOps(newRow!.delegation), "ok");

  // 4. An EURC allowance, then set aside in the database only (what a DB-only "off" or supersede used to leave behind):
  //    the chain still honours it, so revoke-all must cover it.
  const eurc = await json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: { kind: "allowance", token: network.addresses.eurc, perDay: units("1").toString() } }), "add eurc");
  if (eurc.status !== "needs_approval" || eurc.approval.kind !== "grant") throw new Error("expected a grant");
  assert.equal(eurc.approval.revoke, null);
  await json<SafetyChangeResponse>(call("POST", `/safety/changes/${eurc.changeId}/approve`, { signature: await wallet.signTypedData(eurc.approval.typedData as unknown as TypedDataDefinition) }), "approve eurc");
  const [eurcRow] = await db.select().from(grants).where(and(eq(grants.userId, userId), eq(grants.tokenAddress, network.addresses.eurc), eq(grants.status, "active")));
  await db.update(grants).set({ status: "superseded" }).where(eq(grants.id, eurcRow!.id));
  assert.equal(await disabled(eurcRow!.delegation), false, "set aside here, still live on chain");

  const { revoke: all } = await json<{ revoke: RevokeRequest | null }>(call("POST", "/account/grants/revoke/request", { network: "testnet" }), "revoke-all request");
  assert.ok(all && "relayed" in all);
  assert.deepEqual([...(all.grantIds ?? [])].sort(), [newRow!.id, eurcRow!.id].sort(), "every grant the chain still honours, the set-aside one included, and not the one already disabled");
  const revokedAll = await json<{ tx: string; status: string }>(call("POST", "/wallet/transactions/submit", revokeSubmitBody(all, await signRevokeRequest(wallet, all))), "revoke all");
  assert.equal(revokedAll.status, "confirmed");
  assert.equal(await disabled(eurcRow!.delegation), true, "the set-aside EURC grant is disabled on chain");
  assert.equal(await disabled(newRow!.delegation), true);
  assert.match(await redeemAsOps(newRow!.delegation), /^reverted/);
  console.log("revoke-all: set-aside EURC grant and the raised allowance disabled on chain", revokedAll.tx);

  // 5. Nothing is left for the exit kit to revoke; it still pauses.
  const kit = await json<{ revoke: RevokeRequest | null; user: { pausedAllAt: string | null } }>(call("POST", "/safety/exit-kit"), "exit kit");
  assert.equal(kit.revoke, null);
  assert.ok(kit.user.pausedAllAt);
});
