// Kawase Margin through the api against Arc mainnet reads (no funds move): markets from Aave V4's live reserves
// (public), then a signed-in person drafts "long BTC 2× with $10" and "short ETH" and gets real plans (KyberSwap
// quotes, the Main Spoke) with a liquidation price; the fresh wallet holds nothing, so the policy asks for money and
// setup instead of letting it go. Testnet says it is mainnet only. The full batch itself is simulated in
// test/margin.sim.ts. Run: pnpm --filter @kawase/api test (needs the database; skipped without DATABASE_URL).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { MarginIntent, MarginMarketsView } from "@kawase/api-client";
import { getNetwork, type NetworkId } from "@kawase/networks";

import type { Chains, NetworkClients } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const RPC = { mainnet: process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io", testnet: process.env.ARC_RPC_URL_TESTNET } as const;
const TIMEOUT_MS = 60_000;

/** Read-only chains: a public client per network and a throwaway relayer that never sends here. */
function readOnlyChains(): Chains {
  const relayer = privateKeyToAccount(generatePrivateKey());
  const make = (id: NetworkId): NetworkClients => {
    const network = getNetwork(id);
    const transport = http(RPC[id], { timeout: TIMEOUT_MS });
    return {
      network,
      client: createPublicClient({ chain: network.viemChain, transport }),
      relayer: createWalletClient({ account: relayer, chain: network.viemChain, transport }),
      relayerAddress: relayer.address,
      ops: { walletId: "none", address: relayer.address },
    };
  };
  const clients = { mainnet: make("mainnet"), testnet: make("testnet") };
  return { available: ["mainnet", "testnet"], get: (network) => clients[network] };
}

test("margin: live markets, and real plans that wait for money", { skip: !process.env.DATABASE_URL, timeout: 300_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address as Address;
  const TEST_ID = randomUUID();
  const person = privyPerson(`margin-${TEST_ID}@example.test`, wallet);
  const { app, db, close } = testApp(readOnlyChains());
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });

  // Public: a guest sees the markets (R13).
  const markets = (await (await app.request("/margin/markets?network=mainnet")).json()) as MarginMarketsView;
  assert.equal(markets.available, true);
  const btc = markets.markets.find((m) => m.market === "cirBTC")!;
  const eurc = markets.markets.find((m) => m.market === "EURC")!;
  assert.ok(btc.long.available && btc.short.available && btc.long.maxLeverage > 3);
  assert.equal(eurc.long.available, false);
  assert.equal(eurc.long.reason, "no_collateral_factor");
  assert.equal(eurc.short.available, true);
  console.log(markets.markets.map((m) => `${m.market}: long ≤${m.long.maxLeverage.toFixed(2)}× ${m.long.reason ?? ""} short ≤${m.short.maxLeverage.toFixed(2)}× ${m.short.reason ?? ""}`).join(" | "));
  const testnet = (await (await app.request("/margin/markets?network=testnet")).json()) as MarginMarketsView;
  assert.equal(testnet.available, false);
  assert.equal(testnet.reason, "mainnet_only");

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "margin-test-phone-01" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));

  // On testnet the order explains itself and offers the switch.
  const onTestnet = (await (await call("POST", "/margin/orders", { market: "btc", side: "long", margin: "10" })).json()) as { intent: MarginIntent };
  assert.equal(onTestnet.intent.blocking?.code, "ON_OTHER_NETWORK");

  await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
  const switched = await call("PUT", "/me/network", { network: "mainnet" });
  if (switched.status !== 200) {
    // The consent version moves with the copy; read it from the refusal and accept that one.
    const detail = (await switched.json()) as { version?: string };
    await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: detail.version, locale: "en" }), 201, "consent again");
    await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");
  }

  const long = (await (await call("POST", "/margin/orders", { market: "Bitcoin", side: "long", margin: "10", leverage: 2 })).json()) as { intent: MarginIntent };
  const draft = long.intent.draft;
  assert.ok(draft, `no plan: ${JSON.stringify(long.intent.blocking)}`);
  assert.equal(draft.market, "cirBTC");
  assert.equal(draft.debtDelta, "10000000");
  assert.ok(draft.liquidationPrice && BigInt(draft.liquidationPrice) < BigInt(draft.markPrice));
  assert.ok(["WALLET_NOT_SET_UP", "INSUFFICIENT_BALANCE"].includes(long.intent.blocking?.code ?? ""), `blocked by ${long.intent.blocking?.code}`);
  console.log(`long cirBTC 2×: exposure $${draft.notionalUsd.toFixed(2)}, health ${draft.healthAfter}, liquidation ${draft.liquidationPrice} vs ${draft.markPrice}, ${draft.loops} loops via ${draft.venues.join(",")}; blocked by ${long.intent.blocking?.code}`);

  const short = (await (await call("POST", "/margin/orders", { market: "eth", side: "short", margin: "10" })).json()) as { intent: MarginIntent };
  assert.equal(short.intent.draft?.leverage, 2);
  assert.ok(short.intent.draft && BigInt(short.intent.draft.liquidationPrice!) > BigInt(short.intent.draft.markPrice));
  const tooHigh = (await (await call("PATCH", `/margin/orders/${short.intent.id}`, { leverage: 4 })).json()) as { intent: MarginIntent };
  assert.equal(tooHigh.intent.blocking?.code, "LEVERAGE_TOO_HIGH");
  const longEuro = (await (await call("POST", "/margin/orders", { market: "euro", side: "long", margin: "10" })).json()) as { intent: MarginIntent };
  assert.equal(longEuro.intent.blocking?.code, "MARGIN_SIDE_UNAVAILABLE");
  const meme = (await (await call("POST", "/margin/orders", { market: "ARGUS", side: "short", margin: "10" })).json()) as { intent: MarginIntent };
  assert.equal(meme.intent.blocking?.code, "MARGIN_MARKET_UNAVAILABLE");
});
