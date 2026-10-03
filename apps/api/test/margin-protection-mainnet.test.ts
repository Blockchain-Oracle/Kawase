// Margin protection through the api against real Aave V4 accounts on Arc mainnet (read only; nothing is signed for
// them, nothing moves): a test person is attached to a real cirBTC long (0x6533…, health ~1.53) and its position is
// recorded; take-profit and stop-loss are refused on the wrong side of the price and past liquidation, and accepted
// when Uniswap v3 can carry the whole close now (then they wait for the grants). Two more people sit on real accounts
// under 1.5 and under 1.2: the health monitor tells each once (warning, danger), not again on the next tick, and the
// long above 1.5 is not told. The redeem itself (grants signed, ops closes, attacks refused) runs in
// test/margin-protect.sim.ts. Run: tsx --test test/margin-protection-mainnet.test.ts (DATABASE_URL set).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { MarginProtectionResult, MarginProtectionView } from "@kawase/api-client";
import { inboxItems, intents, marginPositions } from "@kawase/db";
import { readAccount, readMarket } from "@kawase/integrations-aave-v4";
import { createLogger } from "@kawase/log";
import { AAVE_V4, getNetwork, type NetworkId } from "@kawase/networks";

import { InboxService } from "../src/inbox/service";
import { MarginProtection } from "../src/margin/protection";
import { MarginService } from "../src/margin/service";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

