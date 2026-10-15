// Practice mode for paid services (cards/automate-safety.md, R11): with practice on, buy_service asks the demo seller
// its live price and checks every rule, pays nothing, and records the "would pay" as a practice run that Activity
// shows; an agent-wallet top-up is refused (409 practice_mode). Needs the demo seller running
// (pnpm --filter @kawase/x402-seller start) and the server keys in the root .env; nothing on chain moves.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { FeedPage } from "@kawase/api-client";
import { practiceRuns, users } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { Discovery } from "@kawase/integrations-x402";
import { createLogger } from "@kawase/log";

import { circleAgentWallets } from "../src/marketplace/agent-wallets";
import { MarketplaceService } from "../src/marketplace/service";
import { circleOps } from "../src/send/ops";
import type { SessionUser } from "../src/types";
import { createChains } from "../src/wallet/chain";
import { WalletService } from "../src/wallet/service";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const SELLER = process.env.X402_DEMO_SELLER_URL ?? "http://localhost:4021";
const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ID_TESTNET && process.env.CIRCLE_TEST_API_KEY);

test("practice mode: a paid service is priced and checked, never paid", { skip: !live, timeout: 300_000 }, async () => {
  const sellerUp = await fetch(`${SELLER}/health`).then((response) => response.ok).catch(() => false);
  assert.ok(sellerUp, `the demo seller is not running at ${SELLER}`);
  const env = loadApiEnv();
  const chains = createChains(env);
  const wallet = privateKeyToAccount(generatePrivateKey());
  const TEST_ID = randomUUID();
  const person = privyPerson(`practice-${TEST_ID}@example.test`, wallet.address);
  const discovery = new Discovery({ demoSellerUrl: SELLER });
  const agentWallets = circleAgentWallets(env);
  const ops = circleOps(env);
  const { app, db, close } = testApp(chains, undefined, ops, undefined, undefined, undefined, { agentWallets, discovery });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "practice-test-phone-01" });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user: signedIn } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = signedIn.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/safety/changes", { change: { kind: "practice", on: true } }), 200, "practice on");

  const [row] = await db.select().from(users).where(eq(users.id, userId));
  const user = { ...row!, activeNetwork: "testnet" } as unknown as SessionUser;
  assert.equal(user.practiceMode, true);
  const market = new MarketplaceService(db, chains, new WalletService(db, chains), ops, agentWallets, discovery, createLogger({ service: "practice-test", level: "silent" }));
  const outcome = await market.buy(user, { url: `${SELLER}/api/fx/eur-usd` }, { threadId: randomUUID(), tainted: false });
  assert.equal(outcome.status, "practiced", JSON.stringify(outcome));
  if (outcome.status !== "practiced") return;
  assert.ok(BigInt(outcome.price) > 0n);
  assert.equal(outcome.funded, false, "no agent wallet yet");
  assert.equal(outcome.wouldAsk, null);
  console.log("practice purchase", JSON.stringify({ price: outcome.price, seller: outcome.service.provider.name, funded: outcome.funded }));

  const runs = await db.select().from(practiceRuns).where(and(eq(practiceRuns.userId, userId), eq(practiceRuns.kind, "purchase")));
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.summary.amount, outcome.price);
  const feed = (await (await call("GET", "/activity?network=testnet")).json()) as FeedPage;
  assert.ok(feed.items.some((item) => item.kind === "practice" && item.amount === outcome.price), JSON.stringify(feed.items.map((item) => item.kind)));

  const topUp = await call("POST", "/marketplace/agent-wallet/top-up", { amount: "1000000" });
  assert.equal(topUp.status, 409);
  assert.match(((await topUp.json()) as { type: string }).type, /practice_mode$/);
});
