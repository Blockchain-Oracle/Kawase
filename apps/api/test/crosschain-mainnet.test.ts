// Cross-chain moves through the api against Arc mainnet reads (no funds move): "send 20 USDC to someone on Base"
// gets live quotes from Circle CCTP, Across and Relay, ranked by what arrives, the best one chosen and the person's
// pick honoured; "bring 20 USDC from Base" offers Relay's gasless permit and says why the others need gas there. The
// fresh wallet holds nothing, so both wait for money. The batches themselves are simulated in test/crosschain.sim.ts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { CrossChainIntent } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork, type NetworkId } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
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

test("crosschain: live route options out of Arc and a gasless Bring to Arc", { skip: !process.env.DATABASE_URL, timeout: 300_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address as Address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const key = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "mover", email: `move-${SUB_ORG}@example.test`, sessionPublicKeys: [key.publicKeyHex] } },
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
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "move-test-phone-001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet, walletId: "wallet-1" }), 201, "register");
  await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
  await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");

  const out = (await (await call("POST", "/crosschain/orders", { destination: "base", amount: "20", recipient: "0x000000000000000000000000000000000000dEaD" })).json()) as { intent: CrossChainIntent };
  const draft = out.intent.draft;
  assert.ok(draft, JSON.stringify(out.intent.blocking));
  assert.equal(draft.recipient.own, false);
  const quoted = draft.routes.filter((route) => route.executable);
  assert.ok(quoted.length >= 2, `routes: ${JSON.stringify(draft.routes)}`);
  assert.equal(draft.chosen, quoted[0]!.provider, "the best net is chosen");
  console.log(`out: ${draft.routes.map((route) => `${route.provider} ${route.received ?? route.reason}${route.etaSeconds ? ` ${route.etaSeconds}s` : ""}`).join(" | ")}; chosen ${draft.chosen}; blocked by ${out.intent.blocking?.code}`);
  const pick = quoted.find((route) => route.provider !== draft.chosen)!;
  const picked = (await (await call("PATCH", `/crosschain/orders/${out.intent.id}`, { route: pick.provider })).json()) as { intent: CrossChainIntent };
  assert.equal(picked.intent.draft?.chosen, pick.provider, "the person's pick stands");

  const into = (await (await call("POST", "/crosschain/orders", { direction: "in", source: "base", amount: "20" })).json()) as { intent: CrossChainIntent };
  const bring = into.intent.draft;
  assert.ok(bring, JSON.stringify(into.intent.blocking));
  assert.deepEqual([bring.chosen, bring.networkFee, bring.destination.key], ["relay", "0", "arc"]);
  assert.equal(bring.routes.find((route) => route.provider === "across")?.reason, "needs_source_gas");
  assert.equal(into.intent.blocking?.code, "INSUFFICIENT_BALANCE");
  console.log(`in: relay ${bring.minReceived} arrives on Arc, no gas on Base; blocked by ${into.intent.blocking?.code} (the wallet holds nothing on Base)`);
});
