// Launchpads through the api against LIFT's live data and Arc mainnet (no funds move): the LIFT token itself has
// graduated; a token still on its curve shows its progress and the fees a trade pays there, and can be watched; TOLLY
// was not launched by LIFT (no curve) and, with ARGUS, quotes through the swap fan-out like any token. The graduation
// alert: a watch on a token that has graduated is told once by the monitor (inbox token_graduated), not twice.
// Run: tsx --test test/launchpad-mainnet.test.ts (DATABASE_URL set).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, http, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { LaunchpadView } from "@kawase/api-client";
import { inboxItems, launchpadWatches } from "@kawase/db";
import { createLogger } from "@kawase/log";
import { getNetwork, type NetworkId } from "@kawase/networks";

import { InboxService } from "../src/inbox/service";
import { LaunchpadService } from "../src/launchpad/service";
import { noSwaps } from "../src/swap/engine";
import { createSwapVenues } from "../src/swap/venues";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

const LIFT: Address = "0x44B453D355835Ce1269fc11D3FA4161c0DcC0087";
const TOLLY: Address = "0xBc43CE8DEc648EA298C4275559b81D6261c90b67";
const ARGUS: Address = "0xeCe5cA8bf9220718E5727754026757512212cb3c";
const USDC: Address = "0x3600000000000000000000000000000000000000";
const RPC = { mainnet: process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io", testnet: process.env.ARC_RPC_URL_TESTNET } as const;
const TIMEOUT_MS = 60_000;
const MEME_AMOUNT = parseUnits("1000", 18);
const SLIPPAGE_BPS = 200;

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

/** A LIFT token still on its curve now (LIFT's own list, newest first). */
async function onTheCurve(): Promise<{ address: string; symbol: string }> {
  const response = await fetch("https://api.lift.fun/api/v1/tokens?limit=50", { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = (await response.json()) as { items: { address: string; symbol: string; graduated: boolean; progress_bps: number }[] };
  const token = body.items.find((item) => !item.graduated && item.progress_bps > 0) ?? body.items.find((item) => !item.graduated);
  assert.ok(token, "LIFT lists a token still on its curve");
  return token;
}

test("launchpads: curve progress and fees from LIFT, a graduation watch told once, other memes trade normally", { skip: !process.env.DATABASE_URL, timeout: 300_000 }, async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  const org = randomUUID();
  const turnkeyUser = randomUUID();
  const key = turnkeyStyleKeyPair();
  const chains = readOnlyChains();
  const { app, db, close } = testApp(fakeTurnkey({ [`${org}/${turnkeyUser}`]: { userId: turnkeyUser, userName: "watcher", email: `lift-${org}@example.test`, sessionPublicKeys: [key.publicKeyHex] } }, { [org]: [{ walletId: "wallet-1", address: wallet }] }), chains);
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: org, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, key) }, turnkeyUserId: turnkeyUser, device: { platform: "ios", installationId: "launchpad-phone-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet, walletId: "wallet-1" }), 201, "register");
  await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
  await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");
  const read = async (address: string) => ((await (await call("GET", `/launchpad/tokens/${address}`)).json()) as { launchpad: LaunchpadView | null }).launchpad;

  const lift = await read(LIFT);
  assert.deepEqual([lift?.launchpad, lift?.graduated, lift?.progress], ["LIFT", true, 1]);
  const curve = await onTheCurve();
  const fresh = await read(curve.address);
  assert.equal(fresh?.graduated, false);
  console.log(`LIFT: graduated ${lift!.graduatedAt}; ${curve.symbol} on the curve at ${(fresh!.progress * 100).toFixed(2)}% (market cap $${fresh!.marketCapUsd?.toFixed(0)}), trades pay ${fresh!.buyFeeBps / 100}% buying / ${fresh!.sellFeeBps / 100}% selling (${fresh!.creatorFeeBps / 100}% to the creator)`);
  assert.equal(await read(TOLLY), null, "TOLLY was not launched by LIFT");

  const watched = ((await (await call("POST", `/launchpad/tokens/${curve.address}/watch`)).json()) as { launchpad: LaunchpadView | null }).launchpad;
  assert.equal(watched?.watching, true);

  // The alert: a watch on a token that has graduated (LIFT itself), told once over two ticks.
  await db.insert(launchpadWatches).values({ userId, network: "mainnet", token: LIFT.toLowerCase(), symbol: "LIFT", launchpad: "LIFT" });
  const log = createLogger({ service: "launchpad-test", level: "silent" });
  const monitor = new LaunchpadService(db, log, new InboxService(db, chains));
  await monitor.tick();
  await monitor.tick();
  const told = await db.select().from(inboxItems).where(and(eq(inboxItems.userId, userId), eq(inboxItems.kind, "token_graduated")));
  assert.deepEqual(told.map((item) => item.params.symbol), ["LIFT"]);
  const stillWatching = await read(curve.address);
  assert.equal(stillWatching?.watching, true, "a token still on its curve stays watched");
  console.log(`graduation alert: LIFT told once over two ticks; ${curve.symbol} still watched`);

  // Other memes trade normally: the swap fan-out quotes them like any token.
  const venues = createSwapVenues(noSwaps);
  const { client, network } = chains.get("mainnet")!;
  for (const [symbol, address] of [["TOLLY", TOLLY], ["ARGUS", ARGUS]] as const) {
    const quoted = await venues.quoteAll({ network, client: client as never, from: wallet, tokenIn: address, tokenOut: USDC, amountIn: MEME_AMOUNT, decimalsIn: 18, decimalsOut: 6, slippageBps: SLIPPAGE_BPS });
    assert.ok(quoted.quotes.length > 0, `${symbol}: ${JSON.stringify(quoted.failures)}`);
    console.log(`${symbol}: 1000 → ${(Number(quoted.quotes[0]!.estimatedOut) / 1e6).toFixed(4)} USDC via ${quoted.quotes[0]!.venue}${quoted.quotes[0]!.via.length ? ` (${quoted.quotes[0]!.via.join(", ")})` : ""}`);
  }
});
