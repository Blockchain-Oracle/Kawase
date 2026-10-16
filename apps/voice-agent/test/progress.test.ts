import assert from "node:assert/strict";
import { test } from "node:test";

import { routeProgress } from "../src/progress";

const quote = {
  toolName: "race_routes",
  toolCallId: "route",
  output: {
    status: "done",
    request: { kind: "swap", from: "USDC", to: "EURC", amount: "1" },
    race: {
      best: "app_kit",
      rows: [{ venue: "app_kit", status: "quoted", executable: true, receive: { amount: "1167498", decimals: 6, symbol: "EURC" } }],
    },
  },
};

test("a finished route yields one explicitly provisional update from its exact amount", () => {
  assert.equal(routeProgress(quote), "The route comparison estimates about 1.167498 EURC for 1 USDC. I'm checking the final quote; it may change.");
  assert.equal(routeProgress(quote, true), "For 1 USDC, the early estimate is about 1.17 EURC. It can change before the swap is ready.");
});

test("unavailable, non executable, and mismatched quotes are never spoken as progress", () => {
  assert.equal(routeProgress({ ...quote, output: { ...quote.output, status: "racing" } }), undefined);
  assert.equal(routeProgress({ ...quote, output: { ...quote.output, race: { ...quote.output.race, rows: [{ ...quote.output.race.rows[0], executable: false }] } } }), undefined);
  assert.equal(routeProgress({ ...quote, output: { ...quote.output, race: { ...quote.output.race, rows: [{ ...quote.output.race.rows[0], receive: { amount: "1167498", decimals: 6, symbol: "USDC" } }] } } }), undefined);
});
