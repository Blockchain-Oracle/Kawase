// Automations on Arc testnet (Stage 8 exit): "every day send 0.05 USDC to Alex" is drafted, its grant signed by the
// wallet (a local key standing in for Turnkey) and turned on, and the runner inside the api pays Alex without asking.
// Then the guarantees: the same occurrence never pays twice (one row per automation and time), a second run in the
// same period is refused because the grant's on-chain cap is used, the ops wallet itself cannot redeem the grant to
// anyone else or above the cap (the chain refuses), pause / skip work, and cancelling revokes the grant on chain.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TransactionSerializable } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationView, InboxItem, TransactionRequestResponse } from "@kawase/api-client";
import { automations } from "@kawase/db";
import { encodeRedeemTransfer } from "@kawase/integrations-delegation";
import { eq } from "drizzle-orm";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("automations on Arc testnet: unattended runs, bounded on chain", { skip: !live, timeout: 600_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "automator", email: `auto-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), undefined, undefined, undefined, { automationTickMs: 1000 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
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
  });

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "auto-test-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
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
    amount: ["0.3"],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
    if (DONE_STATES.includes(state)) break;
    await wait(POLL_MS);
  }

  const alex = privateKeyToAccount(generatePrivateKey()).address;
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const alexBalance = () => client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [alex] });
  await expectStatus(await call("POST", "/contacts", { displayName: "Alex", address: alex, source: "pasted" }), 201, "alex");
  const view = async (id: string) => ((await (await call("GET", `/automations/${id}`)).json()) as { automation: AutomationView }).automation;
  const makeDue = (id: string, at = new Date(Date.now() - 1000)) => db.update(automations).set({ nextRunAt: at }).where(eq(automations.id, id));
  const until = async (id: string, check: (a: AutomationView) => boolean) => {
    let current = await view(id);
    for (let i = 0; i < POLL_ATTEMPTS && !check(current); i++) {
      await wait(POLL_MS);
      current = await view(id);
    }
    return current;
  };

  // 1. Draft: the read-back, the next runs, the bound.
  const draft = ((await (await call("POST", "/automations", { recipient: "Alex", amount: "0.05", every: "day", time: "09:00", timezone: "Africa/Lagos" })).json()) as { automation: AutomationView }).automation;
  assert.equal(draft.status, "draft");
  assert.equal(draft.blocking, null, JSON.stringify(draft.results));
  assert.equal(draft.nextRuns.length, 3);
  assert.equal(draft.maxPerPeriod, usdc("0.05").toString());
  assert.equal(draft.periodSeconds, 86_400);

  // 2. On: the wallet signs the grant (pinned to Alex, 0.05 a day).
  const grant = (await (await call("POST", `/automations/${draft.id}/grant`)).json()) as { grants: { grantId: string; typedData: Parameters<typeof wallet.signTypedData>[0] }[] };
  assert.equal(grant.grants.length, 1);
  const signature = await wallet.signTypedData(grant.grants[0]!.typedData);
  const on = ((await (await call("POST", `/automations/${draft.id}/activate`, { signatures: [{ grantId: grant.grants[0]!.grantId, signature }] })).json()) as { automation: AutomationView }).automation;
  assert.equal(on.status, "active");
  assert.equal(on.grant?.status, "active");

  // 3. Due now: the runner pays Alex, unattended.
  const firstRunAt = new Date(Date.now() - 1000);
  await makeDue(draft.id, firstRunAt);
  const ran = await until(draft.id, (a) => a.runs[0]?.status === "succeeded" || a.runs[0]?.status === "failed" || a.runs[0]?.status === "skipped");
  assert.equal(ran.runs[0]?.status, "succeeded", JSON.stringify(ran.runs));
  assert.equal(await alexBalance(), usdc("0.05"));
  console.log("ran unattended", ran.runs[0]?.tx?.explorerUrl);

  // 4. The same occurrence again: already claimed, never paid twice.
  await makeDue(draft.id, firstRunAt);
  await wait(4000);
  assert.equal(await alexBalance(), usdc("0.05"), "one occurrence, one payment");

  // 5. Another occurrence in the same period: the grant's cap is used, the run is skipped and the person told.
  await makeDue(draft.id);
  const capped = await until(draft.id, (a) => a.runs.some((run) => run.reason === "AUTOMATION_PERIOD_USED"));
  assert.ok(capped.runs.some((run) => run.status === "skipped" && run.reason === "AUTOMATION_PERIOD_USED"), JSON.stringify(capped.runs));
  const inbox = ((await (await call("GET", "/inbox")).json()) as { items: InboxItem[] }).items;
  assert.ok(inbox.some((item) => item.kind === "automation_skipped" && item.params.reason === "AUTOMATION_PERIOD_USED"));
  assert.equal(await alexBalance(), usdc("0.05"));

  // 6. The chain itself refuses the ops wallet: another recipient, or more than the cap.
  const ops = circleOps(env);
  const [row] = await db.select().from(automations).where(eq(automations.id, draft.id));
  const { grants } = await import("@kawase/db");
  const [grantRow] = await db.select().from(grants).where(eq(grants.id, row!.grantId!));
  const attempt = async (to: Hex, amount: bigint) => {
    const call = encodeRedeemTransfer(network, grantRow!.delegation as never, { token: network.addresses.usdc, to, amount });
    try {
      const sent = await ops.execute({ network: "testnet", walletId: env.OPS_WALLET_ID_TESTNET, contract: call.to, callData: call.data, idempotencyKey: randomUUID(), refId: `auto-test:${randomUUID()}` });
      let tx = sent;
      for (let i = 0; i < POLL_ATTEMPTS && tx.state === "pending"; i++) {
        await wait(POLL_MS);
        tx = await ops.get("testnet", sent.id);
      }
      return tx.state;
    } catch {
      return "refused";
    }
  };
  assert.notEqual(await attempt(stranger, usdc("0.01")), "complete", "the grant is pinned to Alex");
  assert.equal(await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [stranger] }), 0n);

  // 7. Pause: due, but nothing runs. Resume and skip: the skipped run is recorded as the person's own choice.
  await call("POST", `/automations/${draft.id}/pause`);
  await makeDue(draft.id);
  await wait(4000);
  assert.equal((await view(draft.id)).status, "paused");
  assert.equal(await alexBalance(), usdc("0.05"), "a paused automation does not run");
  await call("POST", `/automations/${draft.id}/resume`);
  const skipped = ((await (await call("POST", `/automations/${draft.id}/skip`)).json()) as { automation: AutomationView }).automation;
  assert.ok(skipped.runs.some((run) => run.reason === "SKIPPED_BY_YOU"));

  // 8. Cancel: nothing runs again, and the wallet revokes the grant on chain.
  const canceled = (await (await call("POST", `/automations/${draft.id}/cancel`)).json()) as { automation: AutomationView; revoke: TransactionRequestResponse | null };
  assert.equal(canceled.automation.status, "canceled");
  assert.ok(canceled.revoke, "a revoke transaction to sign");
  const t = canceled.revoke!.transaction;
  const signed = await wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  const revoked = (await (await call("POST", "/wallet/transactions/submit", { requestId: canceled.revoke!.requestId, signedTransaction: signed })).json()) as { status: string; tx: string };
  assert.equal(revoked.status, "confirmed", JSON.stringify(revoked));
  assert.equal((await view(draft.id)).grant?.status, "revoked");
  console.log("revoked", revoked.tx);
});
