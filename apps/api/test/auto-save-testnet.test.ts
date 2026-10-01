// Auto-save on Arc testnet (Stage 8b): "keep 1.2 USDC ready, the rest earns" is drafted, its three grants signed by
// the wallet (a local key standing in for Turnkey; one Face ID on a phone) and turned on. The runner inside the api
// saves what is above the line at once, tops the wallet up from savings when it drops below, and money arriving wakes
// it (the incoming watcher) so the new money is saved within a tick — while the money coming back from savings is not
// called "received". Cancelling revokes all three grants in one transaction. The chain-side bound (nothing can go
// anywhere but the wallet's own position) is proven in packages/integrations/app-kit/test/auto-save.integration.ts.
// Skipped without the server keys in the root .env. Run: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AutomationGrantRequest, AutomationView, InboxItem, TransactionRequestResponse } from "@kawase/api-client";
import { automations, createDb } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";
import { getNetwork } from "@kawase/networks";
import { eq } from "drizzle-orm";

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
const POLL_ATTEMPTS = 60;
const DONE_STATES = ["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"];
const usdc = (value: string) => parseUnits(value, 6);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const VAULT = parseAbi(["function balanceOf(address) view returns (uint256)", "function redeem(uint256 shares, address receiver, address owner) returns (uint256)"]);

test("auto-save on Arc testnet: saves above the line, tops up below it, wakes when money arrives", { skip: !live, timeout: 900_000 }, async () => {
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
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "saver", email: `save-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, chains, undefined, circleOps(env), undefined, undefined, appKitEarn(env), { automationTickMs: 1000, reconcileIntervalMs: 2000 });
  const watcherDb = createDb(process.env.DATABASE_URL!, { poolSize: 2 });
  const circle = initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_TEST_API_KEY, entitySecret: env.CIRCLE_TEST_ENTITY_SECRET });
  const balance = () => client.readContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  let userId = "";
  let vault: Hex | undefined;
  after(async () => {
    if (vault) {
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

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "save-test-phone-0001" } }));
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
  await fund("3");

  const view = async (id: string) => ((await (await call("GET", `/automations/${id}`)).json()) as { automation: AutomationView }).automation;
  const until = async (id: string, check: (a: AutomationView) => boolean) => {
    let current = await view(id);
    for (let i = 0; i < POLL_ATTEMPTS && !check(current); i++) {
      await wait(POLL_MS);
      current = await view(id);
    }
    return current;
  };
  const settled = (count: number) => (a: AutomationView) => a.runs.filter((run) => run.status !== "executing").length >= count;

  // 1. Draft: keep 1.2 ready; the card already knows what a check now would move (3 − 1.2 = 1.8 into savings).
  const draft = ((await (await call("POST", "/automations/auto-save", { keep: "1.2" })).json()) as { automation: AutomationView }).automation;
  assert.equal(draft.kind, "auto_save");
  assert.equal(draft.blocking, null, JSON.stringify(draft.results));
  assert.ok(draft.save?.vault, "a vault was chosen");
  assert.equal(draft.save?.keep, usdc("1.2").toString());
  assert.deepEqual(draft.save?.now, { direction: "in", amount: usdc("1.8").toString() });
  vault = draft.save!.vault as Hex;

  // 2. On: three grants, one signature each (one Face ID on a phone); it checks at once and saves 1.8.
  const grant = (await (await call("POST", `/automations/${draft.id}/grant`)).json()) as AutomationGrantRequest;
  assert.equal(grant.grants.length, 3);
  const signatures = await Promise.all(grant.grants.map(async (entry) => ({ grantId: entry.grantId, signature: await wallet.signTypedData(entry.typedData as never) })));
  const on = ((await (await call("POST", `/automations/${draft.id}/activate`, { signatures })).json()) as { automation: AutomationView }).automation;
  assert.equal(on.status, "active");
  const saved = await until(draft.id, settled(1));
  assert.equal(saved.runs[0]?.status, "succeeded", JSON.stringify(saved.runs));
  assert.deepEqual(saved.runs[0]?.move, { direction: "in", amount: usdc("1.8").toString() });
  assert.equal(await balance(), usdc("1.2"));
  console.log("saved", saved.runs[0]?.tx?.explorerUrl);

  // 3. The person spends; the next check tops the wallet back up to exactly 1.2 from savings.
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  await client.waitForTransactionReceipt({ hash: await signer.writeContract({ address: network.addresses.usdc, abi: erc20Abi, functionName: "transfer", args: [stranger, usdc("1.15")] }) });
  await db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, draft.id));
  const topped = await until(draft.id, settled(2));
  assert.equal(topped.runs[0]?.status, "succeeded", JSON.stringify(topped.runs));
  assert.equal(topped.runs[0]?.move?.direction, "out");
  assert.equal(await balance(), usdc("1.2"), "topped back up to the line");
  console.log("topped up", topped.runs[0]?.tx?.explorerUrl);

  // 4. Money arrives: the watcher wakes Auto-save and the new money is saved; savings coming back were not "received".
  await fund("1.5");
  const log = createLogger({ service: "save-test", level: "silent" });
  const inboxService = new InboxService(watcherDb.db, chains);
  const watcher = new IncomingWatcher(watcherDb.db, chains, new RequestService(watcherDb.db, chains, new WalletService(watcherDb.db, chains), inboxService, "http://localhost:8081"), inboxService, log);
  let woken = await view(draft.id);
  for (let i = 0; i < POLL_ATTEMPTS && !settled(3)(woken); i++) {
    await watcher.tick();
    await wait(POLL_MS);
    woken = await view(draft.id);
  }
  assert.equal(woken.runs[0]?.status, "succeeded", JSON.stringify(woken.runs));
  assert.deepEqual(woken.runs[0]?.move, { direction: "in", amount: usdc("1.5").toString() });
  assert.equal(await balance(), usdc("1.2"));
  console.log("woken by money in, saved", woken.runs[0]?.tx?.explorerUrl);
  const inbox = ((await (await call("GET", "/inbox")).json()) as { items: InboxItem[] }).items;
  assert.ok(inbox.some((item) => item.kind === "payment_received" && item.params.amount === usdc("1.5").toString()), "the money in is in the inbox");
  assert.ok(!inbox.some((item) => item.kind === "payment_received" && item.params.from?.toLowerCase() === vault!.toLowerCase()), "savings coming back are not money received");

  // 5. Cancel: one transaction revokes all three grants.
  const canceled = (await (await call("POST", `/automations/${draft.id}/cancel`)).json()) as { automation: AutomationView; revoke: TransactionRequestResponse | null };
  assert.equal(canceled.automation.status, "canceled");
  const t = canceled.revoke!.transaction;
  assert.equal(t.to.toLowerCase(), wallet.address.toLowerCase(), "a batch the wallet sends to itself");
  const signed = await wallet.signTransaction({ type: "eip1559", chainId: t.chainId, nonce: t.nonce, to: t.to, data: t.data, value: 0n, gas: BigInt(t.gas), maxFeePerGas: BigInt(t.maxFeePerGas), maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas) });
  const revoked = (await (await call("POST", "/wallet/transactions/submit", { requestId: canceled.revoke!.requestId, signedTransaction: signed })).json()) as { status: string; tx: string };
  assert.equal(revoked.status, "confirmed", JSON.stringify(revoked));
  const { grants } = await import("@kawase/db");
  const rows = await db.select().from(grants).where(eq(grants.automationId, draft.id));
  assert.equal(rows.filter((row) => row.status === "revoked").length, 3, "all three revoked");
  console.log("revoked all three", revoked.tx);
});
