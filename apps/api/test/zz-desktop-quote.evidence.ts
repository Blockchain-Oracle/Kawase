// Desktop lane evidence (NOT committed): the TradePanel's exact draft request for a $2 long, against Arc mainnet
// READ-ONLY (markets + quote; no approve, nothing signed, nothing sent). Throwaway wallet, scratch database.
import { randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { MarginIntent, MarginMarketsView } from "@kawase/api-client";
import { getNetwork, type NetworkId } from "@kawase/networks";

import type { Chains, NetworkClients } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const RPC = { mainnet: process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io", testnet: process.env.ARC_RPC_URL_TESTNET } as const;

function readOnlyChains(): Chains {
  const relayer = privateKeyToAccount(generatePrivateKey());
  const make = (id: NetworkId): NetworkClients => {
    const network = getNetwork(id);
    const transport = http(RPC[id], { timeout: 60_000 });
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

async function main() {
  const wallet = privateKeyToAccount(generatePrivateKey()).address as Address;
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const key = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "desk", email: `desk-${SUB_ORG}@example.test`, sessionPublicKeys: [key.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet }] },
  );
  const { app, db, close } = testApp(turnkey, readOnlyChains());
  let userId = "";
  try {
    const markets = (await (await app.request("/margin/markets?network=mainnet")).json()) as MarginMarketsView;
    console.log("MARKETS", JSON.stringify({ available: markets.available, venue: markets.venue, markets: markets.markets.map((m) => ({ market: m.market, price: m.price, long: m.long, short: m.short })) }));
    const testnet = (await (await app.request("/margin/markets?network=testnet")).json()) as MarginMarketsView;
    console.log("TESTNET", JSON.stringify({ available: testnet.available, reason: testnet.reason }));

    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
    const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: TURNKEY_USER, device: { platform: "web", installationId: "desktop-evidence-01" } }));
    await expectStatus(signIn, 201, "sign-in");
    const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
    userId = user.id;
    const call = (method: string, path: string, payload?: unknown) =>
      app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    await expectStatus(await call("POST", "/wallet", { address: wallet, walletId: "wallet-1" }), 201, "register");
    await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
    const switched = await call("PUT", "/me/network", { network: "mainnet" });
    if (switched.status !== 200) {
      const detail = (await switched.json()) as { version?: string };
      await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: detail.version, locale: "en" }), 201, "consent again");
      await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");
    }

    // Exactly what the TradePanel sends: "No leverage" is leverage 1 (D-344); $2 typed into the amount field.
    const btc = markets.markets.find((m) => m.long.available)!;
    const request = { action: "open", market: btc.market, side: "long", margin: "2", leverage: 1 };
    console.log("REQUEST POST /margin/orders", JSON.stringify(request));
    const response = await call("POST", "/margin/orders", request);
    const { intent } = (await response.json()) as { intent: MarginIntent };
    console.log("RESPONSE", response.status, JSON.stringify({ state: intent.state, version: intent.version, network: intent.network, draft: intent.draft, blocking: intent.blocking, expiresAt: intent.expiresAt }));

    // The leverage switch on, at 2× (the ticket's PATCH), to show the liquidation line it draws.
    const patch = { leverage: 2 };
    const revised = await call("PATCH", `/margin/orders/${intent.id}`, patch);
    const two = ((await revised.json()) as { intent: MarginIntent }).intent;
    console.log("REQUEST PATCH /margin/orders/:id", JSON.stringify(patch));
    console.log("RESPONSE", revised.status, JSON.stringify({ state: two.state, version: two.version, draft: two.draft, blocking: two.blocking }));
    await call("POST", `/margin/orders/${intent.id}/cancel`);
  } finally {
    if (userId) await deleteUser(db, userId);
    await close();
  }
}

await main();