/** Real Aave V4 accounts on Arc mainnet (Spoke Borrow events, read 10-02): a cirBTC long, one under 1.5, one under 1.2. */
const LONG: Address = "0x6533B5FcB6C16E0753BFD50A0114DF72499944a4";
const WARNING: Address = "0x943Fad332d266b1b8a9EB56Aa62Fc8CCd3a2BD19";
const DANGER: Address = "0x870C73C98A14b6956b79247e1a1CDC68BA0060ee";
const RPC = { mainnet: process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io", testnet: process.env.ARC_RPC_URL_TESTNET } as const;
const TIMEOUT_MS = 60_000;
const PRICE_DECIMALS = 8;
const UP = 1.1;
const DOWN = 0.95;
const FAR_DOWN = 0.3;

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

test("margin protection: targets checked against the price, liquidation and Uniswap; health told once per fall", { skip: !process.env.DATABASE_URL, timeout: 400_000 }, async () => {
  const people = [LONG, WARNING, DANGER].map((wallet) => ({ wallet, org: randomUUID(), turnkeyUser: randomUUID(), key: turnkeyStyleKeyPair() }));
  const turnkey = fakeTurnkey(
    Object.fromEntries(people.map((p) => [`${p.org}/${p.turnkeyUser}`, { userId: p.turnkeyUser, userName: "protected", email: `protect-${p.org}@example.test`, sessionPublicKeys: [p.key.publicKeyHex] }])),
    Object.fromEntries(people.map((p) => [p.org, [{ walletId: `wallet-${p.org}`, address: p.wallet }]])),
  );
  const chains = readOnlyChains();
  const { app, db, close } = testApp(turnkey, chains);
  const userIds: string[] = [];
  after(async () => {
    for (const id of userIds) await deleteUser(db, id);
    await close();
  });
  const sessions = [];
  for (const [index, person] of people.entries()) {
    const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const body = JSON.stringify({ organizationId: person.org, activityId: nonce });
    const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, person.key) }, turnkeyUserId: person.turnkeyUser, device: { platform: "ios", installationId: `protect-phone-00${index}` } }));
    await expectStatus(signIn, 201, "sign-in");
    const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
    userIds.push(user.id);
    const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
    await expectStatus(await call("POST", "/wallet", { address: person.wallet, walletId: `wallet-${person.org}` }), 201, "register");
    await expectStatus(await call("POST", "/me/consents", { kind: "mainnet_real_money", version: "1", locale: "en" }), 201, "consent");
    await expectStatus(await call("PUT", "/me/network", { network: "mainnet" }), 200, "switch");
    // Each did something on Aave through Kawase (what makes them candidates for health alerts).
    await db.insert(intents).values({ userId: user.id, network: "mainnet", kind: index === 0 ? "margin" : "lend", originSurface: "app", state: "completed", request: {}, expiresAt: new Date() });
    sessions.push({ userId: user.id, call });
  }

  // The long's position, recorded as Kawase would after opening it: the account's own cirBTC and USDC debt.
  const { client } = chains.get("mainnet")!;
  const spoke = AAVE_V4.mainnet!.mainSpoke;
  const market = await readMarket(client, spoke);
  const cirBTC = market.reserves.find((reserve) => reserve.symbol === "cirBTC")!;
  const usdc = market.reserves.find((reserve) => reserve.symbol === "USDC")!;
  const account = await readAccount(client, spoke, LONG, market.reserves.length);
  const [row] = await db
    .insert(marginPositions)
    .values({ userId: sessions[0]!.userId, network: "mainnet", venue: "Aave V4", market: "cirBTC", asset: cirBTC.underlying, side: "long", collateral: account.reserves[cirBTC.reserveId]!.supplied, debt: account.reserves[usdc.reserveId]!.debt, margin: parseUnits("1000", usdc.decimals), entryPrice: cirBTC.price, openedAt: new Date() })
    .returning();
  const long = sessions[0]!;
  const mark = Number(formatUnits(cirBTC.price, PRICE_DECIMALS));
  const price = (value: number) => value.toFixed(2);
  console.log(`long ${LONG}: ${formatUnits(account.reserves[cirBTC.reserveId]!.supplied, cirBTC.decimals)} cirBTC against ${formatUnits(account.reserves[usdc.reserveId]!.debt, usdc.decimals)} USDC, cirBTC $${mark.toFixed(0)}`);

  const view = (await (await long.call("GET", "/margin/protection")).json()) as MarginProtectionView;
  assert.deepEqual([view.available, view.grant], [true, "none"]);
  const refused = async (change: Record<string, string | null>, code: string) => {
    const response = await long.call("PUT", `/margin/positions/${row!.id}/protection`, change);
    const problem = (await response.json()) as { type?: string };
    assert.equal(response.status, 422, JSON.stringify(problem));
    assert.ok(problem.type?.endsWith(`/${code}`), `${code}: ${JSON.stringify(problem)}`);
  };
  await refused({ takeProfit: price(mark * DOWN) }, "take_profit_wrong_side");
  await refused({ stopLoss: price(mark * UP) }, "stop_loss_wrong_side");
  await refused({ stopLoss: price(mark * FAR_DOWN) }, "stop_loss_past_liquidation");
  const set = (await (await long.call("PUT", `/margin/positions/${row!.id}/protection`, { takeProfit: price(mark * UP), stopLoss: price(mark * DOWN) })).json()) as MarginProtectionResult;
  assert.equal(set.needsGrant, true, JSON.stringify(set));
  assert.equal(set.position.takeProfit, parseUnits(price(mark * UP), PRICE_DECIMALS).toString());
  assert.equal(set.position.protection, null);
  console.log(`targets: take-profit $${price(mark * UP)}, stop-loss $${price(mark * DOWN)} accepted (Uniswap can close the whole size now), waiting for the grants; liquidation at $${Number(formatUnits(BigInt(set.position.liquidationPrice ?? "0"), PRICE_DECIMALS)).toFixed(0)}`);
  // This address is not a Kawase wallet (no DeleGator code): its grants cannot be asked for.
  const grant = await long.call("POST", "/margin/protection/grant");
  assert.equal(grant.status, 422);

  // Health: told once on the way down.
  const log = createLogger({ service: "protection-test", level: "silent" });
  const wallets = new WalletService(db, chains);
  const protection = new MarginProtection(db, chains, wallets, new MarginService(db, chains, wallets, log), log, new InboxService(db, chains));
  await protection.healthTick();
  await protection.healthTick();
  const told = async (userId: string) => db.select().from(inboxItems).where(and(eq(inboxItems.userId, userId), eq(inboxItems.kind, "position_health")));
  const [forLong, forWarning, forDanger] = await Promise.all(sessions.map((session) => told(session.userId)));
  assert.equal(forLong!.length, 0, "health above 1.5 is not told");
  assert.deepEqual(forWarning!.map((item) => item.params.level), ["warning"]);
  assert.deepEqual(forDanger!.map((item) => item.params.level), ["danger"]);
  console.log(`health alerts: ${WARNING.slice(0, 8)}… warning at ${forWarning![0]!.params.health}, ${DANGER.slice(0, 8)}… danger at ${forDanger![0]!.params.health}, each once over two ticks; the long (above 1.5) not told`);
});
