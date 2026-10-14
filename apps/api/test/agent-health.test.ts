// The model's self-test (D10, front-door lane): one trivial tool call when the api starts and every 10 minutes. While it
// fails, /agent/chat answers a typed "agent_offline" at once and /agent/health says so before the person types.
// - The failure path injects the failure (no call is made): a bad key looks like this to the api.
// - The live path makes ONE real call to the configured chat model, only with LIVE_MODEL_SELF_TEST=1 (and a key).
import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "dotenv";
import { Hono } from "hono";

import { createModels, selfTestModel, type SelfTestResult } from "@kawase/agent";
import type { AgentHealth } from "@kawase/api-client";
import { createLogger } from "@kawase/log";

import { createModelHealth } from "../src/agent/health";
import { agentRoutes } from "../src/agent/routes";
import type { AppEnv } from "../src/types";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const log = createLogger({ service: "api-test", level: "silent" });
const keyed = { forRole: () => "openai:test" as never, hasKeyFor: () => true };

/** The agent's routes as the app mounts them, for one signed-in person; the turn runner is never reached offline. */
function agentApp(health: ReturnType<typeof createModelHealth>) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("log", log);
    c.set("userId", "user-1");
    c.set("user", { id: "user-1", activeNetwork: "testnet", isAnonymous: false } as never);
    await next();
  });
  const runner = {
    run: async () => {
      throw new Error("the turn must not start while the agent is offline");
    },
    ownThread: async () => true,
    loadMessages: async () => [],
  };
  app.route("/agent", agentRoutes({ db: {} as never, models: keyed as never, health } as never, runner as never));
  return app;
}

const chat = (app: Hono<AppEnv>) =>
  app.request("/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", message: { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] } }),
  });

test("a failing self-test (a bad key) makes the agent offline: /agent/chat answers agent_offline, typed, at once", async () => {
  let calls = 0;
  const badKey = async (): Promise<SelfTestResult> => (calls++, { ok: false, ms: 120, reason: "http_401" });
  const health = createModelHealth({ models: keyed as never, modelId: "openai:gpt-5.6-luna", log, selfTest: badKey, now: () => new Date("2026-10-14T12:00:00.000Z") });
  assert.equal(health.status().status, "unknown", "before the first check");
  const checked = await health.check();
  assert.deepEqual(checked, { status: "offline", checkedAt: "2026-10-14T12:00:00.000Z", model: "openai:gpt-5.6-luna", reason: "http_401" });
  assert.equal(calls, 1);

  const app = agentApp(health);
  const answer = await chat(app);
  assert.equal(answer.status, 503);
  assert.equal(answer.headers.get("content-type"), "application/problem+json");
  const body = (await answer.json()) as { type: string; health: AgentHealth };
  assert.equal(body.type, "https://kawase.xyz/problems/agent_offline");
  assert.equal(body.health.reason, "http_401");
  const seen = (await (await app.request("/agent/health")).json()) as { health: AgentHealth };
  assert.equal(seen.health.status, "offline");
});

test("checks never pile up, and a passing check brings the agent back", async () => {
  let release: (result: SelfTestResult) => void = () => undefined;
  let calls = 0;
  const slow = () => (calls++, new Promise<SelfTestResult>((resolve) => (release = resolve)));
  const health = createModelHealth({ models: keyed as never, modelId: "openai:gpt-5.6-luna", log, selfTest: slow });
  const first = health.check();
  const second = health.check();
  health.reportFailure("http_429");
  assert.equal(calls, 1, "one check at a time, a failed turn's confirm included");
  release({ ok: true, ms: 800 });
  assert.equal((await first).status, "online");
  assert.equal((await second).status, "online");
  assert.equal(health.status().reason, null);
});

test("one failed turn never takes everyone offline: it asks for a check at once, and the check decides", async () => {
  const results: SelfTestResult[] = [{ ok: true, ms: 1 }, { ok: true, ms: 1 }];
  let calls = 0;
  const health = createModelHealth({ models: keyed as never, modelId: "m", log, selfTest: async () => (calls++, results.shift() ?? { ok: true, ms: 1 }), minCheckGapMs: 0 });
  await health.check();
  assert.equal(health.status().status, "online");
  health.reportFailure("http_429");
  assert.equal(health.status().status, "online", "one turn's 429 is not the provider's verdict");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls, 2, "a confirming check ran at once");
  assert.equal(health.status().status, "online", "the check passed: still online for everyone");
});

test("a failure confirmed by the check retries within the offline interval, and a passing check brings it back", async () => {
  const results: SelfTestResult[] = [{ ok: true, ms: 1 }, { ok: false, ms: 1, reason: "http_401" }, { ok: true, ms: 1 }];
  let calls = 0;
  const health = createModelHealth({
    models: keyed as never,
    modelId: "m",
    log,
    selfTest: async () => (calls++, results.shift() ?? { ok: true, ms: 1 }),
    intervalMs: 60_000,
    retryOfflineMs: 20,
    minCheckGapMs: 0,
  });
  const stop = health.start();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(health.status().status, "online", "start-up check");
  // The 10-minute timer is pending; a turn fails on the provider and the confirming check fails too.
  health.reportFailure("http_401");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(health.status().status, "offline");
  assert.equal(calls, 2);
  // The pending 10-minute timer was replaced by the offline retry: back online well before it.
  await new Promise((resolve) => setTimeout(resolve, 60));
  stop();
  assert.equal(calls, 3, "retried within the offline interval");
  assert.equal(health.status().status, "online");
});

test("Check again runs a fresh check while offline, at most once per gap for the whole api; online it makes no call", async () => {
  const results: SelfTestResult[] = [{ ok: false, ms: 1, reason: "http_500" }, { ok: true, ms: 1 }];
  let calls = 0;
  const health = createModelHealth({ models: keyed as never, modelId: "m", log, selfTest: async () => (calls++, results.shift() ?? { ok: true, ms: 1 }), minCheckGapMs: 30 });
  await health.check();
  const app = agentApp(health);
  const read = async () => ((await (await app.request("/agent/health")).json()) as { health: AgentHealth }).health;
  assert.equal((await read()).status, "offline", "inside the gap: the latest result, no call");
  assert.equal(calls, 1);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal((await read()).status, "online", "after the gap: a fresh check brings it back");
  assert.equal(calls, 2);
  assert.equal((await read()).status, "online");
  assert.equal(calls, 2, "online: no call");
});

test("the timer checks at start and keeps checking until stopped", async () => {
  let calls = 0;
  const health = createModelHealth({ models: keyed as never, modelId: "m", log, selfTest: async () => (calls++, { ok: true, ms: 1 }), intervalMs: 5 });
  const stop = health.start();
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();
  const seen = calls;
  assert.ok(seen >= 2, `checked ${seen} times`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, seen, "no check after stop");
});

test("without a key the self-test fails fast and makes no call", async () => {
  const result = await selfTestModel(createModels({}));
  assert.deepEqual(result, { ok: false, ms: 0, reason: "no_key" });
});

test("live: the configured chat model answers the self-test with a real tool call", { skip: !(process.env.LIVE_MODEL_SELF_TEST === "1" && process.env.OPENAI_API_KEY) }, async () => {
  const models = createModels({ openai: process.env.OPENAI_API_KEY! }, process.env.KAWASE_MODEL_AGENT_CHAT ? { agentChat: process.env.KAWASE_MODEL_AGENT_CHAT as never } : {});
  const result = await selfTestModel(models);
  console.log("self-test", JSON.stringify(result));
  assert.equal(result.ok, true, JSON.stringify(result));
});
