// Display currency (B2-3, plan §A.4 14) against the live free rate source: the rate for a currency Kawase offers, the
// person's choice saved (and an unknown one refused), the portfolio converting with it, and the agent told to say
// dollar values in it (the instruction line; no model is called).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import type { FxView, PortfolioView } from "@kawase/api-client";
import { instructions, type AgentContext } from "@kawase/agent";

import { liveMarketData } from "../src/market/sources";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

const EUR_LOW = 0.5;
const EUR_HIGH = 1.5;

test("display currency: rate, choice, portfolio and the agent's line", { timeout: 60_000 }, async () => {
  const TEST_ID = randomUUID();
  const person = privyPerson(`fx-${TEST_ID}@example.test`);
  const { app, db, close } = testApp(undefined, undefined, undefined, undefined, undefined, undefined, { market: liveMarketData() });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });

  // 1. Today's rate from the free source, public.
  const eur = ((await (await app.request("/fx?currency=EUR")).json()) as { fx: FxView }).fx;
  assert.equal(eur.currency, "EUR");
  assert.ok(eur.perUsd > EUR_LOW && eur.perUsd < EUR_HIGH, `EUR per USD ${eur.perUsd}`);
  assert.ok(eur.supported.includes("NGN"));
  assert.equal((await app.request("/fx?currency=XYZ")).status, 422);

  // 2. The person chooses it (any case); an unknown code is refused.
  const signIn = await privySignIn(app, person, { platform: "ios", installationId: "fx-phone-0001" });
  await expectStatus(signIn, 201, "sign-in");
  const { token } = (await signIn.json()) as { token: string };
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const chosen = (await (await call("PATCH", "/me", { displayCurrency: "ngn" })).json()) as { user: { id: string; displayCurrency: string } };
  userId = chosen.user.id;
  assert.equal(chosen.user.displayCurrency, "NGN");
  assert.equal((await call("PATCH", "/me", { displayCurrency: "XYZ" })).status, 400);

  // 3. Its rate is the session's default, and the portfolio converts with it.
  const own = ((await (await call("GET", "/fx")).json()) as { fx: FxView }).fx;
  assert.equal(own.currency, "NGN");
  const { portfolio } = (await (await call("GET", "/portfolio")).json()) as { portfolio: PortfolioView };
  assert.equal(portfolio.fx.currency, "NGN");
  assert.equal(portfolio.fx.perUsd, own.perUsd);

  // 4. The agent is told to say dollar values in it.
  const line = instructions({ network: "testnet", locale: "en", languageName: "English", isGuest: false, handle: null, surface: "chat", display: { currency: "NGN", perUsd: own.perUsd } } as unknown as AgentContext);
  assert.match(line, /display currency is NGN \(1 USD = [\d.]+ NGN today\)/);
});
