// Alchemy over its monthly quota (it answers 429 "Monthly capacity limit exceeded" on every API Kawase uses): the
// reads that use it must fall back, never 500. Read-only and live: a signed-in session (a local stamp, no Turnkey
// signing) whose wallet is the testnet ops wallet (real USDC and real history, nothing is sent), with the real
// Alchemy key and live market data. Portfolio falls back to the watcher's list and balances read on chain, Activity to
// the explorer's USDC/EURC page, prices to the other sources; the weekly report and the export read the explorer.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";

import type { PortfolioView, ReportView } from "@kawase/api-client";
import { MAINNET_CONSENT_VERSION } from "@kawase/config";
import { loadApiEnv } from "@kawase/env";

import { AlchemyPausedError, assertAlchemyOpen, resetAlchemyPause } from "../src/market/alchemy-quota";
import { liveMarketData } from "../src/market/sources";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.ALCHEMY_API_KEY && process.env.OPS_WALLET_ADDRESS_TESTNET && process.env.RELAYER_PRIVATE_KEY_TESTNET);
const HTTP_SERVER_ERROR = 500;

/** What Alchemy says right now (an over-quota key costs nothing to ask). */
async function alchemyState(key: string, wallet: string) {
  const response = await fetch(`https://api.g.alchemy.com/data/v1/${key}/assets/tokens/by-address`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addresses: [{ address: wallet, networks: ["arc-testnet"] }] }),
  });
  return { status: response.status, text: (await response.text()).slice(0, 80) };
}

test("Alchemy over quota: portfolio, activity, prices, the weekly report and the export still answer", { skip: !live, timeout: 300_000 }, async () => {
  const env = loadApiEnv();
  const wallet = env.OPS_WALLET_ADDRESS_TESTNET;
  const state = await alchemyState(env.ALCHEMY_API_KEY!, wallet);
  console.log("alchemy now:", state.status, state.text);
  const overQuota = state.status === 429;

  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "quota", email: `quota-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet }] },
  );
  const { app, db, close } = testApp(turnkey, createChains(env), undefined, undefined, undefined, undefined, undefined, {
    alchemyApiKey: env.ALCHEMY_API_KEY,
    market: liveMarketData({ alchemyApiKey: env.ALCHEMY_API_KEY }),
  });
  let userId = "";
  let token = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const call = async (path: string, init?: RequestInit) => {
    const started = Date.now();
    const response = await app.request(path, init ?? { headers: { authorization: `Bearer ${token}` } });
    console.log(`${response.status} ${String(Date.now() - started).padStart(5)}ms ${path}`);
    assert.ok(response.status < HTTP_SERVER_ERROR, `${path}: ${response.status} ${await response.clone().text()}`);
    return response;
  };

  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "web", installationId: "quota-test-browser-01" } }));
  await expectStatus(signIn, 201, "sign-in");
  ({ token } = (await signIn.json()) as { token: string });
  userId = ((await (await call("/me")).json()) as { user: { id: string } }).user.id;
  await expectStatus(await app.request("/wallet", jsonRequest("POST", { address: wallet, walletId: "wallet-1" }, token)), 201, "register");

  // Portfolio: the wallet's test USDC is found and priced without Alchemy. The first read meets the 429 and pauses
  // Alchemy, so the second goes straight to the fallback.
  resetAlchemyPause();
  await call("/portfolio");
  if (overQuota) assert.throws(assertAlchemyOpen, AlchemyPausedError, "a monthly-capacity 429 pauses Alchemy");
  const portfolio = ((await (await call("/portfolio")).json()) as { portfolio: PortfolioView }).portfolio;
  const usdc = portfolio.assets.find((asset) => asset.token.symbol === "USDC");
  assert.ok(usdc && Number(usdc.amount) > 0, `USDC held: ${JSON.stringify(portfolio.assets.map((asset) => [asset.token.symbol, asset.amount]))}`);
  assert.ok(usdc.valueUsd !== null, "USDC is priced");
  console.log("portfolio:", portfolio.assets.map((asset) => `${asset.token.symbol} ${asset.amount}`).join(", "), "· total", portfolio.totalUsd);

  // Activity: the explorer's page stands in, said as such.
  const feed = (await (await call("/activity")).json()) as { items: unknown[]; source: string };
  assert.ok(feed.items.length > 0, "the wallet's history is there");
  if (overQuota) assert.equal(feed.source, "explorer");
  console.log("activity:", feed.items.length, "items from", feed.source);

  // The weekly report and the month's export (both from the explorer).
  const report = ((await (await call("/history/report?network=testnet&days=7")).json()) as { report: ReportView }).report;
  console.log("report:", JSON.stringify(report.counts), "complete:", report.complete);
  const month = new Date().toISOString().slice(0, "YYYY-MM".length);
  const csv = await (await call(`/history/export?network=testnet&month=${month}&format=csv`)).text();
  assert.match(csv, /^date,type,asset,amount,/);
  console.log("export:", csv.split("\n").length - 2, "rows");

  // Prices on mainnet: a token page and the Markets list (no Alchemy for Arc tokens; majors fall back too).
  await expectStatus(await app.request("/me/consents", jsonRequest("POST", { kind: "mainnet_real_money", version: MAINNET_CONSENT_VERSION, locale: "en" }, token)), 201, "consent");
  await expectStatus(await app.request("/me/network", jsonRequest("PUT", { network: "mainnet" }, token)), 200, "mainnet");
  const mainnet = ((await (await call("/portfolio")).json()) as { portfolio: PortfolioView }).portfolio;
  console.log("mainnet portfolio:", mainnet.assets.length, "assets");
  const markets = (await (await call("/markets?network=mainnet&segment=trending")).json()) as { market: { rows?: unknown[] } };
  assert.ok((markets.market.rows ?? []).length > 0, "Markets lists tokens");
  await call("/tokens/search?q=ARGUS&network=mainnet");
});
