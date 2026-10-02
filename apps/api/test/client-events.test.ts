// The client-event beacon: no account needed, bounded bodies, its own rate limit.
// Runs against the local database: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { fakeTurnkey, jsonRequest, testApp } from "./helpers";

const { app, close } = testApp(fakeTurnkey({}));
after(close);

const event = {
  stage: "code",
  outcome: "failed",
  category: "other",
  code: "UNKNOWN",
  message: "Failed to complete OTP <- crypto.getRandomValues must be defined",
  attemptId: randomUUID(),
  appVersion: "1.0.0",
  buildNumber: "6",
  platform: "ios",
};

const from = (ip: string, body: unknown): RequestInit => {
  const init = jsonRequest("POST", body);
  return { ...init, headers: { ...(init.headers as Record<string, string>), "x-forwarded-for": ip } };
};

test("a failure report is accepted without an account", async () => {
  const response = await app.request("/client-events", from("203.0.113.1", event));
  assert.equal(response.status, 204);
});

test("a report that isn't one is refused", async () => {
  const response = await app.request("/client-events", from("203.0.113.2", { ...event, outcome: "ok", stage: "" }));
  assert.equal(response.status, 400);
});

test("one client can't flood the log", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 25; i++) statuses.push((await app.request("/client-events", from("203.0.113.3", event))).status);
  assert.equal(statuses.filter((status) => status === 204).length, 20);
  assert.equal(statuses.at(-1), 429);
});
