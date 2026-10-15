// Automation runs survive interruption (review K01): each claimed occurrence reaches one truthful outcome, and money
// moves at most once. The interruptions are made the way a crash leaves them, then the runner inside the api is left
// to find them:
//  1. the claim (with its operation id) committed, then the process stopped before any work → driven again, paid once;
//  2. the money intent created, then the call to Circle lost → submitted again under the same idempotency key, paid once;
//  3. a claim from before runs carried an id → ends as interrupted, the person is told, nothing is paid;
//  4. Auto-save with an orphaned check in the way → the check is recovered and later checks are not blocked.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationGrantRequest, AutomationView, InboxItem } from "@kawase/api-client";
import { automationRuns, automations, intents } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";
import { eq } from "drizzle-orm";

import { appKitEarn } from "../src/earn/engine";
import { circleOps } from "../src/send/ops";
import type { OpsExecutor } from "../src/send/ops";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);
const POLL_MS = 2000;
const POLL_ATTEMPTS = 75;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
/** Older than the runner's lease (two minutes): what a run left by a stopped process looks like. */
const ABANDONED_MS = 3 * 60_000;
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const VAULT = parseAbi(["function balanceOf(address) view returns (uint256)", "function redeem(uint256 shares, address receiver, address owner) returns (uint256)"]);

