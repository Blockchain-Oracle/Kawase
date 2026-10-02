// Wallet & limits on Arc testnet (cards/automate-safety.md "Stay in control"; X3, X7, X11, G8): an allowance per token
// on chain, tightening at once and loosening with the wallet's signature (a new grant plus the old one's revoke), the
// per-payment cap, pause all and resume, the risk dial, practice mode's dry run, and the exit kit revoking every grant
// in one transaction. The wallet is a local key standing in for Turnkey; the ops wallet is Circle's.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test (or this file alone).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseUnits, type Hex, type TypedDataDefinition } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { SafetyChangeResponse, SafetyView, SendApproveResponse, SendIntent, TransactionRequestResponse, ExitKitResponse } from "@kawase/api-client";
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
const FINAL = ["completed", "failed", "canceled", "expired", "unknown_outcome"];
const units = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("wallet & limits on Arc testnet: per-token allowance, tighten/loosen, pause, dial, practice, exit kit", { skip: !live, timeout: 900_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "limits", email: `limits-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), undefined, undefined, undefined, { reconcileIntervalMs: 2000 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  let userId = "";
  after(async () => {
    for (const token of [network.addresses.eurc, network.addresses.usdc]) {
      const left = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
      const keep = token === network.addresses.usdc ? units("0.02") : 0n;
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
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "limits-test-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const json = async <T>(response: Promise<Response>, what: string, status = 200) => {
    const answer = await response;
    await expectStatus(answer, status, what);
    return (await answer.json()) as T;
  };
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  const allowance = await json<{ grantId: string; typedData: TypedDataDefinition }>(call("POST", "/wallet/allowance/request", { network: "testnet" }), "allowance request");
  await expectStatus(await call("POST", "/wallet/allowance/submit", { grantId: allowance.grantId, signature: await wallet.signTypedData(allowance.typedData) }), 200, "allowance");

  // Fund the wallet from the ops wallet: USDC (which also pays its own revokes' gas) and EURC.
  for (const [tokenAddress, amount] of [[network.addresses.usdc, "0.5"], [network.addresses.eurc, "0.3"]] as const) {
    const drip = await circle.createTransaction({
      walletAddress: env.OPS_WALLET_ADDRESS_TESTNET,
      blockchain: network.circleBlockchain,
      tokenAddress,
      destinationAddress: wallet.address,
      amount: [amount],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const state = (await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "";
      if (DONE_STATES.includes(state)) break;
      await wait(POLL_MS);
    }
  }

  const bob = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Bob", address: bob, source: "pasted" }), 201, "contact");
  const view = () => json<SafetyView>(call("GET", "/safety"), "safety");
  const change = (body: unknown) => json<SafetyChangeResponse>(call("POST", "/safety/changes", { change: body }), "change");
  const approve = (id: string, signature: Hex) => json<SafetyChangeResponse>(call("POST", `/safety/changes/${id}/approve`, { signature }), "approve");
  const signTx = (request: TransactionRequestResponse) => {
    const t = request.transaction;
    return wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  };
  const draftSend = async (recipient: string, amount: string, asset: "USDC" | "EURC" = "USDC") =>
    (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient, amount, asset }), "draft", 201)).intent;
  const waitFinal = async (id: string) => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const { intent } = (await (await call("GET", `/sends/${id}`)).json()) as { intent: SendIntent };
      if (FINAL.includes(intent.state)) return intent;
      await wait(POLL_MS);
    }
    throw new Error(`send ${id} did not finish`);
  };

  // 1. The receipt: one allowance (USDC), Balanced, not paused, not practising.
  const start = await view();
  assert.equal(start.allowances.length, 1);
  assert.equal(start.allowances[0]!.symbol, "USDC");
  assert.equal(start.riskMode, "balanced");
  assert.equal(start.pausedAt, null);

  // 2. Add EURC as its own allowance: a new grant, signed (no old one to revoke).
  const addEurc = await change({ kind: "allowance", token: network.addresses.eurc, perDay: units("0.2").toString() });
  assert.equal(addEurc.status, "needs_approval");
  assert.ok(addEurc.status === "needs_approval" && addEurc.approval.kind === "grant" && addEurc.approval.revoke === null);
  if (addEurc.status !== "needs_approval" || addEurc.approval.kind !== "grant") throw new Error("expected a grant");
  const eurcOn = await approve(addEurc.changeId, await wallet.signTypedData(addEurc.approval.typedData as unknown as TypedDataDefinition));
  assert.equal(eurcOn.status, "applied");
  assert.deepEqual(eurcOn.safety.allowances.map((entry) => entry.symbol).sort(), ["EURC", "USDC"]);

  // 3. Tighten USDC to 0.05 a day: instant, server-side; the chain still guarantees the signed 5,000.
  const tighter = await change({ kind: "allowance", token: network.addresses.usdc, perDay: units("0.05").toString() });
  assert.equal(tighter.status, "applied");
  const usdcRow = tighter.status === "applied" ? tighter.safety.allowances.find((entry) => entry.symbol === "USDC")! : undefined;
  assert.equal(usdcRow?.perDay, units("0.05").toString());
  assert.ok(BigInt(usdcRow!.signedPerDay) > units("0.05"));
  // Above the tighter cap: Face ID; inside it: no prompt, and it lands.
  assert.equal((await draftSend("Bob", "0.1")).route, "wallet_signature");
  const small = await draftSend("Bob", "0.02");
  assert.equal(small.route, "allowance", JSON.stringify(small.results));
  await json<SendApproveResponse>(call("POST", `/sends/${small.id}/approve`, { version: small.version }), "approve small");
  const smallDone = await waitFinal(small.id);
  assert.equal(smallDone.outcome, "sent", JSON.stringify(smallDone));
  console.log("USDC inside the tightened allowance", smallDone.tx?.explorerUrl);
  // Room left today: 0.05 − 0.02.
  assert.equal((await view()).allowances.find((entry) => entry.symbol === "USDC")!.leftToday, units("0.03").toString());

  // 4. EURC inside its own allowance, redeemed by the ops wallet under the EURC grant.
  const eurcSend = await draftSend("Bob", "0.05", "EURC");
  assert.equal(eurcSend.route, "allowance", JSON.stringify(eurcSend.results));
  await json<SendApproveResponse>(call("POST", `/sends/${eurcSend.id}/approve`, { version: eurcSend.version }), "approve eurc");
  const eurcDone = await waitFinal(eurcSend.id);
  assert.equal(eurcDone.outcome, "sent", JSON.stringify(eurcDone));
  console.log("EURC inside its own allowance", eurcDone.tx?.explorerUrl);

  // 5. Loosen EURC 0.2 → 0.25: Now → After, a new grant and the old one's revoke, one yes.
  const looser = await change({ kind: "allowance", token: network.addresses.eurc, perDay: units("0.25").toString() });
  if (looser.status !== "needs_approval" || looser.approval.kind !== "grant") throw new Error(`expected a grant: ${JSON.stringify(looser)}`);
  assert.equal(looser.before.amount, units("0.2").toString());
  assert.equal(looser.after.amount, units("0.25").toString());
  assert.ok(looser.approval.revoke, "the old grant's revoke rides along");
  const looserSigned = await wallet.signTypedData(looser.approval.typedData as unknown as TypedDataDefinition);
  const revokeSigned = await signTx(looser.approval.revoke!);
  const applied = await approve(looser.changeId, looserSigned);
  assert.equal(applied.status === "applied" ? applied.safety.allowances.find((entry) => entry.symbol === "EURC")?.perDay : undefined, units("0.25").toString());
  const oldRevoked = await json<{ tx: string; status: string }>(call("POST", "/wallet/transactions/submit", { requestId: looser.approval.revoke!.requestId, signedTransaction: revokeSigned }), "revoke old");
  assert.equal(oldRevoked.status, "confirmed");
  console.log("old EURC grant revoked on chain", oldRevoked.tx);

  // 6. The per-payment cap, tightened at once.
  assert.equal((await change({ kind: "per_payment", value: units("0.5").toString() })).status, "applied");
  const tooBig = await draftSend("Bob", "0.6");
  assert.equal(tooBig.blocking?.code, "OVER_PER_TX_LIMIT");

  // 7. Pause all: instant; the agent's route is gone, the person's own Face ID still works. Resume: signed.
  const paused = await change({ kind: "pause", on: true });
  assert.ok(paused.status === "applied" && paused.user.pausedAllAt);
  const whilePaused = await draftSend("Bob", "0.01");
  assert.equal(whilePaused.route, "wallet_signature");
  assert.ok(whilePaused.results.some((entry) => entry.code === "AGENT_PAUSED"));
  const resume = await change({ kind: "pause", on: false });
  if (resume.status !== "needs_approval" || resume.approval.kind !== "message") throw new Error("resume needs a signature");
  // A signature by anyone else is refused.
  const stranger = privateKeyToAccount(generatePrivateKey());
  const refused = await call("POST", `/safety/changes/${resume.changeId}/approve`, { signature: await stranger.signTypedData(resume.approval.typedData as unknown as TypedDataDefinition) });
  assert.equal(refused.status, 422);
  const resumed = await approve(resume.changeId, await wallet.signTypedData(resume.approval.typedData as unknown as TypedDataDefinition));
  assert.ok(resumed.status === "applied" && resumed.user.pausedAllAt === null);

  // 8. The risk dial: Guard at once; Autonomous needs the wallet's yes.
  assert.equal((await change({ kind: "risk_mode", mode: "careful" })).status, "applied");
  const autonomous = await change({ kind: "risk_mode", mode: "autonomous" });
  if (autonomous.status !== "needs_approval" || autonomous.approval.kind !== "message") throw new Error("autonomous needs a signature");
  const dialed = await approve(autonomous.changeId, await wallet.signTypedData(autonomous.approval.typedData as unknown as TypedDataDefinition));
  assert.ok(dialed.status === "applied" && dialed.safety.riskMode === "autonomous");

  // 9. Practice: a send is dry-run on chain ("would have"), nothing leaves the wallet.
  assert.equal((await change({ kind: "practice", on: true })).status, "applied");
  const before = await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [bob] });
  const practice = await draftSend("Bob", "0.01");
  const practiced = await json<SendApproveResponse>(call("POST", `/sends/${practice.id}/approve`, { version: practice.version }), "approve practice");
  assert.equal(practiced.intent.outcome, "practiced");
  assert.equal(practiced.intent.practice?.ok, true, JSON.stringify(practiced.intent.practice));
  assert.equal(await client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [bob] }), before);

  // 10. The exit kit: pause, then one transaction revokes every grant on this network.
  const kit = await json<ExitKitResponse>(call("POST", "/safety/exit-kit"), "exit kit");
  assert.ok(kit.user.pausedAllAt);
  assert.ok(kit.revoke);
  const kitRevoked = await json<{ tx: string; status: string }>(call("POST", "/wallet/transactions/submit", { requestId: kit.revoke!.requestId, signedTransaction: await signTx(kit.revoke!) }), "revoke all");
  assert.equal(kitRevoked.status, "confirmed");
  console.log("exit kit: every grant revoked", kitRevoked.tx);
  const end = await view();
  assert.equal(end.allowances.length, 0);
  assert.deepEqual(end.grants, { allowance: 0, automation: 0, marketplace: 0 });
});
