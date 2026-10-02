// `GET /public/stats`: aggregate counts only, no session needed, nothing personal in the payload.
// Runs against the local database: pnpm --filter @kawase/api test
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { NETWORK_IDS } from "@kawase/networks";

import { HTTP } from "../src/http/problem";
import { PUBLIC_ACTION_KINDS } from "../src/public/service";
import { fakeTurnkey, testApp } from "./helpers";

const { app, close } = testApp(fakeTurnkey({}));
after(close);

const PERSONAL_KEYS = /email|address|handle|userId|user_id|amount|hash|token|"id"/i;

test("public stats are aggregate counts, open without a session", async () => {
  const response = await app.request("/public/stats");
  assert.equal(response.status, HTTP.ok);
  const text = await response.text();
  assert.doesNotMatch(text, PERSONAL_KEYS);
  const stats = JSON.parse(text) as Record<string, unknown> & {
    networks: Record<string, { completed: Record<string, number>; automationRuns: number; activeAutomations: number }>;
  };
  assert.deepEqual(Object.keys(stats).sort(), ["accounts", "generatedAt", "guests", "networks"]);
  assert.ok(Number.isInteger(stats.accounts) && Number.isInteger(stats.guests));
  for (const network of NETWORK_IDS) {
    const row = stats.networks[network];
    assert.ok(row, `missing ${network}`);
    assert.deepEqual(Object.keys(row.completed).sort(), [...PUBLIC_ACTION_KINDS].sort());
    for (const value of [...Object.values(row.completed), row.automationRuns, row.activeAutomations])
      assert.ok(Number.isInteger(value) && value >= 0);
  }
});
