// Token rules (D12) through the api: the defaults; a tightening applies at once; a loosening waits for the wallet's
// signature of the step-up message, refuses another key's signature, and applies with the wallet's own; a value off
// the steps is refused; and the swap policy reads the person's rules (verified-only refuses an unverified token).
// Needs the root .env (Arc testnet RPC for the network's chain id). Run: pnpm --filter @kawase/api exec tsx --test test/token-rules.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { TokenRulesChangeResponse, TokenRulesView } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { evaluateSwap } from "@kawase/policy";

import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, fakeTurnkey, jsonRequest, stampBody, testApp, turnkeyStyleKeyPair } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.DATABASE_URL && process.env.RELAYER_PRIVATE_KEY_TESTNET);

test("token rules: tighten at once, loosen with the wallet's signature, read by the swap policy", { skip: !live, timeout: 120_000 }, async () => {
  const env = loadApiEnv();
  const wallet = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  const SUB_ORG = randomUUID();
  const TURNKEY_USER = randomUUID();
  const sessionKey = turnkeyStyleKeyPair();
  const turnkey = fakeTurnkey(
    { [`${SUB_ORG}/${TURNKEY_USER}`]: { userId: TURNKEY_USER, userName: "rules", email: `rules-${SUB_ORG}@example.test`, sessionPublicKeys: [sessionKey.publicKeyHex] } },
    { [SUB_ORG]: [{ walletId: "wallet-1", address: wallet.address }] },
  );
  const { app, db, close } = testApp(turnkey, createChains(env));
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });
  const nonce = ((await (await app.request("/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
  const body = JSON.stringify({ organizationId: SUB_ORG, activityId: nonce });
  const signIn = await app.request("/auth/turnkey", jsonRequest("POST", { proof: { body, stamp: await stampBody(body, sessionKey) }, turnkeyUserId: TURNKEY_USER, device: { platform: "ios", installationId: "rules-phone-0001" } }));
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) =>
    app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  await expectStatus(await call("POST", "/wallet", { address: wallet.address, walletId: "wallet-1" }), 201, "register");

  // The defaults (D12): warned access, $50 a trade, $200 a day, 5% price impact.
  const start = ((await (await call("GET", "/token-rules")).json()) as { rules: TokenRulesView }).rules;
  assert.deepEqual([start.access, start.unverifiedPerTradeUsd, start.unverifiedPerDayUsd, start.maxPriceImpactBps], ["warned", 50, 200, 500]);

  // Tightening applies at once.
  const tight = (await (await call("POST", "/token-rules", { access: "verified", unverifiedPerTradeUsd: 25, maxPriceImpactBps: 300 })).json()) as TokenRulesChangeResponse;
  assert.equal(tight.status, "applied");
  if (tight.status !== "applied") return;
  assert.equal(tight.rules.access, "verified");
  assert.equal(tight.rules.maxPriceImpactBps, 300);

  // A value that is not one of the steps is refused.
  await expectStatus(await call("POST", "/token-rules", { unverifiedPerTradeUsd: 33 }), 422, "off the steps");

  // Loosening waits for the wallet: another key's signature is refused, the wallet's own applies it.
  const loose = (await (await call("POST", "/token-rules", { access: "warned", unverifiedPerDayUsd: 500 })).json()) as TokenRulesChangeResponse;
  assert.equal(loose.status, "needs_approval");
  if (loose.status !== "needs_approval") return;
  const still = ((await (await call("GET", "/token-rules")).json()) as { rules: TokenRulesView }).rules;
  assert.equal(still.access, "verified", "nothing loosens before the signature");
  const typed = loose.typedData as never;
  await expectStatus(await call("POST", "/token-rules/approve", { changeId: loose.changeId, signature: await stranger.signTypedData(typed) }), 422, "a stranger's signature");
  const applied = (await (await call("POST", "/token-rules/approve", { changeId: loose.changeId, signature: await wallet.signTypedData(typed) })).json()) as TokenRulesChangeResponse;
  assert.equal(applied.status, "applied");
  if (applied.status !== "applied") return;
  assert.deepEqual([applied.rules.access, applied.rules.unverifiedPerTradeUsd, applied.rules.unverifiedPerDayUsd, applied.rules.maxPriceImpactBps], ["warned", 25, 500, 300]);

  // The swap policy reads the rules: verified-only refuses an unverified token; warned applies the caps.
  const facts = (access: "verified" | "warned") =>
    evaluateSwap({
      network: "mainnet",
      capability: { here: "available", other: "available" },
      signedIn: true,
      pausedAll: false,
      wallet: { registered: true, setUp: true, balanceIn: 10_000_000n, usdc: 10_000_000n },
      tokenIn: "0x3600000000000000000000000000000000000000",
      tokenOut: "0x1111111111111111111111111111111111111111",
      symbolIn: "USDC",
      decimalsIn: 6,
      tokenInIsUsdc: true,
      amount: { status: "ok", baseUnits: 1_000_000n },
      quote: { status: "ok", estimatedOut: 1n, minOut: 1n, slippageBps: 50, rateGapBps: 0 },
      thresholds: { gasFloat: 50_000n, maxRateGapBps: 300, warnRateGapBps: 200 },
      tokenRules: { safety: "ok", reasons: [], unverified: true, tradeUsd: 1, spentTodayUsd: 0, perTradeUsd: 25, perDayUsd: 500, access },
    });
  assert.equal(facts("verified").blocking?.code, "TOKEN_RULE_ACCESS");
  assert.equal(facts("warned").blocking, undefined);
});
