// Stage 9: the parts of push and email that are pure — quiet hours in the person's time zone, and the words.
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderNotification } from "../src/notify/render";
import { quietUntil } from "../src/notify/service";

const night = { start: "22:00", end: "07:00" };

test("quiet hours across midnight hold push until they end, in the person's time zone", () => {
  // 23:30 in Lagos (UTC+1) is 22:30 UTC: inside; ends at 07:00 Lagos = 06:00 UTC.
  const until = quietUntil(night, "Africa/Lagos", new Date("2026-10-01T22:30:00Z"));
  assert.equal(until?.toISOString(), "2026-10-02T06:00:00.000Z");
  // 06:59 local is still inside; 07:00 is not.
  assert.ok(quietUntil(night, "Africa/Lagos", new Date("2026-10-02T05:59:00Z")));
  assert.equal(quietUntil(night, "Africa/Lagos", new Date("2026-10-02T06:00:00Z")), undefined);
  // Midday: outside.
  assert.equal(quietUntil(night, "Asia/Kolkata", new Date("2026-10-01T06:30:00Z")), undefined);
  // Off, or a zero-length window: never held.
  assert.equal(quietUntil(null, "UTC", new Date()), undefined);
  assert.equal(quietUntil({ start: "08:00", end: "08:00" }, "UTC", new Date("2026-10-01T08:00:00Z")), undefined);
  // A same-day window (13:00–15:00 UTC).
  assert.equal(quietUntil({ start: "13:00", end: "15:00" }, "UTC", new Date("2026-10-01T14:00:00Z"))?.toISOString(), "2026-10-01T15:00:00.000Z");
});

test("a notification says what happened, in the person's language, testnet first", () => {
  const received = renderNotification(
    { kind: "payment_received", network: "testnet", params: { amount: "1250000", asset: "USDC", from: "0x1111111111111111111111111111111111111111", name: "Alex" } },
    "en",
  );
  assert.equal(received.title, "Testnet · Received 1.25 USDC");
  assert.equal(received.body, "From Alex");
  assert.equal(received.path, "/inbox");

  const sentFr = renderNotification({ kind: "send_completed", network: "mainnet", params: { amount: "20000000", asset: "EURC", to: "0x2222222222222222222222222222222222222222" } }, "fr");
  assert.ok(!sentFr.title.startsWith("Réseau"), "mainnet is not prefixed");
  assert.match(sentFr.title, /20,00/);
  assert.match(sentFr.body, /0x2222…2222/);

  const alert = renderNotification({ kind: "rule_alert", network: "testnet", params: { trigger: "balance_below", threshold: "20000000", balance: "15000000" } }, "en");
  assert.equal(alert.title, "Testnet · Your balance dropped below 20.00 USDC");
  assert.equal(alert.body, "Balance 15.00 USDC");
  assert.equal(alert.path, "/automations");
});
