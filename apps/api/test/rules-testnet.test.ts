// Automation rules on Arc testnet (review A1 — Abu's "when my balance reaches X, bridge to Base"): each rule is a
// trigger, an amount rule and one step, drafted, turned on with its grants, and run by Kawase without asking.
//  1. "When my balance goes above 2, bridge what is above 2 to Base": below the line nothing happens; money arriving
//     takes it over → the excess is bridged to the wallet's own address on Base Sepolia (burn, attestation, mint);
//     staying above does not fire again; dropping below re-arms it.
//  2. "When I get money from the ops wallet, save half of it": a matching receipt queues one run → half is saved.
//  3. "Tell me when my balance drops below 1": one alert per crossing, in the inbox.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationGrantRequest, AutomationView, InboxItem, TransactionRequestResponse } from "@kawase/api-client";
import { automations, createDb, intents } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";
import { eq } from "drizzle-orm";

import { appKitBridges } from "../src/bridge/engine";
import { appKitEarn } from "../src/earn/engine";
import { IncomingWatcher } from "../src/incoming/watcher";
import { InboxService } from "../src/inbox/service";
import { RequestService } from "../src/requests/service";
import { circleOps } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 90;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const VAULT = parseAbi(["function balanceOf(address) view returns (uint256)", "function redeem(uint256 shares, address receiver, address owner) returns (uint256)"]);

