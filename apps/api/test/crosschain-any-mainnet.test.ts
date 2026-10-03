// Any asset across chains through the api, against Arc mainnet and the providers (no funds move): WETH out to a
// friend on Base arrives as WETH; a meme with no route as itself arrives as USDC (an aggregator's own swap or Kawase's
// convert-first plan); USDC out now compares five providers with deBridge's flat fee counted; Bring to Arc of Base's
// own ETH is one LI.FI transaction there and arrives as WETH. The wallet holds nothing, so drafts wait for money; the
// batches run in test/crosschain-any.sim.ts. Run: tsx --test test/crosschain-any-mainnet.test.ts (DATABASE_URL set).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createPublicClient, createWalletClient, formatUnits, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { CrossChainIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork, type NetworkId } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const TOLLY = "0xBc43CE8DEc648EA298C4275559b81D6261c90b67";
const FRIEND = "0x7a3b9e2c4d5f60718293a4b5c6d7e8f901234567";
const ETH_DECIMALS = 18;
const STABLE_DECIMALS = 6;

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

const describe = (intent: CrossChainIntent) =>
  (intent.draft?.routes ?? [])
    .map((route) => `${route.provider}${route.via ? `(${route.via})` : ""}${route.convertFirst ? `[swap via ${route.convertFirst.venue}]` : ""} ${route.received && route.output ? `${formatUnits(BigInt(route.received), route.output.decimals)} ${route.output.symbol}` : route.reason}`)
    .join(" | ");

test("crosschain: any asset out of Arc as itself or as USDC, and the chain's own coin brought in", { skip: !process.env.DATABASE_URL, timeout: 400_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address as Address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const key = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "mover", email: `any-${SUB_ORG}@example.test`, sessionPublicKeys: [key.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet }] },
  );
  const { app, db, close } = testApp(turnkey, readOnlyChains(), undefined, undefined, undefined, appKitBridges(loadApiEnv()));
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "any-asset-phone-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet, walletId: "wallet-1" }), 201, "register");
  await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
  await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");
  const order = async (payload: Record<string, unknown>) => ((await (await call("POST", "/crosschain/orders", payload)).json()) as { intent: CrossChainIntent }).intent;

  // WETH as itself.
  const weth = await order({ asset: "WETH", destination: "base", amount: "0.005", recipient: FRIEND });
  console.log(`0.005 WETH → Base: ${describe(weth)}; chosen ${weth.draft?.chosen}; blocked by ${weth.blocking?.code}`);
  assert.equal(weth.draft?.output?.symbol, "WETH", JSON.stringify(weth.blocking ?? weth.draft));
  assert.ok(["lifi", "debridge"].includes(weth.draft!.chosen));
  // The wallet holds no WETH: the reason names WETH with its own decimals (it is not set up either, which comes first).
  const short = weth.results.find((result) => result.code === "INSUFFICIENT_BALANCE");
  assert.deepEqual([short?.params?.asset, short?.params?.decimals], ["WETH", String(ETH_DECIMALS)]);

  // A meme: no route as itself, so it arrives as USDC.
  const meme = await order({ asset: TOLLY, destination: "base", amount: "5000", recipient: FRIEND });
  console.log(`5000 TOLLY → Base: ${describe(meme)}; chosen ${meme.draft?.chosen}`);
  assert.equal(meme.draft?.output?.symbol, "USDC", JSON.stringify(meme.blocking ?? meme.draft));
  assert.equal(meme.draft?.input?.symbol, "TOLLY");

  // USDC: five providers quoted, deBridge's flat fee counted against what arrives.
  const usdc = await order({ destination: "base", amount: "20", recipient: FRIEND });
  console.log(`20 USDC → Base: ${describe(usdc)}; chosen ${usdc.draft?.chosen}`);
  const debridge = usdc.draft?.routes.find((route) => route.provider === "debridge");
  if (debridge?.received) assert.equal(debridge.extraCost, "1000000", "deBridge's 1 USDC fee is counted");

  // Bring Base's own ETH to Arc: one LI.FI transaction there; it arrives as WETH.
  const eth = await order({ direction: "in", source: "base", asset: "ETH", amount: "0.002" });
  console.log(`0.002 ETH from Base: ${describe(eth)}; output ${eth.draft?.output?.symbol}; blocked by ${eth.blocking?.code}`);
  assert.equal(eth.draft?.chosen, "lifi", JSON.stringify(eth.results));
  assert.equal(eth.draft?.output?.symbol, "WETH");
  assert.deepEqual([eth.draft?.source.key, eth.draft?.networkFee], ["base", "0"]);
  assert.ok(eth.results.some((result) => result.code === "INSUFFICIENT_BALANCE"), JSON.stringify(eth.results));

  // An asset Kawase cannot find asks which one.
  const unknown = await order({ asset: "NOPE-TOKEN", destination: "base", amount: "1" });
  assert.ok(unknown.results.some((result) => result.code === "MOVE_ASSET_UNKNOWN"), JSON.stringify(unknown.results));
  console.log(`USDC net of fees: ${usdc.draft?.routes.map((route) => `${route.provider} ${route.net ? formatUnits(BigInt(route.net), STABLE_DECIMALS) : "-"}`).join(", ")}`);
});
