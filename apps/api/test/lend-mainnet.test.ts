// Earn options and borrowing through the api against Arc mainnet reads (no funds move): the yield-options card for
// 20 USDC compares Aave V4 (live supply rate and what it can pay out), App Kit's liquid Morpho vaults and Aero LP
// (advanced, shown only); a borrow of 5 USDC against 0.0002 cirBTC gets a real health figure and rate, and too big a
// loan is refused by the health floor; EURC cannot be collateral. The wallet holds nothing, so drafts wait for money.
// The batches run in test/lend.sim.ts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { LendAccountView, LendIntent, YieldOptionsView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork, type NetworkId } from "@kawase/networks";

import { appKitEarn } from "../src/earn/engine";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const RPC = { mainnet: process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io", testnet: process.env.ARC_RPC_URL_TESTNET } as const;
const TIMEOUT_MS = 60_000;

function readOnlyChains(): Chains {
  const relayer = privateKeyToAccount(generatePrivateKey());
  const make = (id: NetworkId): NetworkClients => {
    const network = getNetwork(id);
    const transport = http(RPC[id], { timeout: TIMEOUT_MS });
    return { network, client: createPublicClient({ chain: network.viemChain, transport }), relayer: createWalletClient({ account: relayer, chain: network.viemChain, transport }), relayerAddress: relayer.address, ops: { walletId: "none", address: relayer.address } };
  };
  const clients = { mainnet: make("mainnet"), testnet: make("testnet") };
  return { available: ["mainnet", "testnet"], get: (network) => clients[network] };
}

test("lend: yield options, a borrow with its health, the floor and the collateral rule", { skip: !process.env.DATABASE_URL, timeout: 300_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address as Address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const key = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "saver", email: `lend-${SUB_ORG}@example.test`, sessionPublicKeys: [key.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet }] },
  );
  const { app, db, close } = testApp(turnkey, readOnlyChains(), undefined, undefined, undefined, undefined, appKitEarn(loadApiEnv()));
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "lend-test-phone-001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet, walletId: "wallet-1" }), 201, "register");
  await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
  await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");

  const options = (await (await call("GET", "/lend/options?asset=USDC&amount=20")).json()) as YieldOptionsView;
  console.log(options.options.map((option) => `${option.kind} ${option.name}: ${(option.rate * 100).toFixed(2)}% ${option.rateKind}${option.withdrawableUsd !== null ? `, $${Math.round(option.withdrawableUsd)} out now` : ""}${option.note ? ` [${option.note}]` : ""}`).join("\n"));
  assert.ok(options.options.some((option) => option.kind === "aave_v4" && option.executable));
  assert.ok(options.best);
  assert.ok(!options.options.some((option) => option.name.includes("Galaxy USDC")), "stuck vaults are not offered");

  const borrow = (await (await call("POST", "/lend/orders", { action: "borrow", asset: "USDC", amount: "5", collateralAsset: "cirBTC", collateralAmount: "0.0002" })).json()) as { intent: LendIntent };
  const draft = borrow.intent.draft;
  assert.ok(draft?.healthAfter && draft.healthAfter > 2, JSON.stringify(borrow.intent));
  console.log(`borrow 5 USDC against 0.0002 cirBTC: health after ${draft!.healthAfter!.toFixed(2)}, rate ${(draft!.rate * 100).toFixed(2)}%; blocked by ${borrow.intent.blocking?.code}`);
  // One collateral asset: health moves with its price, so liquidation is at price ÷ health.
  assert.equal(draft!.liquidation?.asset, "cirBTC");
  const account = (await (await call("GET", "/lend/account")).json()) as LendAccountView;
  const btc = account.reserves.find((reserve) => reserve.asset === "cirBTC")!;
  const expected = Number(btc.price) / draft!.healthAfter!;
  assert.ok(Math.abs(Number(draft!.liquidation!.price) - expected) / expected < 1e-3, `${draft!.liquidation!.price} vs ${expected}`);
  console.log(`liquidated if cirBTC falls to $${(Number(draft!.liquidation!.price) / 1e8).toFixed(0)} (now $${(Number(btc.price) / 1e8).toFixed(0)})`);
  assert.deepEqual([account.available, account.held, account.debtUsd, account.weightedCollateralUsd], [true, [], 0, 0]);
  const short = borrow.intent.results.find((result) => result.code === "INSUFFICIENT_BALANCE" && result.params?.asset === "cirBTC");
  assert.equal(short?.params?.decimals, "8", JSON.stringify(borrow.intent.results));
  const greedy = (await (await call("PATCH", `/lend/orders/${borrow.intent.id}`, { amount: "16" })).json()) as { intent: LendIntent };
  assert.equal(greedy.intent.blocking?.code, "HEALTH_TOO_LOW");
  const euro = (await (await call("POST", "/lend/orders", { action: "borrow", asset: "USDC", amount: "5", collateralAsset: "EURC", collateralAmount: "10" })).json()) as { intent: LendIntent };
  assert.equal(euro.intent.blocking?.code, "LEND_NOT_COLLATERAL");
});
