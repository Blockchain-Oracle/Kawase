// The readback guard: what GPT-Live says must match the turn's facts (amounts, assets, @handles, network).
import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalFacts, factsOf, normalizeNumber, readbackProblems } from "../src/readback";

const line = "A payment draft is ready: 10 USDC to @amina on Arc Testnet. Tap the card to review and approve it.";

test("numbers normalize across locales", () => {
  assert.equal(normalizeNumber("10.00"), "10");
  assert.equal(normalizeNumber("1,234.50"), "1234.5");
  assert.equal(normalizeNumber("1 234,5"), "1234.5");
  assert.equal(normalizeNumber("12,45"), "12.45");
  assert.equal(normalizeNumber("1.000.000"), "1000000");
});

test("a faithful paraphrase passes", () => {
  assert.deepEqual(readbackProblems("I've got 10 USDC ready for @amina on testnet — tap the card to approve.", factsOf(line)), []);
  assert.deepEqual(readbackProblems("Votre paiement de 10,00 USDC pour @amina est prêt.", factsOf(line)), []);
});

test("a wrong amount, asset, recipient or network is caught", () => {
  const facts = factsOf(line);
  assert.match(readbackProblems("I've sent 100 USDC to @amina.", facts).join(), /amount 100/);
  assert.match(readbackProblems("10 EURC is ready for @amina.", facts).join(), /asset EURC/);
  assert.match(readbackProblems("10 USDC is ready for @amira.", facts).join(), /recipient @amira/);
  assert.match(readbackProblems("10 USDC on mainnet is ready.", facts).join(), /network mainnet/);
});

test("numbers that are not amounts are ignored", () => {
  assert.deepEqual(readbackProblems("It takes about 2 minutes, then tap the card.", factsOf(line)), []);
});

test("canonical facts come from the tool summaries", () => {
  const facts = canonicalFacts([
    { toolName: "propose_send", toolCallId: "1", output: { summary: "Send 10 USDC to @amina on testnet, awaiting the card tap." } },
    { toolName: "get_balance", toolCallId: "2", output: { summary: { USDC: "12.45" } } },
    { toolName: "noise", toolCallId: "3", output: { other: true } },
  ]);
  assert.equal(facts, 'propose_send: Send 10 USDC to @amina on testnet, awaiting the card tap.\nget_balance: {"USDC":"12.45"}');
});
