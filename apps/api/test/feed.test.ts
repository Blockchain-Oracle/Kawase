// The agent's feed (front-door lane, D37 "watch it work"): GET /feed groups what Kawase did — Done · Held · Skipped ·
// Watching · Found — with the next scheduled run's countdown. Everything here is made through the real services and
// routes on a scratch database, reading Arc testnet (no money moves, no transaction is sent):
// - a practice automation whose run came due: the run is driven by the automation runner ("would have") → Done;
// - the same person skips the next run of another automation → Skipped, and it keeps watching → Watching + countdown;
// - a send they drafted and did not approve → Held;
// - For you, as the person's Home shows it → Found (whatever it has to say for a fresh wallet).
// The feed router is mounted here exactly as the lead mounts it in app.ts.
// Needs the testnet relayer and ops wallet in the root .env (to read Arc testnet); run against a scratch database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { AgentFeed, AutomationView, FeedPage, SendIntent, SuggestionsView } from "@kawase/api-client";
import { automations } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";

import { attachSession } from "../src/auth/middleware";
import { feedRoutes } from "../src/feed/routes";
import { FeedService } from "../src/feed/service";
import type { AppEnv, SessionUser } from "../src/types";
import { createChains } from "../src/wallet/chain";
import { deleteUser, expectStatus, jsonRequest, privyPerson, privySignIn, testApp } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const live = Boolean(process.env.RELAYER_PRIVATE_KEY_TESTNET && process.env.OPS_WALLET_ADDRESS_TESTNET);
const POLL_MS = 1000;
const POLL_ATTEMPTS = 30;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("GET /feed: real rows from the real services, grouped, with the next run's countdown", { skip: !live, timeout: 180_000 }, async () => {
  const env = loadApiEnv();
  const chains = createChains(env);
  const wallet = privateKeyToAccount(generatePrivateKey());
  const TEST_ID = randomUUID();
  const person = privyPerson(`feed-${TEST_ID}@example.test`, wallet.address);
  const { app, db, close } = testApp(chains, undefined, undefined, undefined, undefined, undefined, { automationTickMs: 500 });
  let userId = "";
  after(async () => {
    if (userId) await deleteUser(db, userId);
    await close();
  });

  const signIn = await privySignIn(app, person, { platform: "ios", installationId: `feed-${TEST_ID.slice(0, 8)}` });
  await expectStatus(signIn, 201, "sign-in");
  const { token, user } = (await signIn.json()) as { token: string; user: { id: string } };
  userId = user.id;
  const call = (method: string, path: string, payload?: unknown) => app.request(path, payload === undefined ? { method, headers: { authorization: `Bearer ${token}` } } : jsonRequest(method, payload, token));
  const json = async <T>(response: Response | Promise<Response>, what: string, status = 200) => {
    const answer = await response;
    await expectStatus(answer, status, what);
    return (await answer.json()) as T;
  };
  const bob = privateKeyToAccount(generatePrivateKey()).address;
  await expectStatus(await call("POST", "/contacts", { displayName: "Bob", address: bob, source: "pasted" }), 201, "bob");

  // Watching, then Skipped: a weekly practice send to Bob, whose next run the person skips (it keeps watching).
  const weekly = (await json<{ automation: AutomationView }>(call("POST", "/automations", { recipient: "Bob", amount: "0.5", every: "week" }), "weekly", 201)).automation;
  await json(call("POST", `/automations/${weekly.id}/practice`), "weekly practice");
  await json(call("POST", `/automations/${weekly.id}/skip`), "skip next");
  // Done: a daily practice send whose run comes due now; the automation runner drives it ("would have", nothing moves).
  const daily = (await json<{ automation: AutomationView }>(call("POST", "/automations", { recipient: "Bob", amount: "0.25", every: "day" }), "daily", 201)).automation;
  await json(call("POST", `/automations/${daily.id}/practice`), "daily practice");
  await db.update(automations).set({ nextRunAt: new Date(Date.now() - 1000) }).where(eq(automations.id, daily.id));
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await wait(POLL_MS);
    if ((await json<{ automation: AutomationView }>(call("GET", `/automations/${daily.id}`), "daily view")).automation.runs.some((run) => run.status === "practiced")) break;
  }
  // Held: a send the person drafted and has not approved.
  const held = (await json<{ intent: SendIntent }>(call("POST", "/sends", { recipient: "Bob", amount: "0.04", asset: "USDC" }), "send", 201)).intent;

  // The feed router as the lead mounts it, over the same services the app serves Activity and For you from.
  const log = createLogger({ service: "api-test", level: "silent" });
  const asPerson = <T>(path: string) => json<T>(call("GET", path), path);
  const feed = new FeedService(
    db,
    {
      activity: { list: (_user: SessionUser, network) => asPerson<FeedPage>(`/activity?network=${network}`) },
      suggestions: { list: () => asPerson<SuggestionsView>("/suggestions"), dismiss: async () => undefined },
    },
    log,
  );
  const server = new Hono<AppEnv>();
  server.use("*", async (c, next) => {
    c.set("log", log);
    await next();
  });
  server.use("*", attachSession(db));
  server.route("/feed", feedRoutes(feed));
  const answer = await server.request("/feed?network=testnet", { headers: { authorization: `Bearer ${token}` } });
  await expectStatus(answer, 200, "feed");
  const page = (await answer.json()) as AgentFeed;

  console.log(page.groups.map((group) => `${group.group} ${group.count}: ${group.items.map((item) => `${item.kind}/${item.outcome}${item.reason ? ` ${item.reason}` : ""}`).join(", ")}`).join("\n"));
  assert.deepEqual(page.groups.map((group) => group.group), ["done", "held", "skipped", "watching", "found"]);
  const group = (name: AgentFeed["groups"][number]["group"]) => page.groups.find((entry) => entry.group === name)!.items;
  const practiced = group("done").find((item) => item.automationId === daily.id);
  assert.ok(practiced, "the practised run is Done");
  assert.equal(practiced!.outcome, "practiced");
  assert.equal(practiced!.origin, "automation");
  assert.ok(practiced!.runId);
  const skipped = group("skipped").find((item) => item.automationId === weekly.id);
  assert.equal(skipped?.reason, "SKIPPED_BY_YOU", "the skipped run is Skipped, with its why");
  const waiting = group("held").find((item) => item.intentId === held.id);
  assert.ok(waiting, "the drafted send is Held");
  assert.equal(waiting!.origin, "you");
  assert.deepEqual(waiting!.asked, { amount: "0.04", from: "USDC", to: "Bob" });
  const watched = group("watching").filter((item) => item.source === "automation");
  assert.deepEqual(watched.map((item) => item.automationId).sort(), [daily.id, weekly.id].sort(), "both automations are Watching");
  // The countdown: the soonest next run (the daily one, rescheduled after its run).
  assert.ok(page.next, "a next run to count down to");
  assert.equal(page.next!.at, watched.map((item) => item.at).sort()[0]);
  assert.ok(Date.parse(page.next!.at) > Date.now(), "the next run is ahead");
  assert.deepEqual(page.partial, [], "every source answered");
  assert.equal(group("found").length, page.groups.find((entry) => entry.group === "found")!.count);
});
