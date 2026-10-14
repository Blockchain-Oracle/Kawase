// Scan to pay: how codes are read (no database, no chain).
import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePayCode, scaledAmount } from "../src/paycodes/parse";

const HOSTS = ["app.getkawase.xyz", "api.getkawase.xyz"];
const USDC = "0x3600000000000000000000000000000000000000";
const PERSON = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
const decimals = (token: string) => (token.toLowerCase() === USDC ? 6 : null);

test("amounts scale exactly, scientific notation included", () => {
  assert.equal(scaledAmount("2500000", 6), "2.5");
  assert.equal(scaledAmount("2.5e6", 6), "2.5");
  assert.equal(scaledAmount("1e18", 18), "1");
  assert.equal(scaledAmount("15", 6), "0.000015");
  assert.equal(scaledAmount("abc", 6), null);
});

test("a bare address, any case, is a send to it", () => {
  assert.deepEqual(parsePayCode(PERSON.toLowerCase(), HOSTS, decimals), { kind: "address", address: PERSON, chainId: null, token: null, native: false, amount: null });
});

test("EIP-681: native value and ERC-20 transfer, with the chain", () => {
  const native = parsePayCode(`ethereum:${PERSON}@5042002?value=1.5e18`, HOSTS, decimals);
  assert.deepEqual(native, { kind: "address", address: PERSON, chainId: 5042002, token: null, native: true, amount: "1.5" });
  const transfer = parsePayCode(`ethereum:${USDC}@8453/transfer?address=${PERSON}&uint256=2.5e6`, HOSTS, decimals);
  assert.deepEqual(transfer, { kind: "address", address: PERSON, chainId: 8453, token: USDC, native: false, amount: "2.5" });
  assert.equal(parsePayCode(`ethereum:${USDC}/approve?address=${PERSON}&uint256=1`, HOSTS, decimals).kind, "unknown");
});

test("Kawase links: request and app scheme; other hosts are not trusted", () => {
  assert.deepEqual(parsePayCode("https://app.getkawase.xyz/r/abcDEF123_-xyz", HOSTS, decimals), { kind: "request", token: "abcDEF123_-xyz" });
  assert.deepEqual(parsePayCode("kawase://r/abcDEF123_-xyz", HOSTS, decimals), { kind: "request", token: "abcDEF123_-xyz" });
  assert.equal(parsePayCode("https://api.getkawase.xyz/invoices/public/abcDEF123_-xyz/document", HOSTS, decimals).kind, "unknown", "the retired invoice link is no longer a payment");
  assert.equal(parsePayCode("https://kawase-pay.example/r/abcDEF123_-xyz", HOSTS, decimals).kind, "unknown");
  assert.equal(parsePayCode("hello", HOSTS, decimals).kind, "unknown");
});
