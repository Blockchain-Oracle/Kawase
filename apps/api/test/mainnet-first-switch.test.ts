// The first switch to mainnet, against the real Arc mainnet (B2-3): the network refuses without the real-money
// consent, switches with it, and the wallet's setup — paid by Kawase's relayer — says "Kawase is getting mainnet
// ready" (503 network_not_ready, before anything is signed) while that relayer holds no gas, instead of crashing.
// Nothing is sent: the relayer's balance is read, never spent. Also: the mainnet allowance proposal is 500 USDC a day.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { DEFAULT_LIMITS, MAINNET_CONSENT_VERSION } from "@kawase/config";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.MAINNET_ENABLED === "true" && process.env.RELAYER_PRIVATE_KEY_MAINNET);
const RELAYER_MIN_GAS = 50_000_000_000_000_000n;

test("first mainnet switch: consent, switch, and a setup that says mainnet is not ready yet", { skip: !live, timeout: 120_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  assert.ok(chains.available.includes("mainnet"), "mainnet is on");
  const mainnet = chains.get("mainnet")!;
  const relayerGas = await createPublicClient({ chain: getNetwork("mainnet").viemChain, transport: http(env.ARC_RPC_URL_MAINNET) }).getBalance({ address: mainnet.relayerAddress });
  const wallet = privateKeyToAccount(generatePrivateKey());
  const TEST_ID = randomUUID();
  const person = privyPerson(`mainnet-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains);
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "mainnet-phone-01" });
  await expectStatus(signIn, 201, "sign-in");
  const { token } = (await signIn.json()) as { token: string };
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  userId = ((await (await call("GET", "/me")).json()) as { user: { id: string } }).user.id;

  // 1. No consent, no mainnet; with it, the switch happens.
  assert.equal((await call("PUT", "/me/network", { network: "mainnet" })).status >= 400, true, "refused without the real-money consent");
  await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: MAINNET_CONSENT_VERSION, locale: "en" }), 201, "consent");
  const switched = (await (await call("PUT", "/me/network", { network: "mainnet" })).json()) as { user: { activeNetwork: string } };
  assert.equal(switched.user.activeNetwork, "mainnet");

  // 2. The setup on mainnet: while the relayer has no gas, a clear "getting ready", before any signature.
  const setup = await call("POST", "/wallet/setup/request", { network: "mainnet" });
  if (relayerGas < RELAYER_MIN_GAS) {
    assert.equal(setup.status, 503, await setup.clone().text());
    const problem = (await setup.json()) as { type: string; detail: string };
    assert.match(problem.type, /network_not_ready$/);
    assert.match(problem.detail, /getting mainnet ready/);
    console.log(`mainnet relayer ${mainnet.relayerAddress} holds ${relayerGas} wei: setup says "getting mainnet ready"`);
  } else {
    assert.equal(setup.status, 200, "a funded relayer offers the setup");
    console.log("mainnet relayer is funded: the setup is offered");
  }

  // 3. The mainnet allowance a set-up wallet would be offered: 500 USDC a day.
  assert.equal(DEFAULT_LIMITS.mainnet.daily, 500_000_000n);
});