test("automation runs recover from interruption: one truthful outcome each, never paid twice", { skip: !live, timeout: 1_200_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const network = getNetwork("testnet");
  const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const signer = createWalletClient({ account: wallet, chain: network.viemChain, transport: http(env.ARC_RPC_URL_TESTNET) });
  const TEST_ID = randomUUID();
  const person = privyPerson(`recover-${TEST_ID}@example.test`, wallet.address);
  // The ops wallet as Circle, except that the call can be made to fail once the way a lost connection does.
  const real = circleOps(env);
  let loseNextCall = false;
  let lostCalls = 0;
  const flaky: OpsExecutor = {
    execute: async (call) => {
      if (loseNextCall) {
        loseNextCall = false;
        lostCalls += 1;
        throw new Error("socket hang up");
      }
      return real.execute(call);
    },
    get: (network, id) => real.get(network, id),
  };
  const { app, db, close } = testApp(chains, undefined, flaky, undefined, undefined, appKitEarn(env), { automationTickMs: 1000, reconcileIntervalMs: 3000 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const usdcOf = (address: Hex) => client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  let userId = "";
  let vault: Hex | undefined;
  after(async () => {
    if (vault) {
      const shares = await client.readContract({ address: vault, abi: VAULT, functionName: "balanceOf", args: [wallet.address] });
      if (shares > 0n) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: vault, abi: VAULT, functionName: "redeem", args: [shares, wallet.address, wallet.address] }) }).catch(() => undefined);
    }
    const left = await usdcOf(wallet.address);
    if (left > usdc("0.02")) await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [env.OPS_WALLET_ADDRESS_TESTNET as Hex, left - usdc("0.02")] }) });
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const fund = async (amount: string) => {
    const drip = await circle.createTransaction({ walletAddress: env.OPS_WALLET_ADDRESS_TESTNET, blockchain: network.circleBlockchain, tokenAddress: network.addresses.usdc, destinationAddress: wallet.address, amount: [amount], fee: { type: "level", config: { feeLevel: "MEDIUM" } }, idempotencyKey: randomUUID() });
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      if (DONE_STATES.includes((await circle.getTransaction({ id: drip.data?.id ?? "" })).data?.transaction?.state ?? "")) return;
      await wait(POLL_MS);
    }
  };

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "recover-test-phone-01" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const { authorization } = (await (await call("POST", "/wallet/setup/request", { network: "testnet" })).json()) as { authorization: { contractAddress: Hex; chainId: number; nonce: number } };
  const signedAuth = await wallet.signAuthorization(authorization);
  await expectStatus(
    await call("POST", "/wallet/setup/submit", { network: "testnet", authorization: { address: signedAuth.address, chainId: signedAuth.chainId, nonce: signedAuth.nonce, r: signedAuth.r, s: signedAuth.s, yParity: signedAuth.yParity } }),
    200,
    "setup",
  );
  await fund("0.3");

  const alex = privateKeyToAccount(generatePrivateKey()).address;
  const bob = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Alex", address: alex, source: "pasted" }), 201, "alex");
  await expectStatus(await call("POST", "/contacts", { displayName: "Bob", address: bob, source: "pasted" }), 201, "bob");
  const view = async (id: string) => ((await (await call("GET", `/automations/${id}`)).json()) as { automation: AutomationView }).automation;
  const turnOn = async (draft: AutomationView) => {
    const request = (await (await call("POST", `/automations/${draft.id}/grant`)).json()) as AutomationGrantRequest;
    const signatures = await Promise.all(request.grants.map(async (entry) => ({ grantId: entry.grantId, signature: await wallet.signTypedData(entry.typedData as never) })));
    const on = ((await (await call("POST", `/automations/${draft.id}/activate`, { signatures })).json()) as { automation: AutomationView }).automation;
    assert.equal(on.status, "active");
    return on;
  };
  const runOf = async (runId: string) => (await db.select().from(automationRuns).where(eq(automationRuns.id, runId)))[0]!;
  const untilRun = async (runId: string, done: (status: string) => boolean) => {
    let run = await runOf(runId);
    for (let i = 0; i < POLL_ATTEMPTS && !done(run.status); i++) {
      await wait(POLL_MS);
      run = await runOf(runId);
    }
    return run;
  };
  const tomorrow = new Date(Date.now() + 86_400_000);
  /** What a stopped process leaves: a committed claim (with or without its operation id), the schedule advanced. */
  const orphan = async (automationId: string, intentId: string | null) => {
    const [run] = await db
      .insert(automationRuns)
      .values({ automationId, userId, scheduledFor: new Date(Date.now() - 60_000), status: "executing", intentId, createdAt: new Date(Date.now() - ABANDONED_MS), updatedAt: new Date(Date.now() - ABANDONED_MS) })
      .returning();
    await db.update(automations).set({ nextRunAt: tomorrow }).where(eq(automations.id, automationId));
    return run!;
  };

  // 1. Claimed, then the process stopped before any work: driven again under the same id, Alex paid exactly once.
  const daily = ((await (await call("POST", "/automations", { recipient: "Alex", amount: "0.05", every: "day", time: "09:00", timezone: "UTC" })).json()) as { automation: AutomationView }).automation;
  await turnOn(daily);
  await db.update(automations).set({ nextRunAt: tomorrow }).where(eq(automations.id, daily.id));
  const operation = randomUUID();
  const stranded = await orphan(daily.id, operation);
  const recovered = await untilRun(stranded.id, (status) => status !== "executing");
  assert.equal(recovered.status, "succeeded", JSON.stringify(recovered));
  assert.equal(recovered.intentId, operation, "the money intent carries the run's own id");
  const [intent] = await db.select().from(intents).where(eq(intents.id, operation));
  assert.equal(intent?.state, "completed");
  assert.equal(await usdcOf(alex), usdc("0.05"));
  await wait(8000);
  assert.equal(await usdcOf(alex), usdc("0.05"), "recovered once, paid once");
  console.log("recovered a stranded claim", (await view(daily.id)).runs.find((run) => run.id === stranded.id)?.tx?.explorerUrl);

  // 2. The money intent was created, then the call to Circle was lost: the same attempt goes again, Bob paid once.
  const weekly = ((await (await call("POST", "/automations", { recipient: "Bob", amount: "0.05", every: "week", time: "09:00", timezone: "UTC" })).json()) as { automation: AutomationView }).automation;
  await turnOn(weekly);
  loseNextCall = true;
  await db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, weekly.id));
  let claimed = (await db.select().from(automationRuns).where(eq(automationRuns.automationId, weekly.id)))[0];
  for (let i = 0; i < POLL_ATTEMPTS && !claimed; i++) {
    await wait(POLL_MS / 4);
    claimed = (await db.select().from(automationRuns).where(eq(automationRuns.automationId, weekly.id)))[0];
  }
  assert.ok(claimed?.intentId, "the claim carries its operation id before any work");
  const lost = await untilRun(claimed.id, (status) => status !== "executing");
  assert.equal(lostCalls, 1, "the first call to Circle was lost");
  assert.equal(lost.status, "succeeded", JSON.stringify(lost));
  assert.equal(await usdcOf(bob), usdc("0.05"));
  await wait(8000);
  assert.equal(await usdcOf(bob), usdc("0.05"), "resubmitted once, paid once");
  console.log("resubmitted after a lost call", (await view(weekly.id)).runs[0]?.tx?.explorerUrl);

  // 3. A claim from before runs carried an id: its work cannot be found, so it ends as interrupted and says so.
  const legacy = await orphan(daily.id, null);
  const ended = await untilRun(legacy.id, (status) => status !== "executing");
  assert.equal(ended.status, "skipped");
  assert.equal(ended.reason, "RUN_INTERRUPTED");
  const inbox = ((await (await call("GET", "/inbox")).json()) as { items: InboxItem[] }).items;
  assert.ok(inbox.some((item) => item.kind === "automation_skipped" && item.params.reason === "RUN_INTERRUPTED"));
  assert.equal(await usdcOf(alex), usdc("0.05"), "an interrupted legacy run pays nothing");

  // 4. Auto-save with an orphaned check in the way: the check is recovered, and the next check is not blocked.
  await fund("2.5");
  const save = ((await (await call("POST", "/automations/auto-save", { keep: "0.5" })).json()) as { automation: AutomationView }).automation;
  assert.equal(save.blocking, null, JSON.stringify(save.results));
  vault = save.save!.vault as Hex;
  await turnOn(save);
  // Let the first check (at turn-on) finish, then strand one and make the next one due behind it.
  let current = await view(save.id);
  for (let i = 0; i < POLL_ATTEMPTS && !current.runs.some((run) => run.status === "succeeded"); i++) {
    await wait(POLL_MS);
    current = await view(save.id);
  }
  const savedFirst = current.runs.filter((run) => run.status === "succeeded").length;
  await fund("1.5");
  const blocked = await orphan(save.id, randomUUID());
  await db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, save.id));
  const unblocked = await untilRun(blocked.id, (status) => status !== "executing");
  assert.equal(unblocked.status, "succeeded", JSON.stringify(unblocked));
  assert.equal(unblocked.move?.direction, "in");
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const [row] = await db.select().from(automations).where(eq(automations.id, save.id));
    if (row!.nextRunAt && row!.nextRunAt.getTime() > Date.now()) break;
    await wait(POLL_MS);
  }
  const [after4] = await db.select().from(automations).where(eq(automations.id, save.id));
  assert.ok(after4!.nextRunAt!.getTime() > Date.now(), "the check that was due behind the orphan ran");
  assert.ok((await view(save.id)).runs.filter((run) => run.status === "succeeded").length >= savedFirst + 1);
  console.log("recovered an orphaned Auto-save check", (await view(save.id)).runs.find((run) => run.id === blocked.id)?.tx?.explorerUrl);
});