test("rules on Arc testnet: balance above → bridge the excess to Base, money in → save a share, balance below → alert", { skip: !live, timeout: 1_500_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "ruler", email: `rule-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), undefined, appKitBridges(env), appKitEarn(env), { automationTickMs: 1000, reconcileIntervalMs: 3000 });
  const watcherDb = createDb(process.env.DATABASE_URL!, { poolSize: 2 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const balance = () => client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  let userId = "";
  const vaults: Hex[] = [];
  after(async () => {
    for (const vault of vaults) {
      const shares = await client.readContract({ address: vault, abi: VAULT, functionName: "balanceOf", args: [wallet.address] });
      if (shares > 0n) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: vault, abi: VAULT, functionName: "redeem", args: [shares, wallet.address, wallet.address] }) }).catch(() => undefined);
    }
    const left = await balance();
    if (left > usdc("0.02")) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] }) });
    if (userId) await deleteUser(db, userId);
    await watcherDb.pool.end();
    await close();
  });
  const fund = async (amount: string) => {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      if (DONE_STATES.includes((await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "")) return;
      await wait(POLL_MS);
    }
  };
  const log = createLogger({ service: "rules-test", level: "silent" });
  const inboxService = new InboxService(watcherDb.db, chains);
  const watcher = new IncomingWatcher(watcherDb.db, chains, new RequestService(watcherDb.db, chains, new WalletService(watcherDb.db, chains), inboxService, "http://localhost:8081"), inboxService, log);

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "rules-test-phone-001" } }));
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
  await fund("1");

  const view = async (id: string) => ((await (await call("GET", `/automations/${id}`)).json()) as { automation: AutomationView }).automation;
  const draftRule = async (input: Record<string, unknown>) => ((await (await call("POST", "/automations/rule", input)).json()) as { automation: AutomationView }).automation;
  const turnOn = async (draft: AutomationView) => {
    const request = (await (await call("POST", `/automations/${draft.id}/grant`)).json()) as AutomationGrantRequest;
    assert.ok(Array.isArray(request.grants), `grant request: ${JSON.stringify(request)}`);
    const signatures = await Promise.all(request.grants.map(async (entry) => ({ grantId: entry.grantId, signature: await wallet.signTypedData(entry.typedData as never) })));
    const on = ((await (await call("POST", `/automations/${draft.id}/activate`, { signatures })).json()) as { automation: AutomationView }).automation;
    assert.equal(on.status, "active", JSON.stringify(on));
    return on;
  };
  const cancel = async (id: string) => {
    const canceled = (await (await call("POST", `/automations/${id}/cancel`)).json()) as { revoke: TransactionRequestResponse | null };
    if (!canceled.revoke) return;
    const t = canceled.revoke.transaction;
    const signed = await wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
    await call("POST", "/wallet/transactions/submit", { requestId: canceled.revoke.requestId, signedTransaction: signed });
  };
  const until = async (id: string, check: (a: AutomationView) => boolean, tick = false) => {
    let current = await view(id);
    for (let i = 0; i < POLL_ATTEMPTS && !check(current); i++) {
      if (tick) await watcher.tick();
      await wait(POLL_MS);
      current = await view(id);
    }
    return current;
  };
  const makeDue = (id: string) => db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, id));
  const settledRuns = (a: AutomationView) => a.runs.filter((run) => run.status !== "executing" && run.status !== "pending");
  // Bring the watcher's cursor to now, so the money below is what it reads next.
  for (let i = 0; i < 3; i++) await watcher.tick();

  // 1. Balance above 2 → bridge what is above 2 to Base. Holding 1, nothing happens.
  const bridgeRule = await draftRule({ trigger: "balance_above", threshold: "2", action: "bridge", destination: "base" });
  assert.equal(bridgeRule.blocking, null, JSON.stringify(bridgeRule.results));
  assert.deepEqual(bridgeRule.rule?.amount, { mode: "excess", reserve: usdc("2").toString() });
  assert.equal(bridgeRule.rule?.now, null, "below the line, nothing to do");
  await turnOn(bridgeRule);
  await wait(5000);
  assert.equal(settledRuns(await view(bridgeRule.id)).length, 0, "a check below the line is not shown as a run");
  // Money arrives (1 → 2.6): the watcher wakes the rule, which bridges the 0.6 above the line.
  await fund("1.6");
  const fired = await until(bridgeRule.id, (a) => settledRuns(a).length > 0, true);
  const bridged = settledRuns(fired)[0]!;
  assert.equal(bridged.status, "succeeded", JSON.stringify(fired.runs));
  assert.equal(bridged.trigger?.amount, usdc("0.6").toString());
  assert.equal(await balance(), usdc("2"));
  const [bridgeIntent] = await db.select().from(intents).where(eq(intents.kind, "bridge"));
  console.log("bridged the excess", bridged.tx?.explorerUrl, "intent", bridgeIntent?.state);
  // Still above the line: no second bridge until it has dropped below and come back.
  await makeDue(bridgeRule.id);
  await wait(6000);
  assert.equal(settledRuns(await view(bridgeRule.id)).length, 1, "one crossing, one bridge");
  assert.equal((await view(bridgeRule.id)).rule?.armed, false);
  await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, usdc("0.5")] }) });
  await makeDue(bridgeRule.id);
  const rearmed = await until(bridgeRule.id, (a) => a.rule?.armed === true);
  assert.equal(rearmed.rule?.armed, true, "below the line again: armed for the next crossing");
  await cancel(bridgeRule.id);

  // 2. Money in from the ops wallet → save half of it.
  const saveRule = await draftRule({ trigger: "money_in", from: env.OPS_WALLET_ADDRESS_TESTNET, action: "save", percent: 50 });
  assert.equal(saveRule.blocking?.kind ?? null, saveRule.blocking ? "warning" : null, JSON.stringify(saveRule.results));
  vaults.push((saveRule.rule!.step as { vault: Hex }).vault);
  await turnOn(saveRule);
  await fund("1");
  const saved = await until(saveRule.id, (a) => settledRuns(a).length > 0, true);
  const savedRun = settledRuns(saved)[0]!;
  assert.equal(savedRun.status, "succeeded", JSON.stringify(saved.runs));
  assert.equal(savedRun.trigger?.amount, usdc("0.5").toString());
  console.log("saved half of the money in", savedRun.tx?.explorerUrl);
  await cancel(saveRule.id);

  // 3. Balance below 1 → an alert, once per crossing.
  const alertRule = await draftRule({ trigger: "balance_below", threshold: "1", action: "notify" });
  assert.equal(alertRule.blocking, null, JSON.stringify(alertRule.results));
  const left = await balance();
  await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.5")] }) });
  await turnOn(alertRule);
  const alerted = await until(alertRule.id, (a) => settledRuns(a).length > 0);
  assert.equal(settledRuns(alerted)[0]?.status, "succeeded");
  await makeDue(alertRule.id);
  await wait(6000);
  const inbox = ((await (await call("GET", "/inbox")).json()) as { items: InboxItem[] }).items;
  assert.equal(inbox.filter((item) => item.kind === "rule_alert").length, 1, "one alert per crossing");
  await cancel(alertRule.id);
});
